"""
Modelos para Análise Profunda (Deep Analysis)
Usa técnica Refine Chain para análise com contexto acumulativo
"""
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, JSON, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from uuid import UUID as PyUUID
import uuid
import enum

from app.core.database import Base


class DeepAnalysisType(str, enum.Enum):
    """Tipos de análise profunda disponíveis"""
    TOPIC_MAP = "topic_map"
    EXECUTIVE_REPORT = "executive"
    STAKEHOLDER = "stakeholder"
    DECISION_TIMELINE = "timeline"


class DeepAnalysisDetailLevel(str, enum.Enum):
    """Níveis de detalhe da análise"""
    RESUMIDO = "resumido"
    NORMAL = "normal"
    DETALHADO = "detalhado"


class DeepAnalysisStatus(str, enum.Enum):
    """Status do processamento"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DeepAnalysisJob(Base):
    """Job de análise profunda"""
    __tablename__ = "deep_analysis_jobs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    pii_job_id = Column(UUID(as_uuid=True), ForeignKey("pii_processing_jobs.id"), nullable=False)
    
    analysis_type = Column(String(50), nullable=False)
    status = Column(String(20), default="pending")
    
    detail_level = Column(String(20), default="normal")
    model_used = Column(String(50), default="gpt-4-turbo")
    
    total_chunks = Column(Integer, default=0)
    processed_chunks = Column(Integer, default=0)
    current_step = Column(String(200), nullable=True)
    error_message = Column(Text, nullable=True)
    
    intermediate_results = Column(JSON, default=list)
    
    final_result = Column(Text, nullable=True)
    final_result_json = Column(JSON, nullable=True)
    
    total_tokens_used = Column(Integer, default=0)
    processing_time_seconds = Column(Integer, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    pii_job = relationship("PIIProcessingJob", foreign_keys=[pii_job_id])
    organization = relationship("Organization", foreign_keys=[organization_id])
    creator = relationship("User", foreign_keys=[created_by])


class DeepAnalysisChunkResult(Base):
    """Resultado de cada chunk processado"""
    __tablename__ = "deep_analysis_chunk_results"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("deep_analysis_jobs.id"), nullable=False)
    
    chunk_index = Column(Integer, nullable=False)
    chunk_content_preview = Column(Text, nullable=True)
    
    extraction_result = Column(JSON, nullable=True)
    refined_result = Column(JSON, nullable=True)
    accumulated_context_preview = Column(Text, nullable=True)
    
    tokens_used = Column(Integer, default=0)
    processing_time_ms = Column(Integer, nullable=True)
    status = Column(String(20), default="pending")
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    job = relationship("DeepAnalysisJob", backref="chunk_results")


ANALYSIS_TYPE_INFO = {
    "topic_map": {
        "label": "Mapa de Tópicos Detalhado",
        "icon": "🗺️",
        "description": "Identifica todos os tópicos com conexões e threads entre chunks",
        "estimated_time": "3-5 minutos"
    },
    "executive": {
        "label": "Relatório Executivo",
        "icon": "📊",
        "description": "Sumário executivo para C-level com insights e recomendações",
        "estimated_time": "2-4 minutos"
    },
    "stakeholder": {
        "label": "Análise de Stakeholders",
        "icon": "👥",
        "description": "Mapeia participantes, papéis, posições e influência",
        "estimated_time": "2-3 minutos"
    },
    "timeline": {
        "label": "Timeline de Decisões",
        "icon": "📅",
        "description": "Cronologia de decisões tomadas e pendentes",
        "estimated_time": "2-4 minutos"
    }
}


class DeepAnalysisJobResponse(BaseModel):
    id: PyUUID
    organization_id: PyUUID
    pii_job_id: PyUUID
    pii_job_filename: Optional[str] = None
    analysis_type: str
    analysis_type_label: Optional[str] = None
    status: str
    detail_level: str
    model_used: str
    total_chunks: int
    processed_chunks: int
    current_step: Optional[str] = None
    error_message: Optional[str] = None
    final_result: Optional[str] = None
    final_result_json: Optional[Dict[str, Any]] = None
    total_tokens_used: int
    processing_time_seconds: Optional[int] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    progress_percent: float = 0
    
    class Config:
        from_attributes = True


class DeepAnalysisChunkResponse(BaseModel):
    id: PyUUID
    chunk_index: int
    chunk_content_preview: Optional[str] = None
    extraction_result: Optional[Dict[str, Any]] = None
    refined_result: Optional[Dict[str, Any]] = None
    tokens_used: int
    processing_time_ms: Optional[int] = None
    status: str
    
    class Config:
        from_attributes = True


class CreateDeepAnalysisRequest(BaseModel):
    pii_job_id: PyUUID
    analysis_type: str
    detail_level: str = "normal"
    model: str = "gpt-4-turbo"


class DeepAnalysisProgressResponse(BaseModel):
    job_id: PyUUID
    status: str
    progress_percent: float
    current_step: Optional[str] = None
    processed_chunks: int
    total_chunks: int
    chunks: List[Dict[str, Any]] = []
    error_message: Optional[str] = None


class DeepAnalysisTypesResponse(BaseModel):
    types: List[Dict[str, Any]]
    detail_levels: List[Dict[str, str]]
