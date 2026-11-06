from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.config import settings
from app.core.database import get_db, DB_DIALECT
from app.models.participant import Participant
from app.models.camera import Camera
from app.models.assessment_session import AssessmentSession
from app.models.rep_event import RepEvent
from app.schemas.dashboard import DashboardStatsResponse
from app.schemas.assessment import AssessmentSessionResponse
from app.services.assessment.session_manager import session_manager

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_participants = db.query(Participant).count()
    total_sessions = db.query(AssessmentSession).count()
    active_sessions_count = len(session_manager.active_sessions)

    # Calculate reps totals
    total_verified = db.query(func.coalesce(func.sum(AssessmentSession.verified_reps), 0)).scalar() or 0
    total_detected = db.query(func.coalesce(func.sum(AssessmentSession.detected_reps), 0)).scalar() or 0

    total_cameras = db.query(Camera).count()
    online_cameras = db.query(Camera).filter(Camera.status == "online").count()

    # Exercise distribution
    dist = {"pushup": 0, "pullup": 0, "situp": 0}
    ex_counts = db.query(
        AssessmentSession.exercise_type,
        func.count(AssessmentSession.id)
    ).group_by(AssessmentSession.exercise_type).all()
    for ex_type, cnt in ex_counts:
        dist[ex_type] = cnt

    # Recent 5 sessions
    recent_records = db.query(AssessmentSession).order_by(AssessmentSession.created_at.desc()).limit(5).all()
    recent_sessions = [AssessmentSessionResponse.model_validate(r) for r in recent_records]

    # Daily rep trend for the last 7 days
    now = datetime.now(timezone.utc)
    rep_trend_daily = []
    for day_offset in range(6, -1, -1):
        target_date = (now - timedelta(days=day_offset)).date()
        day_str = target_date.strftime("%d %b")

        # Query reps for this date
        day_start = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone.utc)
        day_end = datetime.combine(target_date, datetime.max.time()).replace(tzinfo=timezone.utc)

        v_sum = db.query(func.coalesce(func.sum(AssessmentSession.verified_reps), 0)).filter(
            AssessmentSession.created_at >= day_start,
            AssessmentSession.created_at <= day_end
        ).scalar() or 0

        r_sum = db.query(func.coalesce(func.sum(AssessmentSession.rejected_reps), 0)).filter(
            AssessmentSession.created_at >= day_start,
            AssessmentSession.created_at <= day_end
        ).scalar() or 0

        rep_trend_daily.append({
            "date": day_str,
            "verified": int(v_sum),
            "rejected": int(r_sum),
            "total": int(v_sum + r_sum)
        })

    return DashboardStatsResponse(
        total_participants=total_participants,
        total_sessions=total_sessions,
        active_sessions_count=active_sessions_count,
        total_reps_verified=int(total_verified),
        total_reps_detected=int(total_detected),
        online_cameras_count=online_cameras,
        total_cameras_count=total_cameras,
        active_default_model=settings.DEFAULT_VISION_MODEL,
        backend_status="healthy",
        database_status="connected",
        database_dialect=DB_DIALECT,
        exercise_distribution=dist,
        recent_sessions=recent_sessions,
        rep_trend_daily=rep_trend_daily
    )

