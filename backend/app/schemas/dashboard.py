from typing import List, Dict, Any
from pydantic import BaseModel
from app.schemas.assessment import AssessmentSessionResponse

class DashboardStatsResponse(BaseModel):
    total_participants: int
    total_sessions: int
    active_sessions_count: int
    total_reps_verified: int
    total_reps_detected: int
    online_cameras_count: int
    total_cameras_count: int
    active_default_model: str
    backend_status: str
    database_status: str
    database_dialect: str
    exercise_distribution: Dict[str, int]
    recent_sessions: List[AssessmentSessionResponse]
    rep_trend_daily: List[Dict[str, Any]]

