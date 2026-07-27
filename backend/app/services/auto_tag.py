import gc
from pathlib import Path
from PIL import Image
import torch
from transformers import AutoProcessor, AutoModelForCausalLM


class AutoTagService:
    def __init__(self):
        self.model = None
        self.processor = None
        self.device = None
        self.available = False

    def load(self, model_name: str) -> None:
        try:
            if torch.cuda.is_available():
                self.device = "cuda"
                torch_dtype = torch.float16
            else:
                self.device = "cpu"
                torch_dtype = torch.float32

            self.processor = AutoProcessor.from_pretrained(
                model_name, trust_remote_code=True
            )
            self.model = AutoModelForCausalLM.from_pretrained(
                model_name,
                trust_remote_code=True,
                torch_dtype=torch_dtype,
                device_map=self.device,
            )
            self.available = True
        except Exception as e:
            print(f"[AutoTag] Failed to load model '{model_name}': {e}")
            self.available = False
            self.model = None
            self.processor = None
            self.device = None

    def unload(self) -> None:
        self.model = None
        self.processor = None
        self.device = None
        self.available = False
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        gc.collect()

    def is_available(self) -> bool:
        return self.available

    def generate(self, image_path: str, task: str = "<GENERATE_PROMPT>") -> str:
        if not self.available or self.model is None or self.processor is None:
            return ""

        image = Image.open(image_path).convert("RGB")
        inputs = self.processor(text=task, images=image, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        generated_ids = self.model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=1024,
            do_sample=False,
            num_beams=3,
        )
        generated_text = self.processor.batch_decode(
            generated_ids, skip_special_tokens=False
        )[0]
        result = self.processor.post_process_generation(
            generated_text, task=task, image_size=image.size
        )
        return result.get(task, generated_text)


auto_tag_service = AutoTagService()
