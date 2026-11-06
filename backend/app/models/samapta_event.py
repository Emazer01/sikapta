from datetime import datetime, timezone, date
from sqlalchemy import Column, Integer, String, Date, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class SamaptaEvent(Base):
    __tablename__ = "samapta_events"

    id = Column(Integer, primary_key=True, index=True)
    event_code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(150), index=True, nullable=False)
    location = Column(String(150), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="scheduled", nullable=False)  # scheduled, in_progress, completed, cancelled
    track_length_meters = Column(Float, default=400.0, nullable=False)  # Standar lintasan lari 400 meter
    total_waves = Column(Integer, default=1, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    event_participants = relationship("EventParticipant", back_populates="event", cascade="all, delete-orphan")
    assessment_sessions = relationship("AssessmentSession", back_populates="event")

