import uuid
import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.models.samapta_event import SamaptaEvent
from app.models.event_participant import EventParticipant
from app.models.participant import Participant
from app.services.assessment.chest_number_detector import ChestNumberDetector
from app.services.assessment.wave_run_manager import (
    ActiveWaveRunSession,
    WaveRunnerState,
    wave_run_manager,
)

client = TestClient(app)


def _create_synthetic_runner_bib_frame(
    chest_text: str,
    vest_bgr: tuple = (0, 215, 255)  # Default Rompi Kuning
) -> np.ndarray:
    """
    Membuat frame kamera sintetis dengan warna rompi/kaos pelari dan kartu Nomor Dada putih.
    """
    frame = np.full((480, 640, 3), 40, dtype=np.uint8)

    # Gambar rompi / kaos pelari di area torso
    torso_x1, torso_y1, torso_x2, torso_y2 = 160, 80, 480, 420
    cv2.rectangle(frame, (torso_x1, torso_y1), (torso_x2, torso_y2), vest_bgr, -1)

    # Gambar kartu bib putih di tengah torso rompi
    bib_x1, bib_y1, bib_x2, bib_y2 = 220, 160, 420, 310
    cv2.rectangle(frame, (bib_x1, bib_y1), (bib_x2, bib_y2), (245, 245, 245), -1)

    # Tulis nomor dada hitam tebal di tengah kartu bib
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 2.6
    thickness = 7
    (tw, th), _ = cv2.getTextSize(chest_text, font, scale, thickness)
    tx = bib_x1 + (bib_x2 - bib_x1 - tw) // 2
    ty = bib_y1 + (bib_y2 - bib_y1 + th) // 2
    cv2.putText(frame, chest_text, (tx, ty), font, scale, (15, 15, 15), thickness, cv2.LINE_AA)
    return frame


def test_chest_number_detector_recognizes_wave_bibs():
    detector = ChestNumberDetector()
    valid_map = {
        "01": {"participant_id": 101, "full_name": "Peserta Satu"},
        "02": {"participant_id": 102, "full_name": "Peserta Dua"},
        "03": {"participant_id": 103, "full_name": "Peserta Tiga"},
    }

    # Uji deteksi Nomor Dada sekaligus Deteksi Warna Rompi / Kaos
    test_cases = [
        ("01", 101, (0, 215, 255), "Kuning"),  # Rompi Kuning
        ("02", 102, (246, 130, 59), "Biru"),   # Rompi Biru
        ("03", 103, (68, 68, 239), "Merah"),   # Rompi Merah
    ]

    for expected_cn, expected_pid, vest_bgr, expected_color in test_cases:
        frame = _create_synthetic_runner_bib_frame(expected_cn, vest_bgr=vest_bgr)
        detections = detector.detect(frame, valid_chest_numbers=valid_map, min_confidence=0.60)
        assert len(detections) == 1, f"Gagal mendeteksi nomor dada {expected_cn}"
        assert detections[0].chest_number == expected_cn
        assert detections[0].participant_id == expected_pid
        assert detections[0].vest_color == expected_color, f"Warna rompi salah: {detections[0].vest_color} != {expected_color}"

    # Uji deteksi langsung pada Kaos / Jersey Bernomor Cetak (Direct Jersey Print)
    import os
    sample_jersey_path = r"C:\Users\Advan\.gemini\antigravity\brain\3afe4011-f47b-4675-bfa4-a406fd5d3374\.user_uploaded\media_1793757858838_7235e54a.jpg"
    if os.path.exists(sample_jersey_path):
        jersey_img = cv2.imread(sample_jersey_path)
        jersey_map = {"23": {"participant_id": 230, "full_name": "Pelari Jersey 23", "vest_color": "Merah"}}
        jersey_dets = detector.detect(jersey_img, valid_chest_numbers=jersey_map, min_confidence=0.55)
        assert len(jersey_dets) >= 1, "Gagal mendeteksi cetakan angka 23 pada jersey merah"
        assert jersey_dets[0].chest_number == "23"
        assert jersey_dets[0].participant_id == 230
        assert jersey_dets[0].vest_color == "Merah"

    # Uji pencegahan false positive pada gambar webcam wajah/pakaian loreng tanpa rompi (Negative Test)
    user_cam_path = r"C:\Users\Advan\.gemini\antigravity\brain\3afe4011-f47b-4675-bfa4-a406fd5d3374\.user_uploaded\media_1793762476453_b70e1b69.jpg"
    if os.path.exists(user_cam_path):
        user_img = cv2.imread(user_cam_path)
        runners_test = [
            {"participant_id": 19, "chest_number": "1", "full_name": "Mayor Inf Hendra Kusuma", "vest_color": "Merah"},
            {"participant_id": 20, "chest_number": "1", "full_name": "Serda Dewi Anggraini", "vest_color": "Kuning"},
            {"participant_id": 21, "chest_number": "2", "full_name": "Kapten Budi Santoso", "vest_color": "Merah"},
        ]
        user_dets = detector.detect(user_img, registered_participants=runners_test, min_confidence=0.50)
        assert len(user_dets) == 0, f"False positive terdeteksi pada webcam wajah tanpa rompi: {user_dets}"


