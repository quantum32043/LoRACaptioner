import asyncio
import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.services.dataset import dataset_service
from app.services.auto_tag import (
    auto_tag_service,
    ModelNotDownloadedError,
    TASK_MODES,
)
from app.utils import safe_join

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auto-tag", tags=["auto-tag"])


class GenerateRequest(BaseModel):
    filename: str
    task: str | None = None


class GenerateBatchRequest(BaseModel):
    filenames: list[str]
    task: str | None = None


class GenerateUntaggedRequest(BaseModel):
    task: str | None = None


class SetTaskModeRequest(BaseModel):
    mode: str


@router.get("/status")
async def status():
    return auto_tag_service.get_status()


@router.get("/modes")
async def modes():
    return {"modes": auto_tag_service.get_available_modes(), "current": auto_tag_service.task_mode}


@router.post("/set-mode")
async def set_mode(req: SetTaskModeRequest):
    if req.mode not in TASK_MODES:
        raise HTTPException(status_code=400, detail=f"Unknown mode: {req.mode}")
    auto_tag_service.task_mode = req.mode
    return {"status": "ok", "mode": req.mode}


@router.post("/unload")
async def unload():
    auto_tag_service.unload()
    return {"status": "ok", "state": auto_tag_service.state.value}


@router.get("/download")
async def download():
    if auto_tag_service.state.value in ("downloading", "loading", "ready"):
        raise HTTPException(status_code=409, detail=f"Model already in state: {auto_tag_service.state.value}")

    async def event_stream():
        queue: asyncio.Queue = asyncio.Queue()

        def on_progress(progress):
            data = progress.to_dict()
            payload = f"event: progress\ndata: {json.dumps(data)}\n\n"
            queue.put_nowait(payload)

        yield "event: start\ndata: {}\n\n"
        await asyncio.sleep(0)

        download_task = asyncio.create_task(
            auto_tag_service.download_model(progress_callback=on_progress)
        )

        heartbeat_interval = 30
        poll_interval = 0.3
        ticks_since_heartbeat = 0

        try:
            while True:
                done, _ = await asyncio.wait(
                    [download_task], timeout=poll_interval
                )
                while not queue.empty():
                    yield queue.get_nowait()
                    await asyncio.sleep(0)
                if done:
                    await download_task
                    break

                ticks_since_heartbeat += 1
                if ticks_since_heartbeat >= heartbeat_interval:
                    yield f": heartbeat {ticks_since_heartbeat}\n\n"
                    await asyncio.sleep(0)
                    ticks_since_heartbeat = 0

            yield "event: complete\ndata: {}\n\n"
            await asyncio.sleep(0)
        except Exception as e:
            logger.error(f"Download failed: {e}")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            await asyncio.sleep(0)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/generate")
async def generate(req: GenerateRequest):
    if auto_tag_service.state.value == "downloading":
        raise HTTPException(status_code=409, detail="Model is currently downloading")

    safe_join(settings.dataset_path, req.filename)
    image_path = f"{settings.dataset_path}/{req.filename}"

    try:
        caption = await auto_tag_service.generate(image_path, task=req.task)
    except ModelNotDownloadedError:
        raise HTTPException(status_code=412, detail="Model not downloaded. Call /api/auto-tag/download first.")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    await dataset_service.save_caption(req.filename, caption)
    return {"filename": req.filename, "caption": caption}


@router.post("/generate-batch")
async def generate_batch(req: GenerateBatchRequest):
    if auto_tag_service.state.value == "downloading":
        raise HTTPException(status_code=409, detail="Model is currently downloading")

    async def event_stream():
        total = len(req.filenames)
        results = {}
        heartbeat_interval = 30
        ticks = 0

        try:
            for i, filename in enumerate(req.filenames):
                safe_join(settings.dataset_path, filename)
                image_path = f"{settings.dataset_path}/{filename}"

                yield f"event: progress\ndata: {json.dumps({'current': i, 'total': total, 'filename': filename})}\n\n"
                await asyncio.sleep(0)

                try:
                    caption = await auto_tag_service.generate(image_path, task=req.task)
                except Exception as e:
                    logger.error(f"Failed to generate for {filename}: {e}")
                    caption = ""
                    yield f"event: error\ndata: {json.dumps({'filename': filename, 'error': str(e)})}\n\n"
                    await asyncio.sleep(0)

                if caption:
                    await dataset_service.save_caption(filename, caption)
                    results[filename] = caption

                yield f"event: result\ndata: {json.dumps({'filename': filename, 'caption': caption})}\n\n"
                await asyncio.sleep(0)

                ticks += 1
                if ticks % heartbeat_interval == 0:
                    yield f": heartbeat {ticks}\n\n"
                    await asyncio.sleep(0)

            yield f"event: done\ndata: {json.dumps({'count': len(results), 'total': total})}\n\n"
            await asyncio.sleep(0)
        except asyncio.CancelledError:
            logger.info("Batch generation cancelled by client")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/generate-untagged")
async def generate_untagged(req: GenerateUntaggedRequest):
    items, _ = dataset_service.get_items(only_untagged=True)
    filenames = [item.filename for item in items]
    batch_req = GenerateBatchRequest(filenames=filenames, task=req.task)
    return await generate_batch(batch_req)
