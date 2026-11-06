from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class AssessmentSession(Base):
    __tablename__ = "assessment_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_code = Column(String(50), unique=True, index=True, nullable=False)
    participant_id = Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(Integer, ForeignKey("samapta_events.id", ondelete="SET NULL"), nullable=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True)
    rule_profile_id = Column(Integer, ForeignKey("rule_profiles.id", ondelete="SET NULL"), nullable=True)
    examiner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    exercise_type = Column(String(20), nullable=False)  # pushup, pullup, situp
    model_used = Column(String(20), default="mediapipe", nullable=False)  # mediapipe, yolo
    gender = Column(String(10), default="L", nullable=True)  # L (Pria) / P (Wanita)
    tolerance_deg = Column(Float, default=5.0, nullable=True)  # Nilai toleransi sudut gerak
    source_type = Column(String(20), default="camera", nullable=False)  # camera, video_upload
    video_path = Column(String(255), nullable=True)
    annotated_video_path = Column(String(255), nullable=True)
    status = Column(String(20), default="in_progress", nullable=False)  # in_progress, paused, completed, cancelled

    start_time = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0, nullable=False)

    detected_reps = Column(Integer, default=0, nullable=False)
    verified_reps = Column(Integer, default=0, nullable=False)
    rejected_reps = Column(Integer, default=0, nullable=False)

    avg_fps = Column(Float, default=0.0, nullable=False)
    avg_latency_ms = Column(Float, default=0.0, nullable=False)
    examiner_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    participant = relationship("Participant", back_populates="assessment_sessions")
    camera = relationship("Camera", back_populates="assessment_sessions")
    rule_profile = relationship("RuleProfile", back_populates="assessment_sessions")
    examiner = relationship("User", back_populates="assessment_sessions")
    rep_events = relationship("RepEvent", back_populates="session", cascade="all, delete-orphan")
    event = relationship("SamaptaEvent", back_populates="assessment_sessions")

