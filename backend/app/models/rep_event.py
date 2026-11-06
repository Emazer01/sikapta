from datetime import datetime, timezone
from sqlalchemy import Column, Integer, BigInteger, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class RepEvent(Base):
    __tablename__ = "rep_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("assessment_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    rep_number = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False)  # detected, verified, rejected
    rejection_reason = Column(String(255), nullable=True)  # e.g., "Kedalaman belum terpenuhi"
    start_timestamp_ms = Column(BigInteger, nullable=True)
    end_timestamp_ms = Column(BigInteger, nullable=True)
    peak_angle = Column(Float, nullable=True)
    min_angle = Column(Float, nullable=True)
    confidence_avg = Column(Float, nullable=True)
    feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    session = relationship("AssessmentSession", back_populates="rep_events")

