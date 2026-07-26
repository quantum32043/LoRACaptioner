from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from app.config import settings
from app.services.dataset import dataset_service
from app.routers import dataset, images


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.dataset_path).mkdir(parents=True, exist_ok=True)
    Path(settings.thumb_cache_path).mkdir(parents=True, exist_ok=True)
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


@app.get("/api/health")
async def health():
    return {"status": "ok"}