from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.rule_profile import RuleProfile
from app.schemas.rule_profile import (
    RuleProfileCreate, RuleProfileUpdate, RuleProfileResponse
)
from app.api.deps import require_roles

router = APIRouter(prefix="/rule-profiles", tags=["Rule Profiles"])

@router.get("/", response_model=List[RuleProfileResponse])
def get_rule_profiles(
    exercise_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(RuleProfile)
    if exercise_type:
        query = query.filter(RuleProfile.exercise_type == exercise_type)
    return query.order_by(RuleProfile.id.asc()).all()

@router.post("/", response_model=RuleProfileResponse, status_code=status.HTTP_201_CREATED)
def create_rule_profile(
    data: RuleProfileCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles("admin"))
):
    profile = RuleProfile(**data.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile

@router.get("/{profile_id}", response_model=RuleProfileResponse)
def get_rule_profile_by_id(profile_id: int, db: Session = Depends(get_db)):
    profile = db.query(RuleProfile).filter(RuleProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil aturan tidak ditemukan")
    return profile

@router.put("/{profile_id}", response_model=RuleProfileResponse)
def update_rule_profile(
    profile_id: int,
    data: RuleProfileUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_roles("admin"))
):
    profile = db.query(RuleProfile).filter(RuleProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil aturan tidak ditemukan")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(profile, key, val)

    db.commit()
    db.refresh(profile)
    return profile

