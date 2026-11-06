from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    camera_type = Column(String(20), default="webcam", nullable=False)  # webcam, rtsp
    device_index = Column(Integer, default=0, nullable=True)  # for USB/webcam (0, 1, 2)
    rtsp_url = Column(String(255), nullable=True)  # rtsp://...
    rtsp_username = Column(String(100), nullable=True)
    rtsp_password_encrypted = Column(String(255), nullable=True)  # encrypted/masked
    resolution_w = Column(Integer, default=640, nullable=False)
    resolution_h = Column(Integer, default=480, nullable=False)
    target_fps = Column(Integer, default=30, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    status = Column(String(20), default="offline", nullable=False)  # online, offline, error
    last_seen = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    assessment_sessions = relationship("AssessmentSession", back_populates="camera")

