from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base

ROLE_DEFINITIONS = {
    "admin": {
        "code": "admin",
        "label": "Administrator",
        "description": "Mengelola konfigurasi, akun/hak akses, kamera, profil aturan, konektivitas, dan pemeliharaan sistem.",
    },
    "examiner": {
        "code": "examiner",
        "label": "Penguji / Examiner",
        "description": "Memilih peserta dan jenis tes, memulai/mengendalikan asesmen, memeriksa hasil, memberi catatan, dan menyetujui atau menolak hasil sesuai kewenangan.",
    },
    "operator": {
        "code": "operator",
        "label": "Operator",
        "description": "Menyiapkan perangkat kamera, memantau stream, membantu proses pelaksanaan, dan memastikan perangkat siap.",
    },
    "event_manager": {
        "code": "event_manager",
        "label": "Pengelola Kegiatan",
        "description": "Membuat kegiatan Samapta, mengelola peserta, gelombang, nomor dada/warna rompi, hasil lari, dan rekap kegiatan.",
    },
    "coach": {
        "code": "coach",
        "label": "Pelatih / Pimpinan",
        "description": "Meninjau hasil dan laporan sebagai bahan evaluasi sesuai kewenangan.",
    },
}

VALID_ROLES = list(ROLE_DEFINITIONS.keys())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(String(30), default="examiner", nullable=False)  # admin, examiner, operator, event_manager, coach
    is_active = Column(Boolean, default=True, nullable=False)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    assessment_sessions = relationship("AssessmentSession", back_populates="examiner")
    audit_logs = relationship("AuditLog", back_populates="user")

    @property
    def role_label(self) -> str:
        return ROLE_DEFINITIONS.get(self.role, {}).get("label", self.role)

    @property
    def role_description(self) -> str:
        return ROLE_DEFINITIONS.get(self.role, {}).get("description", "")


