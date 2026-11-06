from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base

class EventParticipant(Base):
    __tablename__ = "event_participants"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("samapta_events.id", ondelete="CASCADE"), nullable=False, index=True)
    participant_id = Column(Integer, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True)

    chest_number = Column(String(20), nullable=True)  # Nomor Dada (misal: "01", "02")
    vest_color = Column(String(50), nullable=True)  # Warna Kaos / Rompi (misal: "Merah", "Kuning", "Biru", "Hijau")
    wave_number = Column(Integer, default=1, nullable=False, index=True)  # Gelombang ke-1, 2, 3...
    group_name = Column(String(50), nullable=True)  # Peleton / Kelompok
    attendance_status = Column(String(20), default="registered", nullable=False)  # registered, present, absent, completed

    # Samapta A: Penilaian Lari 12 Menit
    run_laps = Column(Integer, default=0, nullable=False)  # Jumlah putaran
    run_extra_meters = Column(Float, default=0.0, nullable=False)  # Lebihan meter
    run_total_distance_meters = Column(Float, default=0.0, nullable=False)  # Total jarak (putaran * track + lebihan)
    run_score = Column(Float, nullable=True)  # Nilai Skor Lari (0 - 100)
    run_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint('event_id', 'participant_id', name='uq_event_participant'),
    )

    # Relationships
    event = relationship("SamaptaEvent", back_populates="event_participants")
    participant = relationship("Participant")

