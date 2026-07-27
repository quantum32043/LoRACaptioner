```notebook-python
import torch
import os
import zipfile
import glob
from PIL import Image
from transformers import AutoModelForCausalLM, AutoProcessor
from google.colab import files
from tqdm.notebook import tqdm
import io

# ============================================================
# ШАГ 0: Проверка версии transformers (должна быть 4.49.0)
# ============================================================
import transformers
print(f"✅ Версия Transformers: {transformers.__version__}")
if transformers.__version__ != "4.49.0":
    print("⚠️ ВНИМАНИЕ! Версия transformers должна быть 4.49.0, иначе будет ошибка!")
    print("Выполните: !pip install transformers==4.49.0 и перезапустите сеанс.")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"✅ Устройство: {device}")

# ============================================================
# ШАГ 1: Загрузка модели (один раз)
# ============================================================
model_id = "MiaoshouAI/Florence-2-large-PromptGen-v2.0"
print(" Загрузка модели...")
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    trust_remote_code=True,
    torch_dtype=torch.float16
).to(device)
processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
print("✅ Модель загружена!")

# ============================================================
# ШАГ 2: Загрузка и распаковка датасета (ZIP-архив)
# ============================================================
dataset_dir = "/content/drive/MyDrive/cropped"

if not os.path.exists(dataset_dir):
    raise FileNotFoundError(f"❌ Папка '{dataset_dir}' не найдена!")

print(f" Рабочая папка: {dataset_dir}")

image_extensions = ['*.jpg', '*.jpeg', '*.png', '*.webp', '*.bmp']
image_paths = []
for ext in image_extensions:
    image_paths.extend(glob.glob(os.path.join(dataset_dir, "**", ext), recursive=True))
    image_paths.extend(glob.glob(os.path.join(dataset_dir, "**", ext.upper()), recursive=True))

image_paths = sorted(set(image_paths))
print(f"🖼️ Найдено изображений: {len(image_paths)}")

if len(image_paths) == 0:
    raise ValueError(f"В папке {dataset_dir} не найдено изображений!")

# ============================================================
# ШАГ 3: Функция генерации капшена
# ============================================================
TRIGGER_WORD = "ksusha"

def generate_caption(img_path):
    """Генерирует капшен для одного изображения."""
    try:
        image = Image.open(img_path).convert("RGB")
    except Exception as e:
        return None, f"Ошибка открытия файла: {e}"

    # Если изображение слишком большое — уменьшаем для ускорения (опционально)
    # Florence-2 работает с фиксированным размером, но большие файлы дольше грузятся в VRAM
    # Можно раскомментировать, если будут ошибки памяти:
    # image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)

    def gen_text(task_prompt):
        inputs = processor(text=task_prompt, images=image, return_tensors="pt").to(device)
        inputs["pixel_values"] = inputs["pixel_values"].to(torch.float16)

        generated_ids = model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=1024,
            do_sample=False,
            num_beams=3,
            use_cache=True
        )
        generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]

        try:
            parsed = processor.post_process_generation(
                generated_text, task=task_prompt, image_size=(image.width, image.height)
            )
            return parsed.get(task_prompt, generated_text).strip()
        except Exception:
            return generated_text.replace(task_prompt, "").replace("</s>", "").replace("<s>", "").strip()

    detailed = gen_text("<MORE_DETAILED_CAPTION>")

    # Формируем капшен с триггером
    caption = f"{TRIGGER_WORD}, {detailed}."
    return caption, None

# ============================================================
# ШАГ 4: Пакетная обработка всех изображений
# ============================================================
print(f"\n🚀 Начинаем обработку {len(image_paths)} изображений...")
print(f"⏱️ Примерное время: ~20-30 секунд на фото (всего: {len(image_paths) * 25 // 60} мин)")

success_count = 0
error_count = 0

for img_path in tqdm(image_paths, desc="Обработка"):
    filename = os.path.splitext(os.path.basename(img_path))[0]
    txt_path = os.path.join(dataset_dir, f"{filename}.txt")

    # Пропускаем, если .txt уже существует (для возобновления после обрыва)
    if os.path.exists(txt_path):
        success_count += 1
        continue

    caption, error = generate_caption(img_path)

    if error:
        print(f"\n❌ Ошибка на {filename}: {error}")
        error_count += 1
        continue

    # Сохраняем капшен
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(caption)

    success_count += 1

print(f"\n✅ Готово! Обработано: {success_count}, Ошибок: {error_count}")

# ============================================================
# ШАГ 5: Упаковка результатов в ZIP для скачивания
# ============================================================
output_zip = "/content/dataset_with_captions.zip"
print(f"\n📦 Упаковка результатов в {output_zip}...")

with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zip_out:
    for root, dirs, filenames in os.walk(dataset_dir):
        for file in filenames:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, dataset_dir)
            zip_out.write(file_path, arcname)

print("🎉 Всё готово! Скачайте архив с результатами:")
files.download(output_zip)
```

