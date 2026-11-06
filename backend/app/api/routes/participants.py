from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.models.participant import Participant
from app.models.audit_log import AuditLog
from app.schemas.participant import (
    ParticipantCreate, ParticipantUpdate, ParticipantResponse,
    ParticipantBulkCreate, ParticipantBulkResponse
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/participants", tags=["Participants"])

@router.get("/", response_model=List[ParticipantResponse])
def get_participants(
    search: Optional[str] = Query(None, description="Cari nomor peserta atau nama"),
    category: Optional[str] = Query(None, description="Filter kategori"),
    gender: Optional[str] = Query(None, description="Filter jenis kelamin"),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(Participant)
    if search:
        search_fmt = f"%{search}%"
        query = query.filter(
            or_(
                Participant.full_name.ilike(search_fmt),
                Participant.participant_number.ilike(search_fmt),
                Participant.organization.ilike(search_fmt)
            )
        )
    if category:
        query = query.filter(Participant.category == category)
    if gender:
        query = query.filter(Participant.gender == gender)

    return query.order_by(Participant.id.desc()).offset(skip).limit(limit).all()

@router.post("/", response_model=ParticipantResponse, status_code=status.HTTP_201_CREATED)
def create_participant(
    data: ParticipantCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    existing = db.query(Participant).filter(Participant.participant_number == data.participant_number).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nomor peserta '{data.participant_number}' sudah terdaftar"
        )

    participant = Participant(**data.model_dump())
    db.add(participant)
    db.commit()
    db.refresh(participant)

    # Audit log
    audit = AuditLog(
        user_id=current_user.id if current_user else None,
        action="CREATE",
        resource_type="participant",
        resource_id=str(participant.id),
        details=f"Pendaftaran peserta baru: {participant.full_name} ({participant.participant_number})"
    )
    db.add(audit)
    db.commit()

    return participant

@router.post("/bulk", response_model=ParticipantBulkResponse, status_code=status.HTTP_201_CREATED)
def bulk_create_participants(
    payload: ParticipantBulkCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    inserted = 0
    updated = 0
    skipped = 0
    errors = []
    results = []

    for idx, item in enumerate(payload.participants):
        try:
            clean_num = item.participant_number.strip()
            if not clean_num:
                skipped += 1
                continue
            existing = db.query(Participant).filter(Participant.participant_number == clean_num).first()
            if existing:
                existing.full_name = item.full_name.strip()
                existing.gender = item.gender
                if item.organization:
                    existing.organization = item.organization.strip()
                if item.category:
                    existing.category = item.category.strip()
                if item.phone:
                    existing.phone = item.phone.strip()
                if item.notes:
                    existing.notes = item.notes.strip()
                results.append(existing)
                updated += 1
            else:
                new_p = Participant(
                    participant_number=clean_num,
                    full_name=item.full_name.strip(),
                    gender=item.gender,
                    organization=item.organization.strip() if item.organization else "Umum",
                    category=item.category.strip() if item.category else "Umum",
                    phone=item.phone.strip() if item.phone else None,
                    notes=item.notes.strip() if item.notes else None
                )
                db.add(new_p)
                results.append(new_p)
                inserted += 1
        except Exception as e:
            errors.append(f"Baris {idx + 1} ({item.participant_number}): {str(e)}")
            skipped += 1

    db.commit()
    for p in results:
        db.refresh(p)

    # Audit log
    audit = AuditLog(
        user_id=current_user.id if current_user else None,
        action="BULK_CREATE",
        resource_type="participant",
        resource_id=f"count:{inserted + updated}",
        details=f"Pendaftaran peserta massal (bulk): {inserted} baru, {updated} diperbarui, {skipped} dilewati."
    )
    db.add(audit)
    db.commit()

    return {
        "total_received": len(payload.participants),
        "inserted_count": inserted,
        "updated_count": updated,
        "skipped_count": skipped,
        "participants": results,
        "errors": errors
    }

@router.get("/{participant_id}", response_model=ParticipantResponse)
def get_participant_by_id(participant_id: int, db: Session = Depends(get_db)):
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")
    return participant

@router.put("/{participant_id}", response_model=ParticipantResponse)
def update_participant(
    participant_id: int,
    data: ParticipantUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")

    update_dict = data.model_dump(exclude_unset=True)
    if "participant_number" in update_dict and update_dict["participant_number"] != participant.participant_number:
        existing = db.query(Participant).filter(Participant.participant_number == update_dict["participant_number"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Nomor peserta sudah digunakan")

    for key, value in update_dict.items():
        setattr(participant, key, value)

    db.commit()
    db.refresh(participant)

    audit = AuditLog(
        user_id=current_user.id if current_user else None,
        action="UPDATE",
        resource_type="participant",
        resource_id=str(participant.id),
        details=f"Pembaruan data peserta: {participant.full_name}"
    )
    db.add(audit)
    db.commit()

    return participant

@router.delete("/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_participant(
    participant_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Peserta tidak ditemukan")

    db.delete(participant)
    db.commit()

    audit = AuditLog(
        user_id=current_user.id if current_user else None,
        action="DELETE",
        resource_type="participant",
        resource_id=str(participant_id),
        details=f"Penghapusan data peserta: {participant.full_name}"
    )
    db.add(audit)
    db.commit()
    return None
