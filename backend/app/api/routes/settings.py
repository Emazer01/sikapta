from typing import Dict, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db, DB_DIALECT
from app.api.deps import require_admin

router = APIRouter(prefix="/settings", tags=["Settings"])

class SystemSettingsUpdate(BaseModel):
    default_vision_model: str = "mediapipe"
    camera_target_fps: int = 30
    camera_frame_width: int = 640
    camera_frame_height: int = 480

@router.get("/")
def get_system_settings():
    return {
        "app_name": settings.APP_NAME,
        "version": settings.VERSION,
        "default_vision_model": settings.DEFAULT_VISION_MODEL,
        "available_models": ["mediapipe", "yolo"],
        "camera_target_fps": settings.CAMERA_TARGET_FPS,
        "camera_resolution": f"{settings.CAMERA_FRAME_WIDTH}x{settings.CAMERA_FRAME_HEIGHT}",
        "database_dialect": DB_DIALECT,
        "database_url": settings.DATABASE_URL.split("@")[-1],  # mask user/pass
        "models_directory": str(settings.MODELS_DIR),
        "exports_directory": str(settings.EXPORTS_DIR),
        "supported_exercises": [
            {"id": "pushup", "name": "Push-up", "description": "Uji kekuatan otot dada, bahu, dan trisep"},
            {"id": "pullup", "name": "Pull-up", "description": "Uji kekuatan otot punggung dan bisep"},
            {"id": "situp", "name": "Sit-up", "description": "Uji kekuatan otot perut (abdominal)"}
        ]
    }

@router.put("/")
def update_system_settings(data: SystemSettingsUpdate, current_user = Depends(require_admin)):
    settings.DEFAULT_VISION_MODEL = data.default_vision_model
    settings.CAMERA_TARGET_FPS = data.camera_target_fps
    settings.CAMERA_FRAME_WIDTH = data.camera_frame_width
    settings.CAMERA_FRAME_HEIGHT = data.camera_frame_height

    return {
        "status": "success",
        "message": "Pengaturan sistem berhasil diperbarui",
        "settings": {
            "default_vision_model": settings.DEFAULT_VISION_MODEL,
            "camera_target_fps": settings.CAMERA_TARGET_FPS,
            "camera_frame_width": settings.CAMERA_FRAME_WIDTH,
            "camera_frame_height": settings.CAMERA_FRAME_HEIGHT
        }
    }

