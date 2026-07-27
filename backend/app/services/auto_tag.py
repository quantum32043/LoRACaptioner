import asyncio
import gc
import logging
import os
import time
from enum import Enum
from pathlib import Path
from typing import Optional

# Optimise CUDA memory allocation to reduce fragmentation
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

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
    "generate_tags": "<GENERATE_TAGS>",
    "caption": "<CAPTION>",
    "detailed_caption": "<DETAILED_CAPTION>",
    "more_detailed_caption": "<MORE_DETAILED_CAPTION>",
    "analyze": "<ANALYZE>",
    "mixed_caption": "<MIXED_CAPTION>",
    "mixed_caption_plus": "<MIXED_CAPTION_PLUS>",
}


class AutoTagService:
    def __init__(self):
        self._model = None
        self._processor = None
        self._device: Optional[str] = None
        self._state = ModelState.UNLOADED if model_store.is_downloaded(settings.hf_model_name) else ModelState.NOT_DOWNLOADED
        self._last_activity: float = 0.0
        self._unload_task: Optional[asyncio.Task] = None
        self._current_task_mode: str = "generate_tags"
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
                import warnings as _warnings

                _warnings.filterwarnings("ignore", message=".*Importing from timm\\.models\\.layers is deprecated.*")
                _warnings.filterwarnings("ignore", message=".*has generative capabilities.*GenerationMixin.*")
                _warnings.filterwarnings("ignore", message=".*You are replacing.*timm.*")

                from transformers import GenerationConfig, GenerationMixin

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

                # ── transformers 4.57.6 compatibility patches ──────────────────────────

                # Patch GenerationMixin — transformers >=4.50 no longer inherits it in PreTrainedModel
                _mod_mod.Florence2PreTrainedModel.__bases__ = (GenerationMixin, _mod_mod.PreTrainedModel)
                _mod_mod.Florence2LanguagePreTrainedModel.__bases__ = (GenerationMixin, _mod_mod.PreTrainedModel)

                # ── transformers 4.57.6 generation compatibility ────────────────────────
                # Patch prepare_inputs_for_generation to handle the new KV cache format.
                def _patch_prepare_inputs(klass):
                    orig = klass.prepare_inputs_for_generation
                    def patched(self, decoder_input_ids, past_key_values=None, **kwargs):
                        if past_key_values is not None:
                            if hasattr(past_key_values, 'self_attention_cache'):
                                past_length = past_key_values.self_attention_cache[0][0].shape[2]
                            else:
                                past_length = past_key_values[0][0].shape[2]
                            if decoder_input_ids.shape[1] > past_length:
                                decoder_input_ids = decoder_input_ids[:, past_length:]
                            else:
                                decoder_input_ids = decoder_input_ids[:, -1:]
                        return orig(self, decoder_input_ids, past_key_values=past_key_values, **kwargs)
                    klass.prepare_inputs_for_generation = patched
                _patch_prepare_inputs(_mod_mod.Florence2LanguageForConditionalGeneration)
                _patch_prepare_inputs(_mod_mod.Florence2ForConditionalGeneration)

                # can_generate() returns False due to PreTrainedModel name check in
                # transformers >=4.50, so GenerationMixin.generate() is unavailable.
                # Use our own generation loop instead.
                def _patched_outer_generate(self, input_ids=None, inputs_embeds=None, pixel_values=None, **kw):
                    import torch as _torch
                    attention_mask = kw.get('attention_mask')
                    if inputs_embeds is None:
                        if input_ids is not None:
                            inputs_embeds = self.get_input_embeddings()(input_ids)
                        if pixel_values is not None:
                            image_features = self._encode_image(pixel_values)
                            inputs_embeds, attention_mask = self._merge_input_ids_with_image_features(image_features, inputs_embeds)

                    encoder = self.language_model.get_encoder()
                    encoder_outputs = encoder(inputs_embeds=inputs_embeds, attention_mask=attention_mask, return_dict=True)

                    gc = self.generation_config
                    start_id = gc.decoder_start_token_id
                    eos_id = int(kw.get('eos_token_id', gc.eos_token_id))
                    forced_bos_id = getattr(gc, 'forced_bos_token_id', None)
                    max_new = kw.get('max_new_tokens', gc.max_new_tokens or 512)
                    device = inputs_embeds.device
                    batch_size = inputs_embeds.shape[0]

                    decoder_ids = _torch.full((batch_size, 1), start_id, dtype=_torch.long, device=device)
                    past_key_values = None

                    for step in range(max_new):
                        out = self.language_model(
                            input_ids=None,
                            attention_mask=attention_mask,
                            decoder_input_ids=decoder_ids[:, -1:] if past_key_values is not None else decoder_ids,
                            encoder_outputs=encoder_outputs,
                            past_key_values=past_key_values,
                            use_cache=True,
                            return_dict=True,
                        )
                        logits = out.logits[:, -1, :]
                        if forced_bos_id is not None and step == 0 and decoder_ids.shape[1] == 1:
                            next_token = _torch.full((batch_size, 1), forced_bos_id, dtype=_torch.long, device=device)
                        else:
                            next_token = logits.argmax(dim=-1, keepdim=True)
                        decoder_ids = _torch.cat([decoder_ids, next_token], dim=-1)
                        past_key_values = out.past_key_values
                        if next_token.item() == eos_id:
                            break

                    return decoder_ids
                _mod_mod.Florence2ForConditionalGeneration.generate = _patched_outer_generate

                config = _mod_mod.Florence2Config.from_pretrained(
                    str(model_dir), local_files_only=True
                )
                config._attn_implementation = "eager"

                model = _mod_mod.Florence2ForConditionalGeneration(config)
                gc = GenerationConfig.from_model_config(config)
                model.generation_config = gc
                model.language_model.generation_config = gc

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

    def _clean_memory(self):
        if self._device == "cuda" and torch.cuda.is_available():
            torch.cuda.empty_cache()
        gc.collect()

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
            with torch.no_grad():
                generated_ids = self._model.generate(
                    input_ids=inputs["input_ids"],
                    pixel_values=inputs["pixel_values"],
                    max_new_tokens=512,
                    do_sample=False,
                    num_beams=2,
                )
            generated_text = self._processor.batch_decode(
                generated_ids, skip_special_tokens=False
            )[0]
            result = self._processor.post_process_generation(
                generated_text, task=task_token, image_size=image.size
            )
            caption = result.get(task_token, "")
            if not caption or not caption.strip():
                logger.warning(
                    "Empty caption — raw: %.200s", generated_text,
                )
                return None
            return caption

        caption = await asyncio.to_thread(_infer)

        if caption is None:
            logger.info("Retrying inference...")
            self._clean_memory()
            caption = await asyncio.to_thread(_infer)

        if caption is None:
            raise RuntimeError("Model returned empty caption")

        tags = [t.strip() for t in caption.split(",")]
        seen = set()
        unique = []
        for t in tags:
            key = t.lower()
            if key and key not in seen:
                seen.add(key)
                unique.append(t)
        caption = ", ".join(unique)

        self._unload_task = asyncio.create_task(self._schedule_unload())
        self._clean_memory()

        return caption


class ModelNotDownloadedError(Exception):
    pass


def _mode_label(mode_id: str) -> str:
    labels = {
        "generate_tags": "Теги",
        "caption": "Описание",
        "detailed_caption": "Детальное описание",
        "more_detailed_caption": "Максимально детально",
        "analyze": "Анализ композиции",
        "mixed_caption": "Смешанный (теги+описание)",
        "mixed_caption_plus": "Смешанный+анализ",
    }
    return labels.get(mode_id, mode_id)


auto_tag_service = AutoTagService()
