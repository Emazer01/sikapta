from datetime import date, datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from app.schemas.participant import ParticipantResponse

# --- Event Participant Schemas ---

class EventParticipantBase(BaseModel):
    chest_number: Optional[str] = None
    vest_color: Optional[str] = None
    wave_number: int = 1
    group_name: Optional[str] = None
    attendance_status: str = "registered"
    run_laps: int = 0
    run_extra_meters: float = 0.0
    run_notes: Optional[str] = None

class EventParticipantCreate(EventParticipantBase):
    participant_id: int

class EventParticipantUpdate(BaseModel):
    chest_number: Optional[str] = None
    vest_color: Optional[str] = None
    wave_number: Optional[int] = None
    group_name: Optional[str] = None
    attendance_status: Optional[str] = None
    run_laps: Optional[int] = None
    run_extra_meters: Optional[float] = None
    run_notes: Optional[str] = None

class EventParticipantResponse(BaseModel):
    id: int
    event_id: int
    participant_id: int
    chest_number: Optional[str] = None
    vest_color: Optional[str] = None
    wave_number: int
    group_name: Optional[str] = None
    attendance_status: str
    run_laps: int
    run_extra_meters: float
    run_total_distance_meters: float
    run_score: Optional[float] = None
    run_notes: Optional[str] = None
    # Perolehan Samapta B (Deteksi AI)
    pullup_reps: Optional[int] = None
    pullup_score: Optional[float] = None
    pushup_reps: Optional[int] = None
    pushup_score: Optional[float] = None
    situp_reps: Optional[int] = None
    situp_score: Optional[float] = None
    shuttlerun_seconds: Optional[float] = None
    shuttlerun_score: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    participant: Optional[ParticipantResponse] = None

    model_config = ConfigDict(from_attributes=True)

# --- Bulk Participant Import for Events ---

class BulkEventParticipantItem(BaseModel):
    nrp: str
    name: Optional[str] = None
    gender: Optional[str] = "L"
    unit: Optional[str] = None
    category: Optional[str] = None
    phone: Optional[str] = None
    chest_number: Optional[str] = None
    vest_color: Optional[str] = None
    wave_number: Optional[int] = 1

class BulkEventParticipantsRequest(BaseModel):
    participants: List[BulkEventParticipantItem]

class BulkEventParticipantsResponse(BaseModel):
    total_processed: int
    existing_participants_reused: int
    new_participants_created: int
    linked_to_event: int
    failed_rows: int
    errors: List[str] = []

# --- Wave Distribution ---

class DistributeWavesRequest(BaseModel):
    total_waves: int = Field(..., ge=1, description="Jumlah gelombang pelaksanaan")
    strategy: str = Field(default="sequential", description="Metode pembagian: 'sequential' atau 'round_robin'")
    auto_chest_numbers: bool = Field(default=True, description="Otomatis beri nomor dada per gelombang")

# --- Run Score Input ---

class RunScoreInputRequest(BaseModel):
    run_laps: int = Field(..., ge=0, description="Jumlah putaran lari penuh")
    run_extra_meters: float = Field(0.0, ge=0, description="Lebihan meter jarak lari")
    run_notes: Optional[str] = None

# --- Wave Run Live Cam Assessment ---

class WaveRunStartRequest(BaseModel):
    camera_id: Optional[int] = None
    target_duration_seconds: int = Field(default=720, ge=0, description="Durasi lari dalam detik (standar 12 menit = 720 detik)")
    lap_cooldown_seconds: float = Field(default=15.0, ge=2.0, description="Cooldown anti-dobel hitung per peserta (detik)")
    confirm_frames_required: int = Field(default=1, ge=1, le=5)

class WaveRunControlRequest(BaseModel):
    action: str = Field(..., description="'pause', 'resume', 'stop', 'adjust_lap', atau 'set_extra_meters'")
    participant_id: Optional[int] = None
    delta: Optional[int] = 1
    extra_meters: Optional[float] = 0.0

class WaveRunParticipantSaveItem(BaseModel):
    participant_id: int
    run_laps: int = Field(..., ge=0)
    run_extra_meters: float = Field(default=0.0, ge=0)

class WaveRunSaveRequest(BaseModel):
    participants: Optional[List[WaveRunParticipantSaveItem]] = None
    stop_session: bool = True

class WaveParticipantConfigItem(BaseModel):
    participant_id: int
    chest_number: Optional[str] = None
    vest_color: Optional[str] = None

class WaveParticipantConfigRequest(BaseModel):
    participants: List[WaveParticipantConfigItem]

# --- Samapta Event Schemas ---

class SamaptaEventBase(BaseModel):
    name: str
    location: str
    start_date: date
    end_date: Optional[date] = None
    description: Optional[str] = None
    track_length_meters: float = 400.0
    total_waves: int = 1
    status: str = "scheduled"

class SamaptaEventCreate(SamaptaEventBase):
    pass

class SamaptaEventUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None
    track_length_meters: Optional[float] = None
    total_waves: Optional[int] = None
    status: Optional[str] = None

class SamaptaEventResponse(BaseModel):
    id: int
    event_code: str
    name: str
    location: str
    start_date: date
    end_date: Optional[date] = None
    description: Optional[str] = None
    track_length_meters: float
    total_waves: int
    status: str
    created_at: datetime
    updated_at: datetime
    total_participants: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)

# --- Recap Response ---

class ParticipantRecapItem(BaseModel):
    event_participant_id: int
    participant_id: int
    nrp: str
    name: str
    gender: str
    unit: Optional[str] = None
    category: Optional[str] = None
    chest_number: Optional[str] = None
    wave_number: int
    # Samapta A (Lari)
    run_laps: int
    run_extra_meters: float
    run_distance_meters: float
    run_score: Optional[float] = None
    run_predicate: Optional[str] = None
    # Samapta B (Pullup, Pushup, Situp, Shuttle Run)
    pullup_reps: Optional[int] = None
    pullup_score: Optional[float] = None
    pushup_reps: Optional[int] = None
    pushup_score: Optional[float] = None
    situp_reps: Optional[int] = None
    situp_score: Optional[float] = None
    shuttlerun_seconds: Optional[float] = None
    shuttlerun_score: Optional[float] = None
    # Summary
    samapta_a_score: Optional[float] = None
    samapta_b_avg_score: Optional[float] = None
    total_final_score: Optional[float] = None
    final_predicate: Optional[str] = None

class EventRecapResponse(BaseModel):
    event: SamaptaEventResponse
    total_participants: int
    waves: List[Dict[str, Any]]
    participants: List[ParticipantRecapItem]
