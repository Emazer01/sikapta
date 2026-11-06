from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

class LandmarkPoint(BaseModel):
    name: str
    x: float  # Normalized 0.0 - 1.0
    y: float  # Normalized 0.0 - 1.0
    z: float = 0.0
    confidence: float = 0.0
    is_valid: bool = False

class PoseResult(BaseModel):
    is_detected: bool = False
    model_name: str = "unknown"
    landmarks: Dict[str, LandmarkPoint] = Field(default_factory=dict)
    timestamp_ms: int = 0
    inference_latency_ms: float = 0.0
    confidence_score: float = 0.0

class RepetitionResult(BaseModel):
    rep_number: int
    is_valid: bool
    rejection_reason: Optional[str] = None
    peak_angle: float = 0.0
    min_angle: float = 0.0
    start_time_ms: int = 0
    end_time_ms: int = 0
    duration_ms: int = 0
    feedback: str = ""

class MovementAnalysisResult(BaseModel):
    exercise_type: str
    phase: str
    current_angle: float = 0.0
    body_alignment_angle: Optional[float] = None
    detected_reps: int = 0
    verified_reps: int = 0
    rejected_reps: int = 0
    last_rep: Optional[RepetitionResult] = None
    feedback_message: str = "Posisikan tubuh di depan kamera"
    is_in_good_form: bool = True
    landmark_confidence_avg: float = 0.0
    bar_y: Optional[float] = None
    chin_y: Optional[float] = None
    chin_passed_bar: Optional[bool] = None

