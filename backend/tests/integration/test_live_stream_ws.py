import pytest
import asyncio
import json
from fastapi.testclient import TestClient
from app.main import app
from app.services.assessment.session_manager import session_manager
from app.core.database import SessionLocal
from app.models.participant import Participant
from app.models.camera import Camera
from app.models.rule_profile import RuleProfile

def test_websocket_live_stream():
    client = TestClient(app)

    # 1. Ensure test participant, camera, and rule profile exist
    db = SessionLocal()
    participant = db.query(Participant).first()
    if not participant:
        participant = Participant(
            nik="9999999999999999",
            full_name="Peserta Uji WS",
            gender="L",
            birth_date="1995-01-01",
            category="TNI",
            unit="Mabes",
            status="active"
        )
        db.add(participant)
        db.commit()
        db.refresh(participant)

    camera = db.query(Camera).first()
    rule_profile = db.query(RuleProfile).filter(RuleProfile.exercise_type == "pushup").first()

    session_id = None
    yolo_session_id = None

    try:
        # 2. Create assessment session via REST API
        res = client.post("/api/assessments/", json={
            "participant_id": participant.id,
            "camera_id": camera.id if camera else None,
            "exercise_type": "pushup",
            "model_used": "mediapipe",
            "rule_profile_id": rule_profile.id if rule_profile else None,
            "examiner_notes": "Test Live WS Stream"
        })
        assert res.status_code == 201
        session_data = res.json()
        session_id = session_data["id"]

        # 3. Connect to WebSocket and verify live stream packets
        with client.websocket_connect(f"/ws/assessments/{session_id}/live") as ws:
            received = 0
            for _ in range(5):
                data = ws.receive_json()
                assert data["session_id"] == session_id
                assert "frame" in data
                assert "fps" in data
                assert "latency_ms" in data
                assert "current_angle" in data
                assert "phase" in data
                # Verify frame is non-empty base64 string
                assert data["frame"] is not None and len(data["frame"]) > 500
                received += 1

            assert received >= 5

        # 4. Stop session
        stop_res = client.post(f"/api/assessments/{session_id}/control", json={
            "action": "stop",
            "examiner_notes": "WS Test Completed"
        })
        assert stop_res.status_code == 200

        # 5. Also test YOLO model live stream
        res_yolo = client.post("/api/assessments/", json={
            "participant_id": participant.id,
            "camera_id": camera.id if camera else None,
            "exercise_type": "pushup",
            "model_used": "yolo",
            "rule_profile_id": rule_profile.id if rule_profile else None,
            "examiner_notes": "Test Live WS Stream YOLO"
        })
        assert res_yolo.status_code == 201
        yolo_session_id = res_yolo.json()["id"]

        with client.websocket_connect(f"/ws/assessments/{yolo_session_id}/live") as ws:
            received = 0
            for _ in range(5):
                data = ws.receive_json()
                assert data["session_id"] == yolo_session_id
                assert data["model"] == "yolo"
                assert "frame" in data
                assert data["frame"] is not None and len(data["frame"]) > 500
                received += 1
            assert received >= 5

        client.post(f"/api/assessments/{yolo_session_id}/control", json={
            "action": "stop",
            "examiner_notes": "YOLO WS Test Completed"
        })
    finally:
        # CLEANUP: Delete created test sessions
        from app.models.assessment_session import AssessmentSession
        from app.models.rep_event import RepEvent
        clean_db = SessionLocal()
        s_ids = [s for s in [session_id, yolo_session_id] if s is not None]
        if s_ids:
            clean_db.query(RepEvent).filter(RepEvent.session_id.in_(s_ids)).delete(synchronize_session=False)
            clean_db.query(AssessmentSession).filter(AssessmentSession.id.in_(s_ids)).delete(synchronize_session=False)
            clean_db.commit()
        clean_db.close()
        db.close()
