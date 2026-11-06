import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "degraded"]
    assert data["app_name"] == "SIKAPTA AI"
    assert "database" in data

def test_dashboard_stats():
    response = client.get("/api/dashboard/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_participants" in data
    assert "total_sessions" in data
    assert "exercise_distribution" in data

def test_participants_crud():
    from app.core.database import SessionLocal
    from app.models.participant import Participant

    # 1. Create
    test_participant_number = "TEST-PESERTA-999"
    payload = {
        "participant_number": test_participant_number,
        "full_name": "Peserta Uji Otomatis",
        "gender": "L",
        "category": "Taruna",
        "organization": "Pusdikjas",
        "notes": "Testing integration"
    }
    part_id = None
    try:
        create_res = client.post("/api/participants/", json=payload)
        assert create_res.status_code in [201, 400]

        # 2. List
        list_res = client.get(f"/api/participants/?search={test_participant_number}")
        assert list_res.status_code == 200
        participants = list_res.json()
        assert len(participants) >= 1

        part_id = participants[0]["id"]

        # 3. Get Detail
        detail_res = client.get(f"/api/participants/{part_id}")
        assert detail_res.status_code == 200
        assert detail_res.json()["participant_number"] == test_participant_number
    finally:
        # CLEANUP
        clean_db = SessionLocal()
        clean_db.query(Participant).filter(Participant.participant_number == test_participant_number).delete(synchronize_session=False)
        clean_db.commit()
        clean_db.close()

def test_cameras_endpoints():
    res = client.get("/api/cameras/")
    assert res.status_code == 200
    cameras = res.json()
    assert isinstance(cameras, list)

    # Test camera connection endpoint (dry test)
    test_res = client.post("/api/cameras/test-connection", json={
        "camera_type": "webcam",
        "device_index": 999  # Non-existent index to test clean failure handling
    })
    assert test_res.status_code == 200
    assert "success" in test_res.json()

def test_rule_profiles():
    res = client.get("/api/rule-profiles/")
    assert res.status_code == 200
    profiles = res.json()
    assert len(profiles) >= 3  # pushup, pullup, situp default profiles

def test_assign_participant_to_session_and_pdf():
    from app.core.database import SessionLocal
    from app.models.participant import Participant
    from app.models.assessment_session import AssessmentSession
    from app.models.rep_event import RepEvent

    session_id = None
    # 1. Create a participant
    part_res = client.post("/api/participants/", json={
        "participant_number": "TEST-ASSIGN-001",
        "full_name": "Peserta Uji Awal",
        "gender": "L",
        "organization": "Kompi A",
        "category": "Tamtama"
    })
    assert part_res.status_code in [201, 400]
    if part_res.status_code == 201:
        p_id = part_res.json()["id"]
    else:
        all_p = client.get("/api/participants/?search=TEST-ASSIGN-001").json()
        p_id = all_p[0]["id"]

    try:
        # 2. Create assessment session
        sess_res = client.post("/api/assessments/", json={
            "participant_id": p_id,
            "exercise_type": "pushup",
            "model_used": "mediapipe",
            "gender": "L",
            "tolerance_deg": 5.0
        })
        assert sess_res.status_code == 201
        session_id = sess_res.json()["id"]

        # 3. Stop session
        client.post(f"/api/assessments/{session_id}/control", json={"action": "stop"})

        # 4. Assign new participant identity
        assign_res = client.post(f"/api/assessments/{session_id}/assign-participant", json={
            "participant_number": "NRP-998877",
            "full_name": "Serda Pratama Sukses",
            "gender": "L",
            "organization": "Yonif Terpadu",
            "category": "Bintara",
            "examiner_notes": "Sikap badan lurus sempurna"
        })
        assert assign_res.status_code == 200
        updated_session = assign_res.json()
        assert updated_session["participant"]["participant_number"] == "NRP-998877"
        assert updated_session["participant"]["full_name"] == "Serda Pratama Sukses"
        assert updated_session["examiner_notes"] == "Sikap badan lurus sempurna"

        # 5. Check PDF generation
        pdf_res = client.get(f"/api/reports/sessions/{session_id}/pdf")
        assert pdf_res.status_code == 200
        assert len(pdf_res.content) > 1000
    finally:
        # CLEANUP
        clean_db = SessionLocal()
        if session_id:
            clean_db.query(RepEvent).filter(RepEvent.session_id == session_id).delete(synchronize_session=False)
            clean_db.query(AssessmentSession).filter(AssessmentSession.id == session_id).delete(synchronize_session=False)
        clean_db.query(Participant).filter(Participant.participant_number == "TEST-ASSIGN-001").delete(synchronize_session=False)
        clean_db.commit()
        clean_db.close()

def test_bulk_create_participants():
    from app.core.database import SessionLocal
    from app.models.participant import Participant

    payload = {
        "participants": [
            {
                "participant_number": "TEST-BULK-001",
                "full_name": "Peserta Bulk Satu",
                "gender": "L",
                "organization": "Batalyon 1",
                "category": "Tamtama"
            },
            {
                "participant_number": "TEST-BULK-002",
                "full_name": "Peserta Bulk Dua",
                "gender": "P",
                "organization": "Pusdiklat",
                "category": "Bintara"
            }
        ]
    }
    try:
        res = client.post("/api/participants/bulk", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["total_received"] == 2
        assert data["inserted_count"] + data["updated_count"] == 2
        assert len(data["participants"]) == 2
    finally:
        # CLEANUP
        clean_db = SessionLocal()
        clean_db.query(Participant).filter(
            Participant.participant_number.in_(["TEST-BULK-001", "TEST-BULK-002"])
        ).delete(synchronize_session=False)
        clean_db.commit()
        clean_db.close()

def test_session_stop_with_metrics_no_error():
    from app.core.database import SessionLocal
    from app.models.assessment_session import AssessmentSession
    from app.models.rep_event import RepEvent

    # 1. Get or create participant
    p_res = client.get("/api/participants/?limit=1")
    p_id = p_res.json()[0]["id"]
    session_id = None

    try:
        # 2. Start session
        sess_res = client.post("/api/assessments/", json={
            "participant_id": p_id,
            "exercise_type": "pullup",
            "model_used": "mediapipe",
            "gender": "L",
            "tolerance_deg": 5.0
        })
        assert sess_res.status_code == 201
        session_id = sess_res.json()["id"]

        # 3. Stop session with metrics payload
        stop_res = client.post(f"/api/assessments/{session_id}/control", json={
            "action": "stop",
            "duration_seconds": 15,
            "verified_reps": 5,
            "rejected_reps": 1,
            "detected_reps": 6,
            "examiner_notes": "Uji selesai sukses"
        })
        assert stop_res.status_code == 200
        stopped = stop_res.json()
        assert stopped["status"] == "pending_approval"
        assert stopped["verified_reps"] >= 5
        assert stopped["duration_seconds"] >= 15
        assert stopped["detected_reps"] >= 6

        # 4. Examiner approves the session
        approve_res = client.post(f"/api/assessments/{session_id}/approve", json={
            "verified_reps": 5,
            "rejected_reps": 1,
            "examiner_notes": "Disetujui oleh penguji"
        })
        assert approve_res.status_code == 200
        approved = approve_res.json()
        assert approved["status"] == "completed"
        assert approved["verified_reps"] == 5
    finally:
        # CLEANUP
        if session_id:
            clean_db = SessionLocal()
            clean_db.query(RepEvent).filter(RepEvent.session_id == session_id).delete(synchronize_session=False)
            clean_db.query(AssessmentSession).filter(AssessmentSession.id == session_id).delete(synchronize_session=False)
            clean_db.commit()
            clean_db.close()



