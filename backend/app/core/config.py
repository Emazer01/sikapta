import os
from pathlib import Path
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow"
    )

    PROJECT_NAME: str = "SIKAPTA AI Core Service"
    APP_NAME: str = "SIKAPTA AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"

    # Security
    SECRET_KEY: str = "sikapta-ai-super-secret-key-change-in-production-2026-secure"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Database
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/sikapta_ai"
    SQLITE_FALLBACK_URL: str = f"sqlite:///{BASE_DIR / 'data' / 'sikapta_ai.db'}"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
    ]

    # Storage Paths
    BASE_DIR: Path = BASE_DIR
    DATA_DIR: Path = BASE_DIR / "data"
    MODELS_DIR: Path = BASE_DIR / "data" / "models"
    EXPORTS_DIR: Path = BASE_DIR / "data" / "exports"
    BENCHMARK_DIR: Path = BASE_DIR / "data" / "benchmark"
    UPLOADS_DIR: Path = BASE_DIR / "data" / "uploads"

    # Camera & Vision
    DEFAULT_VISION_MODEL: str = "mediapipe"  # "mediapipe" | "yolo"
    CAMERA_FRAME_WIDTH: int = 640
    CAMERA_FRAME_HEIGHT: int = 480
    CAMERA_TARGET_FPS: int = 30
    JPEG_QUALITY: int = 75

settings = Settings()

# Ensure directories exist
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
settings.EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
settings.BENCHMARK_DIR.mkdir(parents=True, exist_ok=True)
settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

