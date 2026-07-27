import asyncio
import logging
import shutil
from pathlib import Path
from typing import Callable, Optional

from huggingface_hub import hf_hub_download, list_repo_tree
from huggingface_hub.hf_api import RepoFile

logger = logging.getLogger(__name__)


class DownloadProgress:
    def __init__(self):
        self.downloaded_bytes: int = 0
        self.total_bytes: int = 0
        self.current_file: str = ""
        self.files_done: int = 0
        self.files_total: int = 0

    def to_dict(self) -> dict:
        return {
            "downloaded_bytes": self.downloaded_bytes,
            "total_bytes": self.total_bytes,
            "current_file": self.current_file,
            "files_done": self.files_done,
            "files_total": self.files_total,
        }


class ModelStore:
    def __init__(self, cache_dir: str):
        self._cache_dir = Path(cache_dir)
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def get_model_path(self, repo_id: str) -> Path:
        safe = repo_id.replace("/", "_")
        return self._cache_dir / safe

    def is_downloaded(self, repo_id: str) -> bool:
        path = self.get_model_path(repo_id)
        if not path.exists():
            return False
        if not any(path.iterdir()):
            return False
        if list(path.glob("*.safetensors")):
            return True
        if list(path.glob("*.bin")):
            return True
        return False

    async def download(
        self,
        repo_id: str,
        progress_callback: Optional[Callable[[DownloadProgress], None]] = None,
    ) -> Path:
        model_dir = self.get_model_path(repo_id)
        model_dir.mkdir(parents=True, exist_ok=True)

        if self.is_downloaded(repo_id):
            return model_dir

        files = await asyncio.to_thread(
            lambda: [
                f
                for f in list_repo_tree(repo_id, recursive=True)
                if isinstance(f, RepoFile)
            ]
        )

        progress = DownloadProgress()
        progress.files_total = len(files)
        progress.total_bytes = sum(f.size for f in files)

        for file in files:
            progress.current_file = file.path
            if progress_callback:
                progress_callback(progress)

            await asyncio.to_thread(
                lambda f=file: hf_hub_download(
                    repo_id=repo_id,
                    filename=f.path,
                    local_dir=str(model_dir),
                    local_dir_use_symlinks=False,
                    resume_download=True,
                )
            )

            progress.files_done += 1
            progress.downloaded_bytes += file.size
            if progress_callback:
                progress_callback(progress)

        return model_dir

    def delete_model(self, repo_id: str) -> bool:
        path = self.get_model_path(repo_id)
        if path.exists():
            shutil.rmtree(path)
            return True
        return False

    def get_disk_usage(self) -> dict:
        total_size = 0
        for f in self._cache_dir.rglob("*"):
            if f.is_file():
                total_size += f.stat().st_size
        usage = shutil.disk_usage(self._cache_dir)
        return {
            "cache_size_bytes": total_size,
            "free_bytes": usage.free,
            "total_bytes": usage.total,
        }


model_store = ModelStore(cache_dir="./models")
