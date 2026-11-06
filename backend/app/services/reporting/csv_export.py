import csv
import io
from typing import List, Dict, Any

def generate_sessions_csv(sessions: List[Dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    # Headers in Indonesian
    headers = [
        "ID Sesi",
        "Kode Sesi",
        "Nomor Peserta",
        "Nama Peserta",
        "Satuan / Instansi",
        "Jenis Tes",
        "Model AI",
        "Tanggal Tes",
        "Durasi (detik)",
        "Repetisi Sah",
        "Repetisi Ditolak",
        "Total Repetisi",
        "Rata-rata FPS",
        "Rata-rata Latensi (ms)",
        "Status",
        "Catatan Penguji"
    ]
    writer.writerow(headers)

    for s in sessions:
        part = s.get("participant", {})
        writer.writerow([
            s.get("id"),
            s.get("session_code"),
            part.get("participant_number", ""),
            part.get("full_name", ""),
            part.get("organization", ""),
            s.get("exercise_type"),
            s.get("model_used"),
            s.get("start_time"),
            s.get("duration_seconds"),
            s.get("verified_reps"),
            s.get("rejected_reps"),
            s.get("detected_reps"),
            s.get("avg_fps"),
            s.get("avg_latency_ms"),
            s.get("status"),
            s.get("examiner_notes", "")
        ])

    return output.getvalue()

