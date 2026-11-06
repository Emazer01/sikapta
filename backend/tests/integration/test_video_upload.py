import io
from pathlib import Path
import pytest
import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.participant import Participant
from app.models.assessment_session import AssessmentSession

client = TestClient(app)

def create_temp_test_video(path: Path, num_frames: int = 60) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(path), fourcc, 30.0, (640, 480))

    for i in range(num_frames):
        frame = np.full((480, 640, 3), 230, dtype=np.uint8)
        # Draw floor
        cv2.line(frame, (100, 350), (540, 350), (60, 60, 60), 4)
        # Draw human stick figure
        cv2.circle(frame, (400, 220), 20, (50, 50, 50), -1)
        cv2.line(frame, (380, 240), (320, 240), (0, 0, 180), 4)
        out.write(frame)

    out.release()
    return path

def test_upload_and_process_video_endpoint():
    db = SessionLocal()
    # Ensure a test participant exists
    part = db.query(Participant).first()
    if not part:
        part = Participant(
            participant_number="TEST-UPLOAD-01",
            full_name="Praka Budi Video",
            gender="L",
            category="TNI",
            is_active=True
        )
        db.add(part)
        db.commit()
        db.refresh(part)

    participant_id = part.id
    db.close()

    temp_video = settings.DATA_DIR / "temp_test_upload.mp4"
    create_temp_test_video(temp_video, num_frames=30)

    with open(temp_video, "rb") as f:
        file_bytes = f.read()

    response = client.post(
        "/api/assessments/upload-video",
        data={
            "participant_id": str(participant_id),
            "exercise_type": "pushup",
            "model_used": "mediapipe",
            "gender": "L",
            "tolerance_deg": "5.0",
            "examiner_notes": "Uji otomatis unggah video"
        },
        files={
            "file": ("test_pushup.mp4", file_bytes, "video/mp4")
        }
    )

    assert response.status_code == 201
    data = response.json()
    assert "session_id" in data
    assert "session_code" in data
    assert "annotated_video_url" in data
    assert data["exercise_type"] == "pushup"
    assert data["total_frames"] == 30

    session_id = data["session_id"]

    try:
        # Verify session in DB initially pending approval
        db = SessionLocal()
        sess = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
        assert sess is not None
        assert sess.source_type == "video_upload"
        assert sess.status == "pending_approval"
        assert sess.video_path is not None
        assert sess.annotated_video_path is not None
        db.close()

        # Examiner approves the video session
        app_res = client.post(f"/api/assessments/{session_id}/approve", json={
            "verified_reps": data.get("verified_reps", 0),
            "rejected_reps": data.get("rejected_reps", 0),
            "examiner_notes": "Video disetujui"
        })
        assert app_res.status_code == 200
        assert app_res.json()["status"] == "completed"

        # Verify session in DB is now completed
        db = SessionLocal()
        sess = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
        assert sess.status == "completed"
        db.close()

        # Test downloading annotated video
        res_video = client.get(f"/api/assessments/{session_id}/annotated-video")
        assert res_video.status_code == 200
        assert "video/mp4" in res_video.headers.get("content-type", "")
    finally:
        # CLEANUP: Remove test session, rep_events and temporary video files
        from app.models.rep_event import RepEvent
        clean_db = SessionLocal()
        clean_db.query(RepEvent).filter(RepEvent.session_id == session_id).delete(synchronize_session=False)
        clean_db.query(AssessmentSession).filter(AssessmentSession.id == session_id).delete(synchronize_session=False)
        clean_db.commit()
        clean_db.close()

        # Cleanup temp test video
        if temp_video.exists():
            temp_video.unlink(missing_ok=True)

