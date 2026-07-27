import asyncio
import gc
import logging
import time
from enum import Enum
from pathlib import Path
from typing import Optional

import torch
from PIL import Image

from app.config import settings
from app.services.model_store import model_store

logger = logging.getLogger(__name__)


class ModelState(str, Enum):
    UNAVAILABLE = "unavailable"
    NOT_DOWNLOADED = "not_downloaded"
    DOWNLOADING = "downloading"
    LOADING = "loading"
    READY = "ready"
    UNLOADED = "unloaded"
    ERROR = "error"


TASK_MODES = {
    "generate_prompt": "<GENERATE_PROMPT>",
    "caption": "<CAPTION>",
    "detailed_caption": "<DETAILED_CAPTION>",
    "more_detailed_caption": "<MORE_DETAILED_CAPTION>",
    "generate_tags": "<GENERATE_TAGS>",
}


class AutoTagService:
    def __init__(self):
        self._model = None
        self._processor = None
        self._device: Optional[str] = None
        self._state = ModelState.UNLOADED if model_store.is_downloaded(settings.hf_model_name) else ModelState.NOT_DOWNLOADED
        self._last_activity: float = 0.0
        self._unload_task: Optional[asyncio.Task] = None
        self._current_task_mode: str = "generate_prompt"
        self._last_error: Optional[str] = None
        self._unload_delay: int = 300
        self._gpu_available: bool = torch.cuda.is_available()

    @property
    def state(self) -> ModelState:
        return self._state

    @property
    def device(self) -> Optional[str]:
        return self._device

    @property
    def task_mode(self) -> str:
        return self._current_task_mode

    @task_mode.setter
    def task_mode(self, mode: str):
        if mode in TASK_MODES:
            self._current_task_mode = mode

    def get_status(self) -> dict:
        return {
            "state": self._state.value,
            "device": self._device,
            "model": settings.hf_model_name,
            "task_mode": self._current_task_mode,
            "gpu_available": self._gpu_available,
            "downloaded": model_store.is_downloaded(settings.hf_model_name),
            "last_error": self._last_error,
        }

    def get_available_modes(self) -> list[dict]:
        return [
            {"id": k, "label": _mode_label(k), "prompt": v}
            for k, v in TASK_MODES.items()
        ]

    def _update_activity(self):
        self._last_activity = time.time()
        self._cancel_unload()

    def _cancel_unload(self):
        if self._unload_task and not self._unload_task.done():
            self._unload_task.cancel()
        self._unload_task = None

    async def _schedule_unload(self):
        try:
            await asyncio.sleep(self._unload_delay)
            if self._state == ModelState.READY and self._model is not None:
                elapsed = time.time() - self._last_activity
                if elapsed >= self._unload_delay:
                    logger.info("Auto-unloading model after 5min inactivity")
                    self.unload()
        except asyncio.CancelledError:
            pass

    async def ensure_ready(self):
        repo_id = settings.hf_model_name

        if self._state == ModelState.READY:
            return

        if self._state == ModelState.ERROR:
            logger.info("Attempting recovery from error state")
            self._last_error = None

        if not model_store.is_downloaded(repo_id):
            self._state = ModelState.NOT_DOWNLOADED
            raise ModelNotDownloadedError(
                "Model is not downloaded. Call download first."
            )

        await self._load_model()

    async def _load_model(self):
        if self._state == ModelState.READY:
            return

        self._state = ModelState.LOADING
        repo_id = settings.hf_model_name
        model_dir = model_store.get_model_path(repo_id)

        try:
            if self._gpu_available:
                self._device = "cuda"
            else:
                self._device = "cpu"

            def _load():
                import importlib.util
                import sys as _sys

                from transformers import GenerationMixin

                # Ensure __init__.py exists so directory is a package
                (model_dir / "__init__.py").touch()

                PKG = "_florence2_loader"

                def _load_submodule(name, path):
                    spec = importlib.util.spec_from_file_location(
                        f"{PKG}.{name}", model_dir / path,
                        submodule_search_locations=[str(model_dir)]
                    )
                    mod = importlib.util.module_from_spec(spec)
                    _sys.modules[f"{PKG}.{name}"] = mod
                    spec.loader.exec_module(mod)
                    return mod

                # Load __init__.py as package root
                spec_pkg = importlib.util.spec_from_file_location(
                    PKG, model_dir / "__init__.py",
                    submodule_search_locations=[str(model_dir)]
                )
                pkg = importlib.util.module_from_spec(spec_pkg)
                _sys.modules[PKG] = pkg
                spec_pkg.loader.exec_module(pkg)

                _cfg_mod = _load_submodule("configuration_florence2", "configuration_florence2.py")
                _mod_mod = _load_submodule("modeling_florence2", "modeling_florence2.py")
                _proc_mod = _load_submodule("processing_florence2", "processing_florence2.py")

                # Patch GenerationMixin — transformers >=4.50 no longer inherits it in PreTrainedModel
                _mod_mod.Florence2PreTrainedModel.__bases__ = (GenerationMixin, _mod_mod.PreTrainedModel)
                _mod_mod.Florence2LanguagePreTrainedModel.__bases__ = (GenerationMixin, _mod_mod.PreTrainedModel)

                config = _mod_mod.Florence2Config.from_pretrained(
                    str(model_dir), local_files_only=True
                )
                # Skip SDPA check (model predates this transformers feature)
                config._attn_implementation = "eager"

                model = _mod_mod.Florence2ForConditionalGeneration(config)

                from safetensors.torch import load_file
                state_dict = load_file(str(model_dir / "model.safetensors"))
                model.load_state_dict(state_dict, strict=False)

                model.to(self._device)
                model.eval()

                processor = _proc_mod.Florence2Processor.from_pretrained(
                    str(model_dir), local_files_only=True
                )

                return processor, model

            self._processor, self._model = await asyncio.to_thread(_load)
            self._state = ModelState.READY
            self._last_error = None
            logger.info(f"Model loaded on {self._device}")
        except Exception as e:
            self._state = ModelState.ERROR
            self._last_error = str(e)
            logger.error(f"Failed to load model: {e}")
            self._model = None
            self._processor = None
            self._device = None
            raise

    def unload(self):
        self._model = None
        self._processor = None
        if self._device == "cuda" and torch.cuda.is_available():
            torch.cuda.empty_cache()
        gc.collect()
        self._state = ModelState.UNLOADED
        self._device = None
        logger.info("Model unloaded from memory")

    async def download_model(
        self, progress_callback=None
    ) -> Path:
        repo_id = settings.hf_model_name

        if model_store.is_downloaded(repo_id):
            logger.info(f"Model {repo_id} already downloaded")
            model_dir = model_store.get_model_path(repo_id)
            self._state = ModelState.UNLOADED
            return model_dir

        self._state = ModelState.DOWNLOADING

        try:
            result = await model_store.download(
                repo_id, progress_callback=progress_callback
            )
            self._state = ModelState.UNLOADED
            return result
        except Exception as e:
            self._state = ModelState.ERROR
            self._last_error = str(e)
            raise

    async def generate(
        self, image_path: str, task: Optional[str] = None
    ) -> str:
        self._update_activity()

        await self.ensure_ready()

        task_token = TASK_MODES.get(task, TASK_MODES[self._current_task_mode])

        image = Image.open(image_path).convert("RGB")
        inputs = self._processor(text=task_token, images=image, return_tensors="pt")
        inputs = {k: v.to(self._device) for k, v in inputs.items()}

        def _infer():
            generated_ids = self._model.generate(
                input_ids=inputs["input_ids"],
                pixel_values=inputs["pixel_values"],
                max_new_tokens=1024,
                do_sample=False,
                num_beams=3,
            )
            generated_text = self._processor.batch_decode(
                generated_ids, skip_special_tokens=False
            )[0]
            return self._processor.post_process_generation(
                generated_text, task=task_token, image_size=image.size
            )

        result = await asyncio.to_thread(_infer)
        caption = result.get(task_token, "")

        if not caption or not caption.strip():
            raise RuntimeError("Model returned empty caption")

        self._unload_task = asyncio.create_task(self._schedule_unload())

        return caption.strip()


class ModelNotDownloadedError(Exception):
    pass


def _mode_label(mode_id: str) -> str:
    labels = {
        "generate_prompt": "Промпт",
        "caption": "Описание",
        "detailed_caption": "Детальное описание",
        "more_detailed_caption": "Максимально детально",
        "generate_tags": "Теги",
    }
    return labels.get(mode_id, mode_id)


auto_tag_service = AutoTagService()
