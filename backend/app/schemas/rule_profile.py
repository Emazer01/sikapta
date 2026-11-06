from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class RuleProfileBase(BaseModel):
    name: str
    exercise_type: str
    version: str = "1.0.0"
    description: Optional[str] = None
    is_default: bool = False
    config_json: Dict[str, Any]

class RuleProfileCreate(RuleProfileBase):
    pass

class RuleProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_default: Optional[bool] = None
    config_json: Optional[Dict[str, Any]] = None

class RuleProfileResponse(RuleProfileBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

