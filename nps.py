from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
from uuid import UUID


class NpsCreate(BaseModel):
    score: int = Field(..., ge=0, le=10, description="NPS score from 0 to 10")
    feedback: Optional[str] = None
    allow_showcase: bool = False


class NpsResponse(BaseModel):
    id: UUID
    user_id: UUID
    score: int
    feedback: Optional[str] = None
    allow_showcase: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class NpsFeedbackItem(BaseModel):
    id: UUID
    score: int
    feedback: Optional[str] = None
    allow_showcase: bool
    created_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    
    class Config:
        from_attributes = True


class NpsStats(BaseModel):
    total_responses: int
    nps_score: float
    promoters_count: int
    neutrals_count: int
    detractors_count: int
    promoters_percentage: float
    neutrals_percentage: float
    detractors_percentage: float
    recent_feedbacks: List[NpsFeedbackItem]
