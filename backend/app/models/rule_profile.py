from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base

class RuleProfile(Base):
    __tablename__ = "rule_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    exercise_type = Column(String(20), nullable=False)  # pushup, pullup, situp
    version = Column(String(20), default="1.0.0", nullable=False)
    description = Column(String(255), nullable=True)
    is_default = Column(Boolean, default=False, nullable=False)
    config_json = Column(JSON, nullable=False)  # thresholds, smoothing, hysteresis, cooldown, etc.
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    assessment_sessions = relationship("AssessmentSession", back_populates="rule_profile")