def test_active_wave_run_session_lap_counting_and_cooldown():
    # Simulasi 3 pelari: Pelari 201 dan 202 memiliki Nomor Dada yang SAMA (01), tetapi Warna Rompi BERBEDA (Merah vs Kuning)
    runners = [
        WaveRunnerState(
            event_participant_id=1,
            participant_id=201,
            nrp="NRP-201",
            full_name="Pelari Satu Merah",
            gender="L",
            unit="Yonif",
            chest_number="01",
            wave_number=1,
            vest_color="Merah",
            laps=0,
            extra_meters=0.0,
            track_length_meters=400.0,
        ),
        WaveRunnerState(
            event_participant_id=2,
            participant_id=202,
            nrp="NRP-202",
            full_name="Pelari Satu Kuning",
            gender="P",
            unit="Kowad",
            chest_number="01",
            wave_number=1,
            vest_color="Kuning",
            laps=0,
            extra_meters=0.0,
            track_length_meters=400.0,
        ),
        WaveRunnerState(
            event_participant_id=3,
            participant_id=203,
            nrp="NRP-203",
            full_name="Pelari Dua Merah",
            gender="L",
            unit="Yonif",
            chest_number="02",
            wave_number=1,
            vest_color="Merah",
            laps=0,
            extra_meters=0.0,
            track_length_meters=400.0,
        ),
    ]

    session = ActiveWaveRunSession(
        event_id=999,
        event_name="Simulasi Lari Gelombang 1",
        wave_number=1,
        track_length_meters=400.0,
        runners=runners,
        camera_id=None,
        target_duration_seconds=720,
        lap_cooldown_seconds=10.0,
        confirm_frames_required=1,
    )

    frame_01_merah = _create_synthetic_runner_bib_frame("01", vest_bgr=(68, 68, 239))   # No. 01 Rompi Merah
    frame_01_kuning = _create_synthetic_runner_bib_frame("01", vest_bgr=(0, 215, 255))  # No. 01 Rompi Kuning
    frame_02_merah = _create_synthetic_runner_bib_frame("02", vest_bgr=(68, 68, 239))   # No. 02 Rompi Merah
    frame_01_biru = _create_synthetic_runner_bib_frame("01", vest_bgr=(246, 130, 59))   # No. 01 Rompi Biru (tidak terdaftar)

    # 1. Pelari No. 01 Rompi Merah melewati kamera pada t=100.0 -> HANYA Pelari 201 yang bertambah 1 putaran!
    session.process_frame(frame_01_merah, now_ts=100.0)
    assert session.runners_by_id[201].laps == 1
    assert session.runners_by_id[201].total_distance_meters == 400.0
    assert session.runners_by_id[201].chest_number == "01"
    # Pelari 202 (Rompi Kuning) TIDAK BOLEH bertambah dan nomor dadanya TIDAK BOLEH berubah!
    assert session.runners_by_id[202].laps == 0
    assert session.runners_by_id[202].chest_number == "01"
    assert session.runners_by_id[203].laps == 0

    # 2. Pelari No. 01 Rompi Kuning melewati kamera pada t=102.0 -> HANYA Pelari 202 yang bertambah 1 putaran!
    session.process_frame(frame_01_kuning, now_ts=102.0)
    assert session.runners_by_id[202].laps == 1
    assert session.runners_by_id[202].total_distance_meters == 400.0
    assert session.runners_by_id[202].chest_number == "01"
    assert session.runners_by_id[201].laps == 1  # Tetap 1

    # 3. Kamera melihat No. 01 dengan Rompi Biru (padahal No. 01 hanya ada Merah dan Kuning) -> TIDAK ADA yang bertambah!
    session.process_frame(frame_01_biru, now_ts=103.0)
    assert session.runners_by_id[201].laps == 1
    assert session.runners_by_id[202].laps == 1

    # 4. Pelari No. 02 Rompi Merah melewati kamera pada t=104.0 -> Pelari 203 bertambah 1 putaran!
    session.process_frame(frame_02_merah, now_ts=104.0)
    assert session.runners_by_id[203].laps == 1
    assert session.runners_by_id[203].total_distance_meters == 400.0

    # 5. Pelari No. 01 Rompi Merah menyelesaikan putaran kedua pada t=112.0 (cooldown selesai) -> Putaran = 2 (800m)
    session.process_frame(frame_01_merah, now_ts=112.0)
    assert session.runners_by_id[201].laps == 2
    assert session.runners_by_id[201].total_distance_meters == 800.0
    assert session.runners_by_id[202].laps == 1


