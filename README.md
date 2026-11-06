# SIKAPTA AI
## Sistem Inteligensi Kesamaptaan Jasmani Terpadu

> **"Presisi Gerak, Akurasi Penilaian."**

![SIKAPTA AI Brand Banner](assets/branding/logo_horizontal.svg)

---

## 1. Tentang SIKAPTA AI

**SIKAPTA AI** adalah platform berbasis Artificial Intelligence dan Computer Vision yang dirancang untuk mendeteksi, menganalisis, menghitung, dan mendokumentasikan gerakan tes kesamaptaan jasmani (Push-up, Pull-up, Sit-up) melalui kamera secara real-time.

Aplikasi ini dibangun secara optimal untuk berjalan pada komputer **Windows 10/11 menggunakan CPU-only** tanpa ketergantungan pada GPU diskrit NVIDIA, serta mendukung input dari **USB Webcam** dan **IP Camera (RTSP)**.

---

## 2. Fitur Utama

1. **Dual Model AI Pose Estimation**:
   - **MediaPipe Pose Landmarker**: Ekstraksi 33 titik sendi dengan latensi sangat rendah pada CPU.
   - **Ultralytics YOLO Pose**: Model pose robust untuk deteksi stabil dari jarak pandang luas.
2. **SIKAPTA Movement Analytics**:
   - Finite-State Machine (FSM) tersendiri untuk Push-up, Pull-up, dan Sit-up.
   - Filter penghalus gerak (*moving average filter*) dan hysteresis untuk mencegah bouncing.
   - Verifikasi siklus gerakan penuh dan penolakan otomatis gerakan parsial / postur salah.
   - Pemisahan status "Repetisi Terdeteksi", "Repetisi Sah (Terverifikasi)", dan "Repetisi Ditolak".
3. **Live Assessment Telemetry & HUD**:
   - Stream kamera beranotasi skeleton tubuh dan HUD informatif secara real-time via WebSocket.
   - Indikator sudut sendi, fase gerakan, FPS, dan latensi inferensi.
   - Banner umpan balik visual dan audio instan.
4. **Manajemen Terpadu**:
   - **Peserta**: CRUD data peserta dengan nomor identitas (NIP/NRP), kesatuan, dan riwayat.
   - **Kamera**: Konfigurasi USB Webcam dan RTSP stream dengan enkripsi password dan pengujian koneksi.
   - **Aturan (Rule Profiles)**: Konfigurasi threshold sudut sendi dan cooldown yang dapat disesuaikan.
5. **Benchmark Empiris Model AI**:
   - Membandingkan performa MediaPipe vs YOLO Pose secara berurutan pada video sekuens yang sama.
   - Mengukur FPS, latensi rata-rata, p50, p95, presisi, recall, dan F1-score.
6. **Pelaporan & Ekspor Resmi**:
   - Pencetakan lembar laporan penilaian kesamaptaan resmi berformat PDF.
   - Ekspor riwayat seluruh sesi ke format CSV.

---

## 3. Struktur Direktori Proyek

```
sikapta-ai/
├── frontend/                     # SIKAPTA AI Dashboard (React 19, TypeScript, Vite, Tailwind CSS)
│   ├── src/
│   │   ├── components/layout/    # Sidebar, Topbar, MainLayout
│   │   ├── features/             # Dashboard, Assessments, Participants, Cameras, Benchmark, Reports, Settings
│   │   ├── services/api.ts       # API Client TanStack Query
│   │   └── types/                # TypeScript Interfaces
│   └── tests/                    # Vitest & Testing Library
│
├── backend/                      # SIKAPTA AI Core Service (FastAPI, Uvicorn, SQLAlchemy)
│   ├── app/
│   │   ├── main.py               # Entrypoint & Lifespan Service
│   │   ├── core/                 # Config, Database, Security, Seed DB
│   │   ├── models/               # SQLAlchemy Models (8 Tabel)
│   │   ├── schemas/              # Pydantic Data Contracts
│   │   ├── api/routes/           # REST Endpoints
│   │   ├── api/websocket/        # Live Assessment WebSocket
│   │   ├── services/camera/      # Threaded Camera Manager & Latest-Frame Buffer
│   │   ├── services/pose/        # MediaPipe & YOLO Pose Adapters
│   │   ├── services/movement/    # Movement Analytics & FSM Analyzers
│   │   ├── services/assessment/  # Active Session Manager
│   │   ├── services/benchmark/   # Empirical Benchmark Runner
│   │   └── services/reporting/   # ReportLab PDF & CSV Generator
│   ├── migrations/               # Alembic Migration Versions
│   └── tests/                    # Pytest Unit & Integration Tests
│
├── data/
│   ├── models/                   # Bobot Model (pose_landmarker_lite.task, yolov8n-pose.pt)
│   ├── benchmark/                # Video Sampel Uji Benchmark
│   └── exports/                  # Berkas Laporan PDF Terbitan
│
├── scripts/
│   ├── setup_windows.ps1         # Otomatisasi Instalasi Windows
│   ├── start_windows.ps1         # Peluncur Layanan SIKAPTA AI
│   ├── check_environment.ps1     # Pemeriksa Kesiapan Runtimes
│   └── download_models.py        # Pengunduh Bobot Model AI
│
├── docs/                         # Dokumentasi Lengkap
├── docker-compose.yml            # Layanan PostgreSQL Kontainer
├── .env.example                  # Template Konfigurasi Lingkungan
└── README.md
```

---

## 4. Cara Menjalankan SIKAPTA AI (Windows)

### Langkah 1: Setup Lingkungan Otomatis
```powershell
.\scripts\setup_windows.ps1
```

### Langkah 2: Jalankan Aplikasi
```powershell
.\scripts\start_windows.ps1
```

Akses tautan lokal:
- **Frontend Dashboard**: `http://localhost:5173`
- **Backend API & Swagger Docs**: `http://localhost:8000/docs`

---

## 5. Kredensial Default

- **Username**: `admin`
- **Password**: `admin123`
- **Peran**: Administrator SIKAPTA AI

---

## 6. Lisensi & Hak Cipta

SIKAPTA AI - Hak Cipta © 2026. Seluruh hak cipta dilindungi.
Dikembangkan untuk mendukung modernisasi dan akurasi evaluasi kesamaptaan jasmani berbasis kecerdasan buatan.

