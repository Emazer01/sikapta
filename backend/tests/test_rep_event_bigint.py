import time
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.participant import Participant
from app.models.rep_event import RepEvent
from app.models.assessment_session import AssessmentSession

client = TestClient(app)

def test_stop_session_with_millisecond_timestamp_bigint():
    db = SessionLocal()
    # Create participant if needed
    p = db.query(Participant).first()
    if not p:
        p = Participant(
            participant_number="NRP-BIGINT-001",
            full_name="Tester Millisecond Timestamp",
            gender="L",
            organization="Yonif",
            category="Tamtama"
        )
        db.add(p)
        db.commit()
        db.refresh(p)
    p_id = p.id
    db.close()

    # Create session directly in DB
    db = SessionLocal()
    now_ts = int(time.time() * 1000)  # ~1.79 trillion, exceeds 32-bit int
    sess = AssessmentSession(
        session_code=f"SES-TEST-BIGINT-{now_ts % 100000}",
        participant_id=p_id,
        exercise_type="pullup",
        model_used="mediapipe",
        gender="L",
        status="in_progress"
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    sess_id = sess.id

    try:
        # Add RepEvent with large millisecond timestamp (> 2^31 - 1)
        large_ts_start = 1793703981910
        large_ts_end = 1793703983152

        rep = RepEvent(
            session_id=sess_id,
            rep_number=1,
            status="verified",
            start_timestamp_ms=large_ts_start,
            end_timestamp_ms=large_ts_end,
            peak_angle=153.86,
            min_angle=63.4,
            confidence_avg=0.85,
            feedback="Tarik Pull-up Sempurna!"
        )
        db.add(rep)
        db.commit()
        db.refresh(rep)

        assert rep.start_timestamp_ms == large_ts_start
        assert rep.end_timestamp_ms == large_ts_end
        db.close()

        # Now call POST /api/assessments/{sess_id}/control with action stop
        resp = client.post(f"/api/assessments/{sess_id}/control", json={
            "action": "stop",
            "duration_seconds": 60,
            "verified_reps": 1,
            "rejected_reps": 0,
            "detected_reps": 1
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending_approval"
        assert data["duration_seconds"] == 60
        assert data["verified_reps"] == 1

        # Examiner approves session
        app_resp = client.post(f"/api/assessments/{sess_id}/approve", json={
            "verified_reps": 1,
            "rejected_reps": 0
        })
        assert app_resp.status_code == 200
        assert app_resp.json()["status"] == "completed"
    finally:
        # CLEANUP: Remove test session and its rep_events
        clean_db = SessionLocal()
        clean_db.query(RepEvent).filter(RepEvent.session_id == sess_id).delete(synchronize_session=False)
        clean_db.query(AssessmentSession).filter(AssessmentSession.id == sess_id).delete(synchronize_session=False)
        clean_db.commit()
        clean_db.close()

