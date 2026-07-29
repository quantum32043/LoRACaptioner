# LoRA Captioner

A local web tool for annotating image datasets used for training LoRA models (Stable Diffusion / SDXL / Flux). Works directly with the canonical kohya_ss / ai-toolkit format: a folder where each image has a same-named `.txt` file with its caption next to it.

---

## Features

### Grid and Navigation
- Virtualized grid with adaptive column count (TanStack Virtual) — smooth scrolling for up to 20,000 frames.
- Search by filename and caption text, filter for "empty only."
- Select a single frame (click) or multiple frames (Ctrl+click / drag rectangle).

### Caption Editor
- **Tag mode**: caption is split into tag chips with drag-and-drop (dnd-kit), adding via Enter, removing by X.
- **Raw text mode**: multi-line field for natural language.
- Auto-save when switching frames, manual save with Ctrl+S.
- Preview with zoom and pan (react-zoom-pan-pinch).

### Batch Operations
- Add tag to beginning / end (no duplicates).
- Remove tag by exact match.
- Regex replacement across the entire caption.
- Optionally apply only to empty frames.

### AI Auto-Tagging (Florence-2)
- Local model `MiaoshouAI/Florence-2-large-PromptGen-v2.0`, loaded from HuggingFace.
- 7 generation modes: tags, description, detailed description, analysis, and mixed.
- Temperature control (0.1–2.0).
- Model auto-offload after 5 minutes of inactivity.
- Batch processing: all empty or selected frames with progress via SSE.

### Interface
- Dark theme in "photo lab" style: film grain, warm safelight accent, light meter.
- Full-screen layout with no page scroll.
- Notifications (sonner) for operation results.

---

## Screenshots

> *Place for screenshots. Recommended frames:*

| # | What to Show | Description |
|---|--------------|-------------|
| 1 | **Main Screen** | Full interface: TopBar with light meter, Toolbar with search/filters, card grid, EditorPanel with selected frame |
| 2 | **Tag Mode Editor** | Tag chips with drag-and-drop, input field, Auto/Auto all buttons, detailed view with zoom |
| 3 | **Drag Selection** | Multiple selected cards with blue outline and checkmarks, visible rectangle selection |
| 4 | **Batch Panel** | Open batch operations panel with form (prepend/append/remove/regex) |
| 5 | **Auto-Tagging** | Model selection menu, task mode, temperature slider, batch processing progress |
| 6 | **Empty State** | Dataset with no images or nothing found by filter |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Backend | Python 3.12 + FastAPI, aiofiles, Pillow |
| ML | PyTorch + Transformers + Florence-2-large-PromptGen-v2.0 |
| Frontend | React 18 + TypeScript + Vite 6 |
| State / Network | Zustand + TanStack Query |
| UI | Tailwind CSS + lucide-react + sonner + dnd-kit |
| Virtualization | TanStack Virtual |

---

## Installation and Setup

**Requirements:**
- Python 3.10+
- Node.js 18+
- (Optional) NVIDIA GPU with CUDA drivers

### Quick Start

Simply run the appropriate .bat file — it will create a venv, install dependencies, and start the server:

```bash
start.bat        # CPU version of PyTorch
start-gpu.bat    # CUDA 12.4 (NVIDIA GPU)
```

The script automatically:
1. Creates a Python virtual environment.
2. Installs PyTorch (CPU or CUDA).
3. Installs Python dependencies.
4. Installs npm packages and builds the frontend (only if sources are newer than the build).
5. Starts uvicorn at `http://127.0.0.1:8000` and opens the browser.

### Manual Installation

```bash
# Backend
python -m venv venv
venv\Scripts\activate
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r backend\requirements.txt

# Frontend
cd frontend
npm install
npm run build
cd ..

# Run
uvicorn app.main:app --host 127.0.0.1 --port 8000 --app-dir backend
```

### Development Mode

```bash
# Terminal 1: backend with hot-reload
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir backend

# Terminal 2: frontend dev server with /api proxy → localhost:8000
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### Docker

```bash
mkdir dataset
docker compose up --build
```

UI at `http://localhost:8080`.

---

## Configuration

Environment variables with `CAPTIONER_` prefix:

| Variable | Default | Description |
|----------|---------|-------------|
| `CAPTIONER_DATASET_PATH` | `./dataset` | Path to dataset |
| `CAPTIONER_THUMB_CACHE_PATH` | `./thumbs` | Thumbnail cache |
| `CAPTIONER_THUMB_SIZE` | `512` | Thumbnail size (long side) |
| `CAPTIONER_HF_MODEL_NAME` | `MiaoshouAI/Florence-2-large-PromptGen-v2.0` | HuggingFace model |
| `CAPTIONER_MODEL_CACHE_DIR` | `./models` | Model cache directory |

---

## Hotkeys

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / next frame |
| `Ctrl/Cmd + S` | Save caption |
| `Enter` | Add tag (in tag input field) |
| `Backspace` | Remove last tag (when input is empty) |

---

## API

Swagger documentation: `http://localhost:8000/docs` (when the server is running).

Main endpoints (`/api`):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dataset/items` | List frames |
| GET | `/dataset/stats` | Statistics (total / captioned / empty) |
| PUT | `/dataset/caption` | Save caption |
| POST | `/dataset/batch` | Batch operation |
| GET | `/images/thumb/{name}` | Thumbnail (WebP) |
| GET | `/images/full/{name}` | Full image |
| GET | `/auto-tag/status` | Model status |
| POST | `/auto-tag/generate` | Generate caption |

---

## License

MIT + [Commons Clause](LICENSE) — free use, modification, and distribution permitted with attribution. **Selling the Software as a standalone product is prohibited.** Commercial use as part of a larger product, consulting, and services based on the software are allowed.

More details: [commonsclause.com](https://commonsclause.com/)
