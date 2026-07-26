from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from pathlib import Path
from app.config import settings
from app.utils import safe_join
from app.services.thumbs import get_thumb

router = APIRouter(prefix="/images")

@router.get("/thumb/{filename}")
async def thumb(filename: str) -> Response:
    safe_join(settings.dataset_path, filename)
    data = get_thumb(filename)
    if data is None:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return Response(content=data, media_type="image/webp")

@router.get("/full/{filename}")
async def full(filename: str) -> FileResponse:
    safe_join(settings.dataset_path, filename)
    path = Path(settings.dataset_path) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)