from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class CameraBase(BaseModel):
    name: str
    camera_type: str = "webcam"  # webcam, rtsp
    device_index: Optional[int] = 0
    rtsp_url: Optional[str] = None
    rtsp_username: Optional[str] = None
    resolution_w: int = 640
    resolution_h: int = 480
    target_fps: int = 30
    is_active: bool = True

class CameraCreate(CameraBase):
    rtsp_password: Optional[str] = None

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    camera_type: Optional[str] = None
    device_index: Optional[int] = None
    rtsp_url: Optional[str] = None
    rtsp_username: Optional[str] = None
    rtsp_password: Optional[str] = None
    resolution_w: Optional[int] = None
    resolution_h: Optional[int] = None
    target_fps: Optional[int] = None
    is_active: Optional[bool] = None

class CameraResponse(CameraBase):
    id: int
    status: str
    last_seen: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    # Notice: rtsp_password is NEVER returned in response for security!

    model_config = ConfigDict(from_attributes=True)

class CameraTestRequest(BaseModel):
    camera_type: str = "webcam"
    device_index: Optional[int] = 0
    rtsp_url: Optional[str] = None

class CameraTestResponse(BaseModel):
    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None

