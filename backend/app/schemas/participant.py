from typing import Optional
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict

class ParticipantBase(BaseModel):
    participant_number: str
    full_name: str
    gender: str
    birth_date: Optional[date] = None
    organization: Optional[str] = None
    category: str = "Umum"
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None

class ParticipantCreate(ParticipantBase):
    pass

class ParticipantUpdate(BaseModel):
    participant_number: Optional[str] = None
    full_name: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[date] = None
    organization: Optional[str] = None
    category: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None

class ParticipantResponse(ParticipantBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ParticipantBulkCreate(BaseModel):
    participants: list[ParticipantCreate]

class ParticipantBulkResponse(BaseModel):
    total_received: int
    inserted_count: int
    updated_count: int
    skipped_count: int
    participants: list[ParticipantResponse]
    errors: list[str] = []

