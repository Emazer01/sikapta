import asyncio
import time
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.config import settings
from app.core.database import get_db
from app.models.assessment_session import AssessmentSession
from app.models.participant import Participant
from app.models.rule_profile import RuleProfile
from app.models.rep_event import RepEvent
from app.models.audit_log import AuditLog
from app.schemas.assessment import (
    AssessmentSessionCreate, AssessmentSessionResponse, SessionControlRequest, AssignParticipantRequest,
    ApproveSessionRequest, RejectSessionRequest
)
from app.services.assessment.session_manager import session_manager
from app.services.assessment.video_processor import VideoProcessorService
from app.api.deps import get_current_user

router = APIRouter(prefix="/assessments", tags=["Assessments"])

@router.get("/", response_model=List[AssessmentSessionResponse])
def get_assessment_sessions(
    participant_id: Optional[int] = None,
    event_id: Optional[int] = None,
    exercise_type: Optional[str] = None,
    model_used: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(AssessmentSession)
    if participant_id:
        query = query.filter(AssessmentSession.participant_id == participant_id)
    if event_id:
        query = query.filter(AssessmentSession.event_id == event_id)
    if exercise_type:
        query = query.filter(AssessmentSession.exercise_type == exercise_type)
    if model_used:
        query = query.filter(AssessmentSession.model_used == model_used)
    if status_filter:
        query = query.filter(AssessmentSession.status == status_filter)

    return query.order_by(AssessmentSession.id.desc()).offset(skip).limit(limit).all()

def generate_session_code(db: Session) -> str:
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"SES-{date_str}-"
    latest = (
        db.query(AssessmentSession.session_code)
        .filter(AssessmentSession.session_code.like(f"{prefix}%"))
        .order_by(AssessmentSession.session_code.desc())
        .first()
    )
    if latest and latest[0]:
        try:
            num = int(latest[0].split("-")[-1]) + 1
        except Exception:
            num = db.query(AssessmentSession).count() + 1
    else:
        num = 1

    candidate = f"{prefix}{num:04d}"
    while db.query(AssessmentSession).filter(AssessmentSession.session_code == candidate).first():
        num += 1
        candidate = f"{prefix}{num:04d}"
    return candidate

@router.post("/", response_model=AssessmentSessionResponse, status_code=status.HTTP_201_CREATED)
def create_assessment_session(
    data: AssessmentSessionCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    participant = db.query(Participant).filter(Participant.id == data.participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")

    # Resolve rule profile
    rule_profile = None
    if data.rule_profile_id:
        rule_profile = db.query(RuleProfile).filter(RuleProfile.id == data.rule_profile_id).first()
    if not rule_profile:
        rule_profile = db.query(RuleProfile).filter(
            RuleProfile.exercise_type == data.exercise_type,
            RuleProfile.is_default == True
        ).first()

    rule_config = dict(rule_profile.config_json) if rule_profile else {}
    resolved_gender = (data.gender or (participant.gender if participant else "L")).upper()
    resolved_tolerance = float(data.tolerance_deg) if data.tolerance_deg is not None else 5.0

    rule_config["gender"] = resolved_gender
    rule_config["tolerance_deg"] = resolved_tolerance

    # Generate session code
    session_code = generate_session_code(db)

    session_record = AssessmentSession(
        session_code=session_code,
        participant_id=data.participant_id,
        event_id=data.event_id,
        camera_id=data.camera_id,
        rule_profile_id=rule_profile.id if rule_profile else None,
        examiner_id=current_user.id if current_user else None,
        exercise_type=data.exercise_type,
        model_used=data.model_used,
        gender=resolved_gender,
        tolerance_deg=resolved_tolerance,
        status="in_progress",
        start_time=datetime.now(timezone.utc),
        examiner_notes=data.examiner_notes
    )

    db.add(session_record)
    db.commit()
    db.refresh(session_record)

    # Start live assessment worker session
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = session_manager.main_loop

    session_manager.create_session(
        session_id=session_record.id,
        session_code=session_record.session_code,
        participant_id=session_record.participant_id,
        camera_id=session_record.camera_id,
        exercise_type=session_record.exercise_type,
        model_name=session_record.model_used,
        rule_config=rule_config,
        gender=resolved_gender,
        tolerance_deg=resolved_tolerance,
        loop=loop
    )

    audit = AuditLog(
        user_id=current_user.id if current_user else None,
        action="START_SESSION",
        resource_type="session",
        resource_id=str(session_record.id),
        details=f"Memulai sesi asesmen {session_record.session_code} ({session_record.exercise_type}) untuk {participant.full_name}"
    )
    db.add(audit)
    db.commit()

    return session_record

@router.get("/{session_id}", response_model=AssessmentSessionResponse)
def get_assessment_session_by_id(session_id: int, db: Session = Depends(get_db)):
    session_record = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Sesi asesmen tidak ditemukan")
    return session_record

@router.post("/{session_id}/control", response_model=AssessmentSessionResponse)
def control_assessment_session(
    session_id: int,
    req: SessionControlRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    session_record = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Sesi asesmen tidak ditemukan")

    active_session = session_manager.get_session(session_id)
    action = req.action.lower()

    if action == "pause":
        if active_session:
            active_session.pause()
        session_record.status = "paused"
    elif action == "resume":
        if active_session:
            active_session.resume()
        session_record.status = "in_progress"
    elif action == "stop":
        rep_events_to_save = []
        if active_session:
            analyzer = active_session.analyzer
            analysis = active_session.latest_analysis
            now = time.time()
            duration = max(1, int(now - active_session.start_time))
            avg_fps = round(sum(active_session.fps_list) / len(active_session.fps_list), 1) if active_session.fps_list else 30.0
            avg_lat = round(sum(active_session.latencies) / len(active_session.latencies), 1) if active_session.latencies else 0.0

            det = analyzer.detected_reps if analyzer else (analysis.detected_reps if analysis else 0)
            ver = analyzer.verified_reps if analyzer else (analysis.verified_reps if analysis else 0)
            rej = analyzer.rejected_reps if analyzer else (analysis.rejected_reps if analysis else 0)

            # Check if client sent fallback metrics
            if req.verified_reps is not None:
                ver = max(ver, req.verified_reps)
            if req.rejected_reps is not None:
                rej = max(rej, req.rejected_reps)
            if req.detected_reps is not None:
                det = max(det, req.detected_reps, ver + rej)
            else:
                det = max(det, ver + rej)
            if req.duration_seconds is not None and req.duration_seconds > 0:
                duration = max(duration, req.duration_seconds)

            session_record.status = "pending_approval"
            session_record.end_time = datetime.now(timezone.utc)
            session_record.duration_seconds = duration
            session_record.detected_reps = det
            session_record.verified_reps = ver
            session_record.rejected_reps = rej
            session_record.avg_fps = avg_fps
            session_record.avg_latency_ms = avg_lat

            rep_events_to_save = list(active_session.rep_events_to_save)

            # Release hardware & stop thread cleanly without secondary DB connection conflict
            session_manager.stop_session(session_id, save_to_db=False)
        else:
            session_record.status = "pending_approval"
            session_record.end_time = datetime.now(timezone.utc)
            if req.verified_reps is not None:
                session_record.verified_reps = max(session_record.verified_reps or 0, req.verified_reps)
            if req.rejected_reps is not None:
                session_record.rejected_reps = max(session_record.rejected_reps or 0, req.rejected_reps)
            if req.detected_reps is not None:
                session_record.detected_reps = max(session_record.detected_reps or 0, req.detected_reps, (session_record.verified_reps or 0) + (session_record.rejected_reps or 0))
            else:
                session_record.detected_reps = max(session_record.detected_reps or 0, (session_record.verified_reps or 0) + (session_record.rejected_reps or 0))
            if req.duration_seconds is not None and req.duration_seconds > 0:
                session_record.duration_seconds = max(session_record.duration_seconds or 0, req.duration_seconds)

        # Save any RepEvents accumulated in active session without duplicates
        if rep_events_to_save:
            try:
                existing_reps = {r.rep_number for r in db.query(RepEvent.rep_number).filter(RepEvent.session_id == session_id).all()}
                for rep in rep_events_to_save:
                    if rep.rep_number not in existing_reps:
                        db.add(RepEvent(
                            session_id=session_id,
                            rep_number=rep.rep_number,
                            status="verified" if rep.is_valid else "rejected",
                            rejection_reason=rep.rejection_reason,
                            start_timestamp_ms=int(rep.start_time_ms) if rep.start_time_ms else None,
                            end_timestamp_ms=int(rep.end_time_ms) if rep.end_time_ms else None,
                            peak_angle=rep.peak_angle,
                            min_angle=rep.min_angle,
                            confidence_avg=0.85,
                            feedback=rep.feedback
                        ))
                        existing_reps.add(rep.rep_number)
            except Exception as e:
                logger.warning(f"Gagal mencatat rincian rep_events untuk sesi {session_id}: {e}")
    else:
        raise HTTPException(status_code=400, detail="Aksi tidak dikenal. Gunakan 'pause', 'resume', atau 'stop'")

    if req.examiner_notes:
        session_record.examiner_notes = req.examiner_notes

    db.commit()
    db.refresh(session_record)
    return session_record

@router.post("/{session_id}/assign-participant", response_model=AssessmentSessionResponse)
def assign_participant_to_session(
    session_id: int,
    req: AssignParticipantRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    session_record = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Sesi asesmen tidak ditemukan")

    target_participant = None

    # Option A: Participant ID explicitly specified
    if req.participant_id:
        target_participant = db.query(Participant).filter(Participant.id == req.participant_id).first()
        if not target_participant:
            raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")
        if req.full_name:
            target_participant.full_name = req.full_name.strip()
        if req.gender:
            target_participant.gender = req.gender
        if req.organization:
            target_participant.organization = req.organization.strip()
        if req.category:
            target_participant.category = req.category.strip()

    # Option B: Participant Number specified (lookup or create)
    elif req.participant_number and req.participant_number.strip():
        num_clean = req.participant_number.strip()
        existing = db.query(Participant).filter(Participant.participant_number == num_clean).first()
        if existing:
            target_participant = existing
            if req.full_name:
                target_participant.full_name = req.full_name.strip()
            if req.gender:
                target_participant.gender = req.gender
            if req.organization:
                target_participant.organization = req.organization.strip()
            if req.category:
                target_participant.category = req.category.strip()
        else:
            target_participant = Participant(
                participant_number=num_clean,
                full_name=req.full_name.strip() if req.full_name else f"Peserta {num_clean}",
                gender=req.gender or session_record.gender or "L",
                organization=req.organization.strip() if req.organization else "Umum",
                category=req.category.strip() if req.category else "Umum"
            )
            db.add(target_participant)
            db.flush()

    # Option C: Only full name specified
    elif req.full_name and req.full_name.strip():
        auto_num = f"PST-{int(time.time())}"
        target_participant = Participant(
            participant_number=auto_num,
            full_name=req.full_name.strip(),
            gender=req.gender or session_record.gender or "L",
            organization=req.organization.strip() if req.organization else "Umum",
            category=req.category.strip() if req.category else "Umum"
        )
        db.add(target_participant)
        db.flush()

    if target_participant:
        session_record.participant_id = target_participant.id
        if target_participant.gender:
            session_record.gender = target_participant.gender
        if req.gender:
            session_record.gender = req.gender

    if req.examiner_notes:
        session_record.examiner_notes = req.examiner_notes

    db.commit()
    db.refresh(session_record)

    audit = AuditLog(
        user_id=current_user.id if current_user else None,
        action="ASSIGN_PARTICIPANT",
        resource_type="session",
        resource_id=str(session_record.id),
        details=f"Menghubungkan identitas peserta {target_participant.full_name if target_participant else '-'} ke sesi {session_record.session_code}"
    )
    db.add(audit)
    db.commit()

    return session_record

@router.post("/{session_id}/approve", response_model=AssessmentSessionResponse)
def approve_assessment_session(
    session_id: int,
    req: ApproveSessionRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Menyetujui dan menyimpan hasil pengujian ke database secara resmi.
    Penguji dapat mengonfirmasi atau mengoreksi jumlah repetisi sah/ditolak dan catatan.
    """
    session_record = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Sesi asesmen tidak ditemukan")

    if req.participant_id:
        p = db.query(Participant).filter(Participant.id == req.participant_id).first()
        if p:
            session_record.participant_id = p.id
            if p.gender:
                session_record.gender = p.gender

    if req.verified_reps is not None:
        session_record.verified_reps = max(0, req.verified_reps)
    if req.rejected_reps is not None:
        session_record.rejected_reps = max(0, req.rejected_reps)

    session_record.detected_reps = max(
        session_record.detected_reps or 0,
        (session_record.verified_reps or 0) + (session_record.rejected_reps or 0)
    )

    if req.examiner_notes is not None:
        session_record.examiner_notes = req.examiner_notes

    session_record.status = "completed"
    session_record.updated_at = datetime.now(timezone.utc)
    if not session_record.end_time:
        session_record.end_time = datetime.now(timezone.utc)

    db.commit()
    db.refresh(session_record)

    audit = AuditLog(
        user_id=current_user.id if current_user else None,
        action="ASSESSMENT_APPROVED",
        resource_type="session",
        resource_id=str(session_record.id),
        details=f"Persetujuan (Approval) hasil pengujian {session_record.session_code}: {session_record.verified_reps} sah / {session_record.rejected_reps} ditolak"
    )
    db.add(audit)
    db.commit()

    return session_record

@router.post("/{session_id}/reject")
def reject_assessment_session(
    session_id: int,
    req: RejectSessionRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Menolak atau membatalkan hasil pengujian sehingga tidak disimpan ke rekapitulasi resmi.
    """
    session_record = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Sesi asesmen tidak ditemukan")

    session_record.status = "cancelled"
    session_record.updated_at = datetime.now(timezone.utc)
    if req.reason:
        existing_notes = session_record.examiner_notes or ""
        session_record.examiner_notes = f"{existing_notes} [Ditolak Penguji: {req.reason}]".strip()

    # Hapus rep_events agar tidak mengotori statistik
    db.query(RepEvent).filter(RepEvent.session_id == session_id).delete()

    db.commit()

    audit = AuditLog(
        user_id=current_user.id if current_user else None,
        action="ASSESSMENT_REJECTED",
        resource_type="session",
        resource_id=str(session_record.id),
        details=f"Penolakan / pembatalan hasil asesmen {session_record.session_code}. Alasan: {req.reason or 'Dibatalkan penguji'}"
    )
    db.add(audit)
    db.commit()

    return {
        "message": f"Sesi {session_record.session_code} berhasil ditolak dan tidak disimpan ke rekapitulasi.",
        "session_id": session_record.id,
        "status": "cancelled"
    }

@router.post("/upload-video", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def upload_and_process_video(
    file: UploadFile = File(...),
    participant_id: int = Form(...),
    exercise_type: str = Form(...),
    model_used: str = Form("mediapipe"),
    gender: str = Form("L"),
    tolerance_deg: float = Form(5.0),
    event_id: Optional[int] = Form(None),
    examiner_notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Upload a video file to run automated movement detection and analytics.
    Generates an annotated MP4 video with skeleton and HUD, records repetition events,
    and saves the session result to PostgreSQL.
    """
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")

    # Validate file extension
    ext = Path(file.filename or "video.mp4").suffix.lower()
    if ext not in [".mp4", ".avi", ".mov", ".mkv", ".webm"]:
        raise HTTPException(status_code=400, detail="Format video tidak didukung. Harap gunakan MP4, AVI, MOV, atau MKV.")

    # Save uploaded file
    settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    safe_filename = f"upload_{int(time.time())}_{participant_id}{ext}"
    saved_path = settings.UPLOADS_DIR / safe_filename

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Resolve rule profile
    rule_profile = db.query(RuleProfile).filter(
        RuleProfile.exercise_type == exercise_type,
        RuleProfile.is_default == True
    ).first()
    rule_config = dict(rule_profile.config_json) if rule_profile else {}

    # Generate session code
    session_code = generate_session_code(db)

    resolved_gender = gender.upper()
    resolved_tolerance = float(tolerance_deg)

    # Create session record in DB
    session_record = AssessmentSession(
        session_code=session_code,
        participant_id=participant_id,
        event_id=event_id,
        camera_id=None,
        rule_profile_id=rule_profile.id if rule_profile else None,
        examiner_id=current_user.id if current_user else None,
        exercise_type=exercise_type,
        model_used=model_used,
        gender=resolved_gender,
        tolerance_deg=resolved_tolerance,
        source_type="video_upload",
        video_path=str(saved_path),
        status="in_progress",
        start_time=datetime.now(timezone.utc),
        examiner_notes=examiner_notes
    )
    db.add(session_record)
    db.commit()
    db.refresh(session_record)

    # Process video
    try:
        result = VideoProcessorService.process_video_session(
            session_id=session_record.id,
            video_path=saved_path,
            exercise_type=exercise_type,
            model_name=model_used,
            gender=resolved_gender,
            tolerance_deg=resolved_tolerance,
            rule_config=rule_config
        )

        audit = AuditLog(
            user_id=current_user.id if current_user else None,
            action="VIDEO_ASSESSMENT",
            resource_type="session",
            resource_id=str(session_record.id),
            details=f"Pemrosesan video asesmen {session_record.session_code} ({exercise_type}) untuk {participant.full_name}"
        )
        db.add(audit)
        db.commit()

        return result

    except Exception as e:
        session_record.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Gagal memproses video: {str(e)}")

@router.get("/{session_id}/annotated-video")
def get_annotated_video(session_id: int, db: Session = Depends(get_db)):
    """Stream or download the annotated video of a session."""
    session_record = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if not session_record or not session_record.annotated_video_path:
        raise HTTPException(status_code=404, detail="Video beranotasi tidak ditemukan untuk sesi ini")

    video_file = Path(session_record.annotated_video_path)
    if not video_file.exists():
        raise HTTPException(status_code=404, detail="File video beranotasi tidak ditemukan pada disk")

    return FileResponse(
        path=str(video_file),
        media_type="video/mp4",
        filename=video_file.name
    )

@router.get("/{session_id}/source-video")
def get_source_video(session_id: int, db: Session = Depends(get_db)):
    """Stream or download the original source video uploaded for a session."""
    session_record = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if not session_record or not session_record.video_path:
        raise HTTPException(status_code=404, detail="File video asli tidak ditemukan untuk sesi ini")

    video_file = Path(session_record.video_path)
    if not video_file.exists():
        raise HTTPException(status_code=404, detail="File video asli tidak ditemukan pada disk")

    return FileResponse(
        path=str(video_file),
        media_type="video/mp4",
        filename=video_file.name
    )


