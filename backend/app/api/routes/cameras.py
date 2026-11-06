from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.camera import Camera
from app.models.audit_log import AuditLog
from app.schemas.camera import (
    CameraCreate, CameraUpdate, CameraResponse, CameraTestRequest, CameraTestResponse
)
from app.services.camera.manager import camera_manager
from app.api.deps import require_roles

router = APIRouter(prefix="/cameras", tags=["Cameras"])

@router.get("/", response_model=List[CameraResponse])
def get_cameras(db: Session = Depends(get_db)):
    return db.query(Camera).order_by(Camera.id.asc()).all()

@router.post("/", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
def create_camera(
    data: CameraCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles("admin", "operator"))
):
    camera_dict = data.model_dump()
    rtsp_pw = camera_dict.pop("rtsp_password", None)

    camera = Camera(**camera_dict)
    if rtsp_pw:
        # In production use encryption; here we save password encrypted field
        camera.rtsp_password_encrypted = rtsp_pw

    db.add(camera)
    db.commit()
    db.refresh(camera)

    audit = AuditLog(
        user_id=current_user.id if current_user else None,
        action="CREATE",
        resource_type="camera",
        resource_id=str(camera.id),
        details=f"Konfigurasi kamera baru: {camera.name} ({camera.camera_type})"
    )
    db.add(audit)
    db.commit()

    return camera

@router.post("/test-connection", response_model=CameraTestResponse)
def test_camera_connection(req: CameraTestRequest):
    success, message, details = camera_manager.test_connection(
        camera_type=req.camera_type,
        device_index=req.device_index or 0,
        rtsp_url=req.rtsp_url
    )
    return CameraTestResponse(success=success, message=message, details=details)

@router.get("/{camera_id}", response_model=CameraResponse)
def get_camera_by_id(camera_id: int, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")
    return camera

@router.put("/{camera_id}", response_model=CameraResponse)
def update_camera(
    camera_id: int,
    data: CameraUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles("admin", "operator"))
):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")

    update_dict = data.model_dump(exclude_unset=True)
    rtsp_pw = update_dict.pop("rtsp_password", None)
    if rtsp_pw is not None:
        camera.rtsp_password_encrypted = rtsp_pw

    for key, value in update_dict.items():
        setattr(camera, key, value)

    # Stop any existing stream so new parameters take effect
    camera_manager.stop_stream(camera.id)

    db.commit()
    db.refresh(camera)
    return camera

@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles("admin", "operator"))
):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")

    camera_manager.stop_stream(camera.id)
    db.delete(camera)
    db.commit()
    return None