def test_wave_run_live_api_endpoints_with_clean_teardown():
    suffix = uuid.uuid4().hex[:8]
    nrp_1 = f"TEST-WAVERUN-1-{suffix}"
    nrp_2 = f"TEST-WAVERUN-2-{suffix}"
    created_event_id = None
    created_part_ids = []

    try:
        # 1. Buat kegiatan sementara
        res_evt = client.post(
            "/api/events",
            json={
                "name": f"Test Live Cam Lari {suffix}",
                "location": "Lapangan Uji",
                "start_date": "2026-11-04",
                "track_length_meters": 400.0,
                "total_waves": 2,
                "status": "in_progress",
            },
        )
        assert res_evt.status_code == 201
        created_event_id = res_evt.json()["id"]

        # 2. Masukkan 2 peserta pada Gelombang 1 dengan No. Dada 01 & 02
        res_bulk = client.post(
            f"/api/events/{created_event_id}/participants/bulk",
            json={
                "participants": [
                    {
                        "nrp": nrp_1,
                        "name": "Letda Uji Satu",
                        "gender": "L",
                        "unit": "Satuan A",
                        "category": "Perwira",
                        "chest_number": "01",
                        "wave_number": 1,
                    },
                    {
                        "nrp": nrp_2,
                        "name": "Sertu Uji Dua",
                        "gender": "L",
                        "unit": "Satuan A",
                        "category": "Bintara",
                        "chest_number": "02",
                        "wave_number": 1,
                    },
                ]
            },
        )
        assert res_bulk.status_code == 200

        parts_res = client.get(f"/api/events/{created_event_id}/participants?wave_number=1")
        assert parts_res.status_code == 200
        parts_data = parts_res.json()
        assert len(parts_data) == 2
        created_part_ids = [p["participant_id"] for p in parts_data]
        pid_01 = next(p["participant_id"] for p in parts_data if p["chest_number"] == "01")
        pid_02 = next(p["participant_id"] for p in parts_data if p["chest_number"] == "02")

        # 2b. Uji fitur baru: Simpan konfigurasi nomor dada & warna kaos peserta sebelum memulai tes lari
        cfg_res = client.post(
            f"/api/events/{created_event_id}/waves/1/configure-participants",
            json={
                "participants": [
                    {"participant_id": pid_01, "chest_number": "23", "vest_color": "Merah"},
                    {"participant_id": pid_02, "chest_number": "08", "vest_color": "Biru"},
                ]
            },
        )
        assert cfg_res.status_code == 200
        assert cfg_res.json()["saved_count"] == 2

        # Verifikasi bahwa konfigurasi tersimpan resmi di database
        verify_cfg_parts = client.get(f"/api/events/{created_event_id}/participants?wave_number=1").json()
        p01_cfg = next(p for p in verify_cfg_parts if p["participant_id"] == pid_01)
        assert p01_cfg["chest_number"] == "23"
        assert p01_cfg["vest_color"] == "Merah"

        # 3. Mulai sesi Live Cam Lari Gelombang 1
        start_res = client.post(
            f"/api/events/{created_event_id}/waves/1/run-live/start",
            json={
                "camera_id": None,
                "target_duration_seconds": 720,
                "lap_cooldown_seconds": 5.0,
                "confirm_frames_required": 1,
            },
        )
        assert start_res.status_code == 200
        start_state = start_res.json()
        assert start_state["status"] == "in_progress"
        assert len(start_state["participants"]) == 2

        # 4. Simulasikan kamera mendeteksi Nomor Dada "23" dengan Kaos Merah melewati 1 putaran
        active_session = wave_run_manager.get_session(created_event_id, 1)
        assert active_session is not None
        bib_23_frame = _create_synthetic_runner_bib_frame("23", vest_bgr=(68, 68, 239))
        active_session.process_frame(bib_23_frame, now_ts=500.0)
        assert active_session.runners_by_id[pid_01].detected_vest_color == "Merah"

        # 5. Tambah 6 putaran lagi + lebihan 150m via control endpoint (total 7 putaran + 150m = 2950m)
        ctrl_lap = client.post(
            f"/api/events/{created_event_id}/waves/1/run-live/control",
            json={"action": "adjust_lap", "participant_id": pid_01, "delta": 6},
        )
        assert ctrl_lap.status_code == 200

        ctrl_extra = client.post(
            f"/api/events/{created_event_id}/waves/1/run-live/control",
            json={"action": "set_extra_meters", "participant_id": pid_01, "extra_meters": 150.0},
        )
        assert ctrl_extra.status_code == 200
        p01_state = next(p for p in ctrl_extra.json()["participants"] if p["participant_id"] == pid_01)
        assert p01_state["run_laps"] == 7
        assert p01_state["run_extra_meters"] == 150.0
        assert p01_state["run_total_distance_meters"] == 2950.0

        # 6. Simpan resmi hasil lari Gelombang 1 ke database
        save_res = client.post(
            f"/api/events/{created_event_id}/waves/1/run-live/save",
            json={"stop_session": True},
        )
        assert save_res.status_code == 200
        assert save_res.json()["saved_count"] == 2

        # Verifikasi data tersimpan di endpoint peserta kegiatan
        verify_parts = client.get(f"/api/events/{created_event_id}/participants?wave_number=1").json()
        saved_p01 = next(p for p in verify_parts if p["participant_id"] == pid_01)
        assert saved_p01["run_laps"] == 7
        assert saved_p01["run_extra_meters"] == 150.0
        assert saved_p01["run_total_distance_meters"] == 2950.0
        assert saved_p01["run_score"] > 0

    finally:
        # 7. Bersihkan seluruh data testing dari database asli
        if created_event_id:
            wave_run_manager.stop_session(created_event_id, 1)
        db = SessionLocal()
        try:
            if created_event_id:
                db.query(EventParticipant).filter(EventParticipant.event_id == created_event_id).delete(synchronize_session=False)
                db.query(SamaptaEvent).filter(SamaptaEvent.id == created_event_id).delete(synchronize_session=False)
            if created_part_ids:
                db.query(Participant).filter(Participant.id.in_(created_part_ids)).delete(synchronize_session=False)
            db.query(Participant).filter(Participant.participant_number.in_([nrp_1, nrp_2])).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()

