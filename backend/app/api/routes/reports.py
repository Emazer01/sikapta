import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.assessment_session import AssessmentSession
from app.models.rep_event import RepEvent
from app.models.participant import Participant
from app.services.reporting.pdf_report import generate_assessment_pdf
from app.services.reporting.csv_export import generate_sessions_csv
from app.api.deps import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("/sessions/{session_id}/pdf")
def download_session_pdf(session_id: int, db: Session = Depends(get_db)):
    session_record = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Sesi asesmen tidak ditemukan")

    part = session_record.participant
    rep_events = db.query(RepEvent).filter(RepEvent.session_id == session_id).order_by(RepEvent.rep_number.asc()).all()

    ver = session_record.verified_reps or 0
    rej = session_record.rejected_reps or 0
    det = max(session_record.detected_reps or 0, ver + rej)
    resolved_gender = session_record.gender or (part.gender if part else "L")
    resolved_tolerance = session_record.tolerance_deg if session_record.tolerance_deg is not None else 5.0

    session_data = {
        "id": session_record.id,
        "session_code": session_record.session_code,
        "exercise_type": session_record.exercise_type,
        "model_used": session_record.model_used,
        "gender": resolved_gender,
        "tolerance_deg": resolved_tolerance,
        "rule_profile_name": session_record.rule_profile.name if session_record.rule_profile else "Standar Kesamaptaan",
        "start_time": session_record.start_time.strftime("%d-%m-%Y %H:%M:%S WIB"),
        "duration_seconds": session_record.duration_seconds,
        "detected_reps": det,
        "verified_reps": ver,
        "rejected_reps": rej,
        "avg_fps": session_record.avg_fps,
        "avg_latency_ms": session_record.avg_latency_ms,
        "examiner_notes": session_record.examiner_notes,
        "participant": {
            "participant_number": part.participant_number if part else "-",
            "full_name": part.full_name if part else "-",
            "gender": resolved_gender,
            "category": part.category if part else "-",
            "organization": part.organization if part else "-"
        },
        "rep_events": [
            {
                "rep_number": r.rep_number,
                "status": r.status,
                "rejection_reason": r.rejection_reason,
                "peak_angle": r.peak_angle or 0.0,
                "min_angle": r.min_angle or 0.0,
                "feedback": r.feedback
            }
            for r in rep_events
        ]
    }

    pdf_filename = f"Laporan_SIKAPTA_{session_record.session_code}.pdf"
    pdf_path = settings.EXPORTS_DIR / pdf_filename

    generate_assessment_pdf(session_data, pdf_path)

    return FileResponse(
        path=str(pdf_path),
        filename=pdf_filename,
        media_type="application/pdf"
    )

@router.get("/sessions/csv")
def download_sessions_csv(db: Session = Depends(get_db)):
    sessions = db.query(AssessmentSession).order_by(AssessmentSession.id.desc()).all()
    sessions_data = []
    for s in sessions:
        part = s.participant
        sessions_data.append({
            "id": s.id,
            "session_code": s.session_code,
            "exercise_type": s.exercise_type,
            "model_used": s.model_used,
            "start_time": s.start_time.strftime("%Y-%m-%d %H:%M:%S"),
            "duration_seconds": s.duration_seconds,
            "verified_reps": s.verified_reps,
            "rejected_reps": s.rejected_reps,
            "detected_reps": s.detected_reps,
            "avg_fps": s.avg_fps,
            "avg_latency_ms": s.avg_latency_ms,
            "status": s.status,
            "examiner_notes": s.examiner_notes,
            "participant": {
                "participant_number": part.participant_number if part else "",
                "full_name": part.full_name if part else "",
                "organization": part.organization if part else ""
            }
        })

    csv_content = generate_sessions_csv(sessions_data)

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=SIKAPTA_Riwayat_Pengujian.csv"}
    )

