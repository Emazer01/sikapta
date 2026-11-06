from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime
from app.core.database import Base

class ModelBenchmark(Base):
    __tablename__ = "model_benchmarks"

    id = Column(Integer, primary_key=True, index=True)
    test_name = Column(String(100), nullable=False)
    video_source = Column(String(255), nullable=False)
    duration_seconds = Column(Float, nullable=False)
    total_frames = Column(Integer, nullable=False)
    model_name = Column(String(50), nullable=False)  # mediapipe, yolo
    avg_fps = Column(Float, nullable=False)
    avg_latency_ms = Column(Float, nullable=False)
    p50_latency_ms = Column(Float, nullable=False)
    p95_latency_ms = Column(Float, nullable=False)
    precision_score = Column(Float, default=0.0, nullable=False)
    recall_score = Column(Float, default=0.0, nullable=False)
    f1_score = Column(Float, default=0.0, nullable=False)
    false_positives = Column(Integer, default=0, nullable=False)
    false_negatives = Column(Integer, default=0, nullable=False)
    detected_reps = Column(Integer, default=0, nullable=False)
    verified_reps = Column(Integer, default=0, nullable=False)
    invalid_pose_frames = Column(Integer, default=0, nullable=False)
    test_date = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

