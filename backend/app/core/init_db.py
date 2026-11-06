import json
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import Base, engine, SessionLocal
from app.core.security import hash_password
from app.models.user import User
from app.models.participant import Participant
from app.models.camera import Camera
from app.models.rule_profile import RuleProfile

def init_db():
    # Create tables
    Base.metadata.create_all(bind=engine)

    # Ensure schema updates for existing tables
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE assessment_sessions ADD COLUMN IF NOT EXISTS gender VARCHAR(10) DEFAULT 'L'"))
            conn.execute(text("ALTER TABLE assessment_sessions ADD COLUMN IF NOT EXISTS tolerance_deg FLOAT DEFAULT 5.0"))
            conn.execute(text("ALTER TABLE assessment_sessions ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'camera'"))
            conn.execute(text("ALTER TABLE assessment_sessions ADD COLUMN IF NOT EXISTS video_path VARCHAR(255)"))
            conn.execute(text("ALTER TABLE assessment_sessions ADD COLUMN IF NOT EXISTS annotated_video_path VARCHAR(255)"))
            conn.execute(text("ALTER TABLE assessment_sessions ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES samapta_events(id) ON DELETE SET NULL"))
            conn.execute(text("ALTER TABLE rep_events ALTER COLUMN start_timestamp_ms TYPE BIGINT"))
            conn.execute(text("ALTER TABLE rep_events ALTER COLUMN end_timestamp_ms TYPE BIGINT"))
            conn.commit()
        except Exception as e:
            pass

    db: Session = SessionLocal()
    try:
        # 1. Create Default Admin User
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            admin_user = User(
                username="admin",
                email="admin@sikapta.local",
                hashed_password=hash_password("admin123"),
                full_name="Administrator SIKAPTA AI",
                role="admin",
                is_active=True
            )
            db.add(admin_user)
            print("[DB] Created default admin user: admin / admin123")

        # 2. Create Default Rule Profiles
        # Push-up profile
        pushup_profile = db.query(RuleProfile).filter(RuleProfile.exercise_type == "pushup", RuleProfile.is_default == True).first()
        if not pushup_profile:
            pushup_config = {
                "down_elbow_angle_threshold": 90.0,
                "up_elbow_angle_threshold": 160.0,
                "body_alignment_angle_threshold": 155.0,
                "min_confidence": 0.5,
                "smoothing_window": 5,
                "hysteresis_deg": 5.0,
                "cooldown_frames": 10,
                "min_phase_duration_ms": 300,
                "max_pose_loss_frames": 5
            }
            db.add(RuleProfile(
                name="Standar Kesamaptaan Push-up",
                exercise_type="pushup",
                version="1.0.0",
                description="Aturan standar penilaian push-up kesamaptaan: siku turun <= 90°, naik >= 160°, kelurusan tubuh terjaga.",
                is_default=True,
                config_json=pushup_config
            ))
            print("[DB] Created default Push-up rule profile")

        # Pull-up profile
        pullup_profile = db.query(RuleProfile).filter(RuleProfile.exercise_type == "pullup", RuleProfile.is_default == True).first()
        if not pullup_profile:
            pullup_config = {
                "bottom_elbow_angle_threshold": 155.0,
                "top_elbow_angle_threshold": 70.0,
                "chin_over_bar_required": True,
                "bar_y_offset": 0.05,
                "min_confidence": 0.5,
                "smoothing_window": 5,
                "hysteresis_deg": 5.0,
                "cooldown_frames": 12,
                "min_phase_duration_ms": 400,
                "max_pose_loss_frames": 5
            }
            db.add(RuleProfile(
                name="Standar Kesamaptaan Pull-up",
                exercise_type="pullup",
                version="1.0.0",
                description="Aturan standar penilaian pull-up: posisi gantung siku >= 155°, tarikan dagu melewati palang (siku <= 70°).",
                is_default=True,
                config_json=pullup_config
            ))
            print("[DB] Created default Pull-up rule profile")

        # Sit-up profile
        situp_profile = db.query(RuleProfile).filter(RuleProfile.exercise_type == "situp", RuleProfile.is_default == True).first()
        if not situp_profile:
            situp_config = {
                "down_torso_angle_threshold": 125.0,
                "up_torso_angle_threshold": 70.0,
                "min_confidence": 0.5,
                "smoothing_window": 5,
                "hysteresis_deg": 5.0,
                "cooldown_frames": 10,
                "min_phase_duration_ms": 350,
                "max_pose_loss_frames": 5
            }
            db.add(RuleProfile(
                name="Standar Kesamaptaan Sit-up",
                exercise_type="situp",
                version="1.0.0",
                description="Aturan standar penilaian sit-up: sudut torso-paha rebah >= 125°, posisi naik <= 70°.",
                is_default=True,
                config_json=situp_config
            ))
            print("[DB] Created default Sit-up rule profile")

        # 3. Create Default Camera (Webcam 0)
        default_camera = db.query(Camera).filter(Camera.device_index == 0).first()
        if not default_camera:
            db.add(Camera(
                name="Webcam Utama (Device 0)",
                camera_type="webcam",
                device_index=0,
                resolution_w=640,
                resolution_h=480,
                target_fps=30,
                is_active=True,
                status="offline"
            ))
            print("[DB] Created default Webcam 0 configuration")

        # 4. Seed initial participants
        if db.query(Participant).count() == 0:
            sample_participants = [
                Participant(
                    participant_number="SMP-2026-001",
                    full_name="Budi Santoso",
                    gender="L",
                    birth_date=date(1998, 5, 12),
                    organization="Batalyon Infanteri 1",
                    category="Tamtama",
                    phone="081234567801",
                    notes="Siap tes kesamaptaan periode I 2026."
                ),
                Participant(
                    participant_number="SMP-2026-002",
                    full_name="Dewi Anggraini",
                    gender="P",
                    birth_date=date(2000, 8, 22),
                    organization="Korps Wanita",
                    category="Bintara",
                    phone="081234567802",
                    notes="Kondisi prima."
                ),
                Participant(
                    participant_number="SMP-2026-003",
                    full_name="Ahmad Rizky Pratama",
                    gender="L",
                    birth_date=date(1999, 11, 4),
                    organization="Akademi Militer",
                    category="Taruna",
                    phone="081234567803",
                    notes="Peserta evaluasi berkala."
                ),
                Participant(
                    participant_number="SMP-2026-004",
                    full_name="Siti Nurhaliza",
                    gender="P",
                    birth_date=date(2001, 3, 15),
                    organization="Polda Metro",
                    category="Bintara",
                    phone="081234567804",
                    notes="Peserta seleksi kesamaptaan jasmani."
                )
            ]
            db.add_all(sample_participants)
            print("[DB] Seeded 4 initial participants.")

        db.commit()
        print("[DB] Database initialization & seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"[DB ERROR] Error initializing database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    init_db()

