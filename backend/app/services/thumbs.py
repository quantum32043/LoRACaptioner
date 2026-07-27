from pathlib import Path
from PIL import Image, ImageOps

from app.config import settings


def _thumb_path(filename: str) -> Path:
    cache = Path(settings.thumb_cache_path)
    cache.mkdir(parents=True, exist_ok=True)
    return cache / f"{Path(filename).stem}.webp"


def _source_path(filename: str) -> Path:
    return Path(settings.dataset_path) / filename


def get_thumb(filename: str) -> bytes | None:
    thumb = _thumb_path(filename)
    src = _source_path(filename)

    if thumb.exists() and src.exists():
        src_mtime = src.stat().st_mtime
        thumb_mtime = thumb.stat().st_mtime
        if thumb_mtime >= src_mtime:
            return thumb.read_bytes()

    return _generate_thumb(filename)


def _generate_thumb(filename: str) -> bytes | None:
    src = _source_path(filename)
    if not src.exists():
        return None

    size = settings.thumb_size
    thumb = _thumb_path(filename)

    try:
        img = Image.open(src)
        img = ImageOps.contain(img, (size, size))
        img.save(thumb, "WEBP", quality=85)
        return thumb.read_bytes()
    except Exception:
        return None