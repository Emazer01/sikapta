from datetime import datetime, timezone, date
from sqlalchemy import Column, Integer, String, Date, Text, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base

class Participant(Base):
    __tablename__ = "participants"

    id = Column(Integer, primary_key=True, index=True)
    participant_number = Column(String(50), unique=True, index=True, nullable=False)  # Nomor Peserta / NIP / NRP
    full_name = Column(String(100), index=True, nullable=False)
    gender = Column(String(10), nullable=False)  # L / P (Laki-laki / Perempuan)
    birth_date = Column(Date, nullable=True)
    organization = Column(String(100), nullable=True)  # Kesatuan / Satuan / Instansi
    category = Column(String(50), default="Umum", nullable=False)  # Taruna, Bintara, Tamtama, Umum, etc.
    phone = Column(String(20), nullable=True)
    photo_url = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    assessment_sessions = relationship("AssessmentSession", back_populates="participant", cascade="all, delete-orphan")

