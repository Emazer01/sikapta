# SIKAPTA AI - Dokumentasi Basis Data PostgreSQL

Database Name: `sikapta_ai`  
ORM: SQLAlchemy 2.x  
Migration Tool: Alembic  

---

## 1. Skema Relasi Antar Tabel

```mermaid
erDiagram
    users ||--o{ assessment_sessions : "examiner"
    users ||--o{ audit_logs : "creates"
    participants ||--o{ assessment_sessions : "has"
    cameras ||--o{ assessment_sessions : "captures"
    rule_profiles ||--o{ assessment_sessions : "governs"
    assessment_sessions ||--o{ rep_events : "contains"

    users {
        int id PK
        string username UK
        string email UK
        string hashed_password
        string full_name
        string role
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    participants {
        int id PK
        string participant_number UK
        string full_name
        string gender
        date birth_date
        string organization
        string category
        string phone
        text notes
        datetime created_at
        datetime updated_at
    }

    cameras {
        int id PK
        string name
        string camera_type
        int device_index
        string rtsp_url
        string rtsp_username
        string rtsp_password_encrypted
        int resolution_w
        int resolution_h
        int target_fps
        boolean is_active
        string status
        datetime last_seen
        datetime created_at
        datetime updated_at
    }

    rule_profiles {
        int id PK
        string name
        string exercise_type
        string version
        string description
        boolean is_default
        json config_json
        datetime created_at
        datetime updated_at
    }

    assessment_sessions {
        int id PK
        string session_code UK
        int participant_id FK
        int camera_id FK
        int rule_profile_id FK
        int examiner_id FK
        string exercise_type
        string model_used
        string status
        datetime start_time
        datetime end_time
        int duration_seconds
        int detected_reps
        int verified_reps
        int rejected_reps
        float avg_fps
        float avg_latency_ms
        text examiner_notes
        datetime created_at
        datetime updated_at
    }

    rep_events {
        int id PK
        int session_id FK
        int rep_number
        string status
        string rejection_reason
        int start_timestamp_ms
        int end_timestamp_ms
        float peak_angle
        float min_angle
        float confidence_avg
        text feedback
        datetime created_at
    }

    model_benchmarks {
        int id PK
        string test_name
        string video_source
        float duration_seconds
        int total_frames
        string model_name
        float avg_fps
        float avg_latency_ms
        float p50_latency_ms
        float p95_latency_ms
        float precision_score
        float recall_score
        float f1_score
        int false_positives
        int false_negatives
        int detected_reps
        int verified_reps
        int invalid_pose_frames
        datetime test_date
        datetime created_at
    }

    audit_logs {
        int id PK
        int user_id FK
        string action
        string resource_type
        string resource_id
        text details
        string ip_address
        datetime created_at
    }
```

---

## 2. Fitur Keamanan dan Integritas Basis Data
1. **Foreign Key Constraints dengan Cascade / Set Null**: Menghindari orphan data pada sesi pengujian saat kamera atau penguji dihapus.
2. **Indexing**: Diterapkan pada `participant_number`, `session_code`, `session_id`, `created_at` untuk mempercepat kueri analitik dan pencarian.
3. **Penyimpanan Non-Destruktif**: Tidak menyimpan file video mentah secara permanen secara default untuk menjaga privasi peserta dan menghemat penyimpanan disk.

