from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "CAPTIONER_"}

    dataset_path: str = "./dataset"
    thumb_cache_path: str = "./thumbs"
    thumb_size: int = 512
    hf_model_name: str = "MiaoshouAI/Florence-2-large-PromptGen-v2.0"
    model_cache_dir: str = "./models"


settings = Settings()