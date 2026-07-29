import os, re, aiofiles
from pathlib import Path
from app.config import settings
from app.utils import safe_join

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

class DatasetItem:
    __slots__ = ("filename", "caption", "tagged", "mtime")
    def __init__(self, filename: str, caption: str, mtime: float):
        self.filename = filename
        self.caption = caption
        self.tagged = bool(caption and caption.strip())
        self.mtime = mtime

def _thumb_url(filename: str) -> str:
    return f"/api/images/thumb/{filename}"

def _full_url(filename: str) -> str:
    return f"/api/images/full/{filename}"

class DatasetService:
    def __init__(self):
        self._items: dict[str, DatasetItem] = {}
        self._last_scan_mtime: float = 0.0
        self._scanned = False

    def _scan_dir(self) -> None:
        dataset_path = Path(settings.dataset_path)
        dataset_path.mkdir(parents=True, exist_ok=True)
        current_mtime = 0.0
        new_items: dict[str, DatasetItem] = {}
        for entry in sorted(dataset_path.iterdir()):
            if entry.suffix.lower() not in SUPPORTED_EXTENSIONS or not entry.is_file():
                continue
            filename = entry.name
            caption = self._read_caption_sync(filename)
            mtime = entry.stat().st_mtime
            current_mtime = max(current_mtime, mtime)
            new_items[filename] = DatasetItem(filename, caption, mtime)
        self._items = new_items
        self._last_scan_mtime = current_mtime
        self._scanned = True

    def _read_caption_sync(self, filename: str) -> str:
        txt_path = os.path.join(settings.dataset_path, Path(filename).stem + ".txt")
        try:
            with open(txt_path, "r", encoding="utf-8-sig") as f:
                return f.read().strip()
        except (FileNotFoundError, IOError):
            return ""

    def ensure_scanned(self) -> None:
        if not self._scanned:
            self._scan_dir()

    def rescan(self) -> int:
        self._scan_dir()
        return len(self._items)

    def get_items(self, offset: int = 0, limit: int = 20000, only_untagged: bool = False, search: str | None = None) -> tuple[list[dict], int]:
        self.ensure_scanned()
        filtered = list(self._items.values())
        if only_untagged:
            filtered = [item for item in filtered if not item.tagged]
        if search:
            sl = search.lower()
            filtered = [item for item in filtered if sl in item.filename.lower() or sl in item.caption.lower()]
        total = len(filtered)
        page = filtered[offset:offset + limit]
        result = [{"filename": item.filename, "caption": item.caption, "tagged": item.tagged, "thumb_url": _thumb_url(item.filename), "full_url": _full_url(item.filename)} for item in page]
        return result, total

    def get_stats(self) -> dict:
        self.ensure_scanned()
        total = len(self._items)
        tagged = sum(1 for item in self._items.values() if item.tagged)
        return {"total": total, "tagged": tagged, "untagged": total - tagged}

    async def save_caption(self, filename: str, caption: str) -> None:
        self.ensure_scanned()
        safe_join(settings.dataset_path, filename)
        txt_path = os.path.join(settings.dataset_path, Path(filename).stem + ".txt")
        caption = caption.strip()
        if caption:
            async with aiofiles.open(txt_path, mode="w", encoding="utf-8") as f:
                await f.write(caption)
        else:
            try:
                os.remove(txt_path)
            except FileNotFoundError:
                pass
        if filename in self._items:
            self._items[filename].caption = caption
            self._items[filename].tagged = bool(caption)

    async def upload_files(self, files: list[tuple[str, bytes]]) -> int:
        dataset_path = Path(settings.dataset_path)
        dataset_path.mkdir(parents=True, exist_ok=True)
        saved = 0
        for filename, data in files:
            safe_path = dataset_path / filename
            async with aiofiles.open(safe_path, mode="wb") as f:
                await f.write(data)
            saved += 1
        self._scan_dir()
        return saved

    async def batch(self, op: str, value: str, value2: str | None = None, filenames: list[str] | None = None, only_untagged: bool = False) -> dict:
        self.ensure_scanned()
        changed = 0
        items_to_process = [self._items[f] for f in filenames if f in self._items] if filenames is not None else list(self._items.values())
        for item in items_to_process:
            if only_untagged and item.tagged:
                continue
            original = item.caption
            if op == "prepend":
                new_caption = value if not original else (f"{value}, {original}" if value not in original else original)
            elif op == "append":
                new_caption = value if not original else (f"{original}, {value}" if value not in original else original)
            elif op == "remove_tag":
                pattern = re.escape(value.strip())
                new_caption = re.sub(rf",\s*{pattern}\s*", "", re.sub(rf"^{pattern}\s*,?\s*", "", original.strip())).strip()
            elif op == "regex_replace":
                new_caption = re.sub(value, value2 or "", original)
            else:
                continue
            new_caption = new_caption.strip()
            if new_caption == original:
                continue
            item.caption = new_caption
            item.tagged = bool(new_caption)
            changed += 1
            txt_path = os.path.join(settings.dataset_path, Path(item.filename).stem + ".txt")
            if new_caption:
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write(new_caption)
            else:
                try:
                    os.remove(txt_path)
                except FileNotFoundError:
                    pass
        return {"changed": changed, "total": len(items_to_process)}

    async def add_trigger_words(
        self,
        trigger_words: list[str],
        position: str = "prepend",
        filenames: list[str] | None = None,
        only_untagged: bool = False,
    ) -> dict:
        self.ensure_scanned()
        changed = 0
        items_to_process = [self._items[f] for f in filenames if f in self._items] if filenames is not None else list(self._items.values())
        for item in items_to_process:
            if only_untagged and item.tagged:
                continue
            original = item.caption
            tags = [t.strip() for t in original.split(",")] if original.strip() else []
            tags_lower = [t.lower() for t in tags]
            new_tags = list(tags)
            added = False
            for tw in trigger_words:
                tw_stripped = tw.strip()
                if not tw_stripped:
                    continue
                if tw_stripped.lower() not in tags_lower:
                    if position == "prepend":
                        new_tags.insert(0, tw_stripped)
                    else:
                        new_tags.append(tw_stripped)
                    tags_lower.insert(0 if position == "prepend" else len(tags_lower), tw_stripped.lower())
                    added = True
            if not added:
                continue
            new_caption = ", ".join(new_tags)
            item.caption = new_caption
            item.tagged = bool(new_caption)
            changed += 1
            txt_path = os.path.join(settings.dataset_path, Path(item.filename).stem + ".txt")
            async with aiofiles.open(txt_path, mode="w", encoding="utf-8") as f:
                await f.write(new_caption)
        return {"changed": changed, "total": len(items_to_process)}

dataset_service = DatasetService()