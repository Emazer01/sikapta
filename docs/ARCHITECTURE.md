# SIKAPTA AI - Arsitektur Sistem

## 1. Ikhtisar Arsitektur

**SIKAPTA AI** (Sistem Inteligensi Kesamaptaan Jasmani Terpadu dan Adaptif) dirancang dengan arsitektur modular berlapis (*layered modular architecture*) untuk mendukung evaluasi kesamaptaan jasmani secara real-time pada perangkat CPU Windows tanpa ketergantungan pada GPU diskrit.

```mermaid
flowchart TD
    subgraph CAMERA_LAYER ["1. LAPISAN INPUT KAMERA"]
        CAM1["Webcam / USB Camera (DirectShow)"]
        CAM2["IP Camera / CCTV (RTSP Stream)"]
    end

    subgraph VISION_ENGINE ["2. SIKAPTA VISION ENGINE"]
        CAP["Threaded Capture & Latest-Frame Buffer"]
        PRE["Frame Preprocessing & Scaling"]
        MP["MediaPipe Pose Landmarker (CPU)"]
        YOLO["Ultralytics YOLO Pose (CPU)"]
        NORM["Landmark Normalization (COCO/MediaPipe -> SIKAPTA Keypoints)"]
        OVERLAY["HUD & Skeleton Rendering"]
    end

    subgraph ANALYTICS_ENGINE ["3. SIKAPTA MOVEMENT ANALYTICS"]
        GEOM["Perhitungan Sudut Sendi 3 Titik"]
        SMOOTH["Moving Average Smoothing & Hysteresis"]
        FSM["Finite-State Machine (Push-up / Pull-up / Sit-up)"]
        VAL["Validasi Repetisi & Penolakan Parsial"]
        EVENT["Pencatatan Event Repetisi"]
    end

    subgraph CORE_SERVICE ["4. SIKAPTA AI CORE SERVICE"]
        FASTAPI["FastAPI REST API & WebSocket Server"]
        SESSION_MGR["Live Assessment Session Manager"]
        CAM_MGR["Camera Connection Manager"]
        AUTH["Keamanan (JWT & PBKDF2 Hashing)"]
        REPORT_SVC["PDF & CSV Reporting Service"]
    end

    subgraph DASHBOARD ["5. SIKAPTA AI DASHBOARD"]
        REACT["React.js + TypeScript + Vite + Tailwind CSS"]
        TANSTACK["TanStack Query (State & Cache)"]
        WS_CLIENT["WebSocket Real-time Stream Client"]
        RECHARTS["Visualisasi Data & Grafik (Recharts)"]
    end

    subgraph DATABASE ["6. BASIS DATA POSTGRESQL"]
        PG[("PostgreSQL 16 (sikapta_ai)")]
        SQLITE[("SQLite Fallback")]
    end

    CAM1 --> CAP
    CAM2 --> CAP
    CAP --> PRE
    PRE --> MP
    PRE --> YOLO
    MP --> NORM
    YOLO --> NORM
    NORM --> GEOM
    GEOM --> SMOOTH
    SMOOTH --> FSM
    FSM --> VAL
    VAL --> EVENT
    EVENT --> SESSION_MGR
    NORM --> OVERLAY
    OVERLAY --> SESSION_MGR
    SESSION_MGR --> FASTAPI
    FASTAPI <--> WS_CLIENT
    FASTAPI <--> REACT
    FASTAPI --> PG
    FASTAPI -.-> SQLITE
```

---

## 2. Rincian Modul Utama

### 2.1 SIKAPTA Vision Engine
Bertanggung jawab mengambil frame kamera dengan buffer non-blocking (*latest-frame buffer*), menjalankan model AI, dan menormalisasi 17 landmark standar tubuh manusia.
- **MediaPipe Pose Adapter**: Menghasilkan landmark dengan estimasi CPU yang sangat ringan.
- **YOLO Pose Adapter**: Menggunakan `yolov8n-pose.pt` untuk deteksi robust dari sudut pandang luas.
- **Normalizer**: Mengonversi output dari kedua format ke standar `LandmarkPoint(name, x, y, z, confidence, is_valid)`.

### 2.2 SIKAPTA Movement Analytics
Modul matematika dan state machine independen dari model AI:
- **Geometry**: Menghitung sudut interior antar 3 sendi tubuh.
- **Smoothing & Hysteresis**: Mencegah flip-flopping pada batas threshold sudut.
- **Push-up Analyzer**: Mengevaluasi sudut siku (<= 90° turun, >= 160° naik) dan kelurusan badan.
- **Pull-up Analyzer**: Mengevaluasi tarikan dagu melewati palang dan posisi lengan lurus saat gantung.
- **Sit-up Analyzer**: Mengevaluasi sudut torso-paha saat posisi rebah dan saat naik.

### 2.3 SIKAPTA AI Core Service
- Dibangun di atas **FastAPI** dengan arsitektur async.
- Protokol WebSocket menyalurkan metadata real-time dan frame beranotasi 30 FPS.
- Dilengkapi mekanisme fallback transparan ke SQLite jika server PostgreSQL offline.

### 2.4 SIKAPTA AI Dashboard
- Antarmuka berbasis **React 19 + TypeScript + Tailwind CSS**.
- Menggunakan skema warna institusional: Navy blue, emas, putih, hijau zamrud, dan merah peringatan.
- Terkoneksi ke REST API dan WebSocket untuk pemantauan live.

