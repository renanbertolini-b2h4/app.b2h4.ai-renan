from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class AnaliseRequest(BaseModel):
    """Schema para criar nova análise (compatibilidade)"""
    politico: str
    lei: str


class AnaliseCreate(BaseModel):
    """Schema para criar nova análise"""
    politico: str = Field(..., min_length=2, max_length=255, description="Nome do político")
    lei: str = Field(..., min_length=2, max_length=255, description="Lei ou projeto a analisar")


class AnaliseResponse(BaseModel):
    """Schema de resposta da análise"""
    id: UUID
    politico: str
    lei: str
    resultado: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    execution_time: Optional[float] = None
    tokens_used: Optional[int] = None
    flowwise_session_id: Optional[str] = None
    celery_task_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    success: bool = True  # Compatibilidade com versão antiga
    
    class Config:
        from_attributes = True


class AnaliseStatus(BaseModel):
    """Schema para consultar status da análise"""
    id: UUID
    status: str
    resultado: Optional[str] = None
    error_message: Optional[str] = None
    execution_time: Optional[float] = None
    
    class Config:
        from_attributes = True
