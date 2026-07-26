from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "CAPTIONER_"}

    dataset_path: str = "./dataset"
    thumb_cache_path: str = "./thumbs"
    thumb_size: int = 512


settings = Settings()