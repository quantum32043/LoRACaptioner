from fastapi import APIRouter, HTTPException, UploadFile, File
from pathlib import Path
from app.models import BatchRequest, TriggerAddRequest, ItemsResponse, Stats, StatusResponse, BatchResponse, RescanResponse
from app.services.dataset import dataset_service
from app.config import settings
from app.utils import safe_join

router = APIRouter(prefix="/dataset")

@router.get("/items")
async def get_items(offset: int = 0, limit: int = 20000, only_untagged: bool = False, search: str | None = None) -> ItemsResponse:
    items, total = dataset_service.get_items(offset=offset, limit=limit, only_untagged=only_untagged, search=search)
    return ItemsResponse(items=items, total=total)

@router.get("/stats")
async def get_stats() -> Stats:
    return Stats(**dataset_service.get_stats())

@router.put("/caption")
async def save_caption(filename: str, caption: str) -> StatusResponse:
    safe_join(settings.dataset_path, filename)
    if not (Path(settings.dataset_path) / filename).exists():
        raise HTTPException(status_code=404, detail="File not found")
    await dataset_service.save_caption(filename, caption)
    return StatusResponse(status="ok")

@router.post("/upload-folder")
async def upload_folder(files: list[UploadFile] = File(...)) -> dict:
    saved = 0
    for f in files:
        if not f.filename:
            continue
        flat = Path(f.filename).name
        safe_join(settings.dataset_path, flat)
        data = await f.read()
        dest = Path(settings.dataset_path) / flat
        with open(dest, "wb") as out:
            out.write(data)
        saved += 1
    total = dataset_service.rescan()
    return {"status": "ok", "saved": saved, "total": total}

@router.post("/batch")
async def batch_operation(body: BatchRequest) -> BatchResponse:
    result = await dataset_service.batch(
        op=body.op, value=body.value, value2=body.value2,
        filenames=body.filenames, only_untagged=body.only_untagged,
    )
    return BatchResponse(**result)

@router.post("/trigger-add")
async def trigger_add(body: TriggerAddRequest) -> BatchResponse:
    result = await dataset_service.add_trigger_words(
        trigger_words=body.trigger_words,
        position=body.position,
        filenames=body.filenames,
        only_untagged=body.only_untagged,
    )
    return BatchResponse(**result)


@router.post("/rescan")
async def rescan() -> RescanResponse:
    total = dataset_service.rescan()
    return RescanResponse(status="ok", total=total)