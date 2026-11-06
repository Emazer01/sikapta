from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class BenchmarkRunRequest(BaseModel):
    video_path: Optional[str] = None

class ModelBenchmarkResponse(BaseModel):
    id: int
    test_name: str
    video_source: str
    duration_seconds: float
    total_frames: int
    model_name: str
    avg_fps: float
    avg_latency_ms: float
    p50_latency_ms: float
    p95_latency_ms: float
    precision_score: float
    recall_score: float
    f1_score: float
    false_positives: int
    false_negatives: int
    detected_reps: int
    verified_reps: int
    invalid_pose_frames: int
    test_date: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

