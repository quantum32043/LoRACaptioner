import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.services.dataset import dataset_service
from app.services.auto_tag import auto_tag_service
from app.utils import safe_join


router = APIRouter(prefix="/api/auto-tag", tags=["auto-tag"])


class GenerateRequest(BaseModel):
    filename: str
    task: str = "<GENERATE_PROMPT>"


class GenerateBatchRequest(BaseModel):
    filenames: list[str]
    task: str = "<GENERATE_PROMPT>"


class GenerateUntaggedRequest(BaseModel):
    task: str = "<GENERATE_PROMPT>"


@router.get("/status")
async def status():
    return {
        "available": auto_tag_service.is_available(),
        "device": auto_tag_service.device if auto_tag_service.is_available() else None,
        "model": settings.hf_model_name if auto_tag_service.is_available() else None,
    }


@router.post("/generate")
async def generate(req: GenerateRequest):
    if not auto_tag_service.is_available():
        raise HTTPException(status_code=503, detail="Auto-tag model is not available")

    safe_join(settings.dataset_path, req.filename)
    image_path = f"{settings.dataset_path}/{req.filename}"

    caption = await asyncio.to_thread(
        auto_tag_service.generate, image_path, req.task
    )
    if not caption:
        raise HTTPException(status_code=500, detail="Failed to generate caption")

    await dataset_service.save_caption(req.filename, caption)
    return {"filename": req.filename, "caption": caption}


@router.post("/generate-batch")
async def generate_batch(req: GenerateBatchRequest):
    if not auto_tag_service.is_available():
        raise HTTPException(status_code=503, detail="Auto-tag model is not available")

    results = {}
    for filename in req.filenames:
        safe_join(settings.dataset_path, filename)
        image_path = f"{settings.dataset_path}/{filename}"

        caption = await asyncio.to_thread(
            auto_tag_service.generate, image_path, req.task
        )
        if caption:
            await dataset_service.save_caption(filename, caption)
            results[filename] = caption
        else:
            results[filename] = ""

    return {"results": results, "count": len(results)}


@router.post("/generate-untagged")
async def generate_untagged(req: GenerateUntaggedRequest):
    if not auto_tag_service.is_available():
        raise HTTPException(status_code=503, detail="Auto-tag model is not available")

    items, _ = dataset_service.get_items(only_untagged=True)
    results = {}
    for item in items:
        safe_join(settings.dataset_path, item.filename)
        image_path = f"{settings.dataset_path}/{item.filename}"

        caption = await asyncio.to_thread(
            auto_tag_service.generate, image_path, req.task
        )
        if caption:
            await dataset_service.save_caption(item.filename, caption)
            results[item.filename] = caption
        else:
            results[item.filename] = ""

    return {"results": results, "count": len(results)}
