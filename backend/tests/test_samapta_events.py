import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.assessment.running_score import (
    calculate_run_distance,
    calculate_run_score,
    calculate_calisthenics_score,
    evaluate_total_samapta
)

client = TestClient(app)

def test_running_distance_and_score():
    # 7 putaran @ 400m + 200m = 3000m
    dist = calculate_run_distance(laps=7, track_length_meters=400.0, extra_meters=200.0)
    assert dist == 3000.0

    # Pria 3000m -> 80.0
    score_male = calculate_run_score(3000.0, gender="L")
    assert score_male == 80.0

    # Wanita 3095m -> 100.0
    score_female = calculate_run_score(3095.0, gender="P")
    assert score_female == 100.0

    # Pria 3444m -> 100.0
    assert calculate_run_score(3500.0, gender="L") == 100.0

    # Calisthenics scoring
    assert calculate_calisthenics_score("pullup", 18, "L") == 100.0
    assert calculate_calisthenics_score("pushup", 43, "L") == 100.0
    assert calculate_calisthenics_score("situp", 43, "L") == 100.0

    final_s, pred = evaluate_total_samapta(80.0, [80.0, 80.0, 80.0])
    assert final_s == 80.0
    assert "BAIK" in pred

def test_samapta_event_lifecycle():
    import uuid
    run_id = str(uuid.uuid4())[:8]

    # 1. Create event
    event_payload = {
        "name": f"Uji Samapta Semester I 2026 {run_id}",
        "location": "Stadion Jasdam V/Brawijaya",
        "start_date": "2026-11-10",
        "end_date": "2026-11-12",
        "description": "Pelaksanaan tes kesamaptaan jasmani berkala",
        "track_length_meters": 400.0,
        "total_waves": 2,
        "status": "scheduled"
    }
    resp = client.post("/api/events", json=event_payload)
    assert resp.status_code == 201
    event_data = resp.json()
    event_id = event_data["id"]
    assert event_data["name"] == event_payload["name"]
    assert "EVT-" in event_data["event_code"]

    from app.core.database import SessionLocal
    from app.models.participant import Participant
    from app.models.samapta_event import SamaptaEvent
    from app.models.event_participant import EventParticipant

    nrp_existing = f"NRP-EXIST-{run_id}"
    nrp_new1 = f"NRP-NEW1-{run_id}"
    nrp_new2 = f"NRP-NEW2-{run_id}"

    try:
        # 2. Bulk insert participants (campuran peserta baru dan yang sudah ada)
        db = SessionLocal()
        existing_p = Participant(
            participant_number=nrp_existing,
            full_name="Kapten Anton Subekti",
            gender="L",
            organization="Yonif 500",
            category="Perwira"
        )
        db.add(existing_p)
        db.commit()
        db.close()

        bulk_payload = {
            "participants": [
                {
                    "nrp": nrp_existing,  # Sudah ada di DB, harus dipakai ulang
                    "name": "Kapten Anton Subekti Diperbarui",
                    "gender": "L",
                    "unit": "Yonif 500 Raider",
                    "category": "Perwira"
                },
                {
                    "nrp": nrp_new1,  # Belum ada di DB, harus dibuat baru
                    "name": "Sertu Budi Santoso",
                    "gender": "L",
                    "unit": "Kodim 0830",
                    "category": "Bintara"
                },
                {
                    "nrp": nrp_new2,
                    "name": "Serda Dewi Lestari",
                    "gender": "P",
                    "unit": "Kowad",
                    "category": "Bintara"
                }
            ]
        }
        bulk_resp = client.post(f"/api/events/{event_id}/participants/bulk", json=bulk_payload)
        assert bulk_resp.status_code == 200
        bulk_result = bulk_resp.json()
        assert bulk_result["total_processed"] == 3
        assert bulk_result["existing_participants_reused"] == 1
        assert bulk_result["new_participants_created"] == 2
        assert bulk_result["linked_to_event"] == 3

        # 3. Auto wave distribution
        wave_resp = client.post(f"/api/events/{event_id}/distribute-waves", json={
            "total_waves": 2,
            "strategy": "sequential",
            "auto_chest_numbers": True
        })
        assert wave_resp.status_code == 200
        wave_data = wave_resp.json()
        assert wave_data["total_participants"] == 3
        assert len(wave_data["distribution"]) == 2

        # 4. Check participants list
        parts_resp = client.get(f"/api/events/{event_id}/participants")
        assert parts_resp.status_code == 200
        parts_list = parts_resp.json()
        assert len(parts_list) == 3
        p1 = parts_list[0]
        p1_id = p1["participant_id"]

        # 5. Input running score (Samapta A)
        # 7 laps * 400m + 100m = 2900m
        run_resp = client.put(f"/api/events/{event_id}/participants/{p1_id}/run-score", json={
            "run_laps": 7,
            "run_extra_meters": 100.0,
            "run_notes": "Kondisi fisik prima"
        })
        assert run_resp.status_code == 200
        run_data = run_resp.json()
        assert run_data["run_total_distance_meters"] == 2900.0
        assert run_data["run_score"] > 0

        # 6. Check Event Recap
        recap_resp = client.get(f"/api/events/{event_id}/recap")
        assert recap_resp.status_code == 200
        recap_data = recap_resp.json()
        assert recap_data["total_participants"] == 3
        assert len(recap_data["participants"]) == 3
        assert recap_data["participants"][0]["run_distance_meters"] == 2900.0
    finally:
        # CLEANUP: Ensure no test data is left behind in production DB
        clean_db = SessionLocal()
        clean_db.query(EventParticipant).filter(EventParticipant.event_id == event_id).delete(synchronize_session=False)
        clean_db.query(SamaptaEvent).filter(SamaptaEvent.id == event_id).delete(synchronize_session=False)
        clean_db.query(Participant).filter(
            Participant.participant_number.in_([nrp_existing, nrp_new1, nrp_new2])
        ).delete(synchronize_session=False)
        clean_db.commit()
        clean_db.close()
