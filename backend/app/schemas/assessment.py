from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.participant import ParticipantResponse
from app.schemas.camera import CameraResponse

class RepEventResponse(BaseModel):
    id: int
    session_id: int
    rep_number: int
    status: str
    rejection_reason: Optional[str] = None
    start_timestamp_ms: Optional[int] = None
    end_timestamp_ms: Optional[int] = None
    peak_angle: Optional[float] = None
    min_angle: Optional[float] = None
    confidence_avg: Optional[float] = None
    feedback: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AssessmentSessionBase(BaseModel):
    participant_id: int
    event_id: Optional[int] = None
    camera_id: Optional[int] = None
    rule_profile_id: Optional[int] = None
    exercise_type: str
    model_used: str = "mediapipe"
    gender: Optional[str] = "L"  # L (Pria) / P (Wanita)
    tolerance_deg: Optional[float] = 5.0
    source_type: Optional[str] = "camera"  # "camera" | "video_upload"
    video_path: Optional[str] = None
    annotated_video_path: Optional[str] = None
    examiner_notes: Optional[str] = None

class AssessmentSessionCreate(AssessmentSessionBase):
    pass

class AssessmentSessionResponse(AssessmentSessionBase):
    id: int
    session_code: str
    status: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: int
    detected_reps: int
    verified_reps: int
    rejected_reps: int
    avg_fps: float
    avg_latency_ms: float
    created_at: datetime
    updated_at: datetime
    participant: Optional[ParticipantResponse] = None
    camera: Optional[CameraResponse] = None
    rep_events: List[RepEventResponse] = []

    model_config = ConfigDict(from_attributes=True)

class SessionControlRequest(BaseModel):
    action: str  # "pause", "resume", "stop"
    examiner_notes: Optional[str] = None
    duration_seconds: Optional[int] = None
    verified_reps: Optional[int] = None
    rejected_reps: Optional[int] = None
    detected_reps: Optional[int] = None

class AssignParticipantRequest(BaseModel):
    participant_id: Optional[int] = None
    participant_number: Optional[str] = None
    full_name: Optional[str] = None
    gender: Optional[str] = None  # "L" | "P"
    organization: Optional[str] = None
    category: Optional[str] = None
    examiner_notes: Optional[str] = None

class ApproveSessionRequest(BaseModel):
    verified_reps: Optional[int] = None
    rejected_reps: Optional[int] = None
    examiner_notes: Optional[str] = None
    participant_id: Optional[int] = None

class RejectSessionRequest(BaseModel):
    reason: Optional[str] = None


