from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import settings
from app.services.dataset import dataset_service
from app.routers import dataset, images, auto_tag


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.dataset_path).mkdir(parents=True, exist_ok=True)
    Path(settings.thumb_cache_path).mkdir(parents=True, exist_ok=True)
    Path(settings.model_cache_dir).mkdir(parents=True, exist_ok=True)
    dataset_service.rescan()
    yield


app = FastAPI(title="LoRA Captioner", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dataset.router, prefix="/api")
app.include_router(images.router, prefix="/api")
app.include_router(auto_tag.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}

frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")