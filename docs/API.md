# SIKAPTA AI - Dokumentasi REST API & WebSocket

Base URL: `http://localhost:8000/api`
Dokumentasi Interaktif Swagger UI: `http://localhost:8000/docs`

---

## 1. Autentikasi (`/api/auth`)

### `POST /api/auth/login`
Masuk ke sistem untuk memperoleh token akses Bearer JWT.
- **Request Body**:
  ```json
  {
    "username": "admin",
    "password": "admin123"
  }
  ```
- **Response 200 OK**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@sikapta.local",
      "full_name": "Administrator SIKAPTA AI",
      "role": "admin"
    }
  }
  ```

### `GET /api/auth/me`
Mengambil profil pengguna yang sedang login.

---

## 2. Dashboard (`/api/dashboard`)

### `GET /api/dashboard/stats`
Mengambil seluruh ringkasan statistik pemantauan.
- **Response 200 OK**:
  ```json
  {
    "total_participants": 4,
    "total_sessions": 2,
    "active_sessions_count": 0,
    "total_reps_verified": 15,
    "total_reps_detected": 18,
    "online_cameras_count": 1,
    "total_cameras_count": 1,
    "active_default_model": "mediapipe",
    "backend_status": "healthy",
    "database_status": "connected",
    "database_dialect": "postgresql",
    "exercise_distribution": {
      "pushup": 2,
      "pullup": 0,
      "situp": 0
    },
    "recent_sessions": [...],
    "rep_trend_daily": [...]
  }
  ```

---

## 3. Peserta (`/api/participants`)

- `GET /api/participants/`: Daftar peserta dengan filter `search`, `category`, `gender`, `skip`, `limit`.
- `POST /api/participants/`: Tambah peserta baru.
- `GET /api/participants/{id}`: Detail peserta.
- `PUT /api/participants/{id}`: Perbarui data peserta.
- `DELETE /api/participants/{id}`: Hapus peserta.

---

## 4. Kamera (`/api/cameras`)

- `GET /api/cameras/`: Daftar kamera yang terkonfigurasi.
- `POST /api/cameras/`: Tambah konfigurasi kamera (Webcam / RTSP).
- `POST /api/cameras/test-connection`: Uji koneksi kamera sebelum disimpan:
  ```json
  {
    "camera_type": "webcam",
    "device_index": 0
  }
  ```
- `GET /api/cameras/{id}`: Detail kamera.
- `PUT /api/cameras/{id}`: Perbarui kamera.
- `DELETE /api/cameras/{id}`: Hapus kamera.

---

## 5. Sesi Asesmen (`/api/assessments`)

- `GET /api/assessments/`: Riwayat sesi pengujian dengan filter.
- `POST /api/assessments/`: Membuat dan memulai sesi asesmen live:
  ```json
  {
    "participant_id": 1,
    "camera_id": 1,
    "exercise_type": "pushup",
    "model_used": "mediapipe"
  }
  ```
- `GET /api/assessments/{id}`: Mengambil rincian sesi beserta daftar kejadian repetisi (`rep_events`).
- `POST /api/assessments/{id}/control`: Mengontrol sesi yang sedang berlangsung (`action`: `"pause"`, `"resume"`, atau `"stop"`).

---

## 6. WebSocket Live Assessment

**URL**: `ws://localhost:8000/ws/assessments/{session_id}/live`

Menyalurkan telemetry gerakan dan visualisasi skeleton beranotasi secara real-time:
```json
{
  "session_id": 1,
  "session_code": "SES-20261027-0001",
  "status": "in_progress",
  "exercise": "pushup",
  "model": "mediapipe",
  "fps": 28.5,
  "latency_ms": 32.4,
  "current_angle": 88.5,
  "phase": "BOTTOM",
  "detected_reps": 5,
  "verified_reps": 4,
  "rejected_reps": 1,
  "feedback": "Kedalaman tercapai! Dorong badan ke atas.",
  "is_good_form": true,
  "frame": "<base64_encoded_jpeg_string>"
}
```

---

## 7. Model Benchmark (`/api/benchmark`)

- `POST /api/benchmark/run`: Menjalankan evaluasi komparasi MediaPipe vs YOLO Pose pada CPU.
- `GET /api/benchmark/history`: Riwayat rekaman benchmark.

---

## 8. Laporan (`/api/reports`)

- `GET /api/reports/sessions/{session_id}/pdf`: Mengunduh dokumen laporan resmi penilaian format PDF.
- `GET /api/reports/sessions/csv`: Mengunduh seluruh arsip sesi dalam format CSV.

