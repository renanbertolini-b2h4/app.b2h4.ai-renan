"""
Modelos SQLAlchemy para PII Masking
Arquivo: app/models/pii.py
"""

import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


class PseudonymizationMode(str, Enum):
    """Modos de pseudonimização disponíveis"""
    MASKING = "masking"
    SEMANTIC_TAGS = "tags"
    SYNTHETIC_DATA = "faker"
    
    @classmethod
    def get_description(cls, mode: str) -> dict:
        descriptions = {
            "masking": {
                "value": "masking",
                "name": "Mascaramento",
                "icon": "🔒",
                "example": "João Silva → Jo** ***va",
                "reversible": False,
                "recommended": False,
                "description": "Substitui por asteriscos. Irreversível.",
                "best_for": "Compartilhar com terceiros",
                "pros": ["Dados irrecuperáveis", "Seguro para compartilhar"],
                "cons": ["Perde contexto", "Análise IA menos precisa"]
            },
            "tags": {
                "value": "tags",
                "name": "Tags Semânticas",
                "icon": "🏷️",
                "example": "João Silva → [PESSOA_1]",
                "reversible": True,
                "recommended": True,
                "description": "Tags descritivas numeradas. Recomendado para IA.",
                "best_for": "Análise jurídica, financeira, compliance",
                "pros": ["IA entende placeholder", "Re-hidratação perfeita", "Análise precisa"],
                "cons": ["Texto menos natural"]
            },
            "faker": {
                "value": "faker",
                "name": "Dados Sintéticos",
                "icon": "🎭",
                "example": "João Silva → Carlos Santos",
                "reversible": True,
                "recommended": False,
                "description": "Dados fake realistas.",
                "best_for": "Marketing, testes, sentimento",
                "pros": ["Texto natural", "Bom para testes"],
                "cons": ["IA pode confundir nomes"]
            }
        }
        return descriptions.get(mode, {})
    
    @classmethod
    def get_all_modes(cls) -> list:
        return [cls.get_description(mode.value) for mode in cls]


class PIIProcessingJob(Base):
    """
    Registro de um processamento de chat do WhatsApp
    Armazena histórico de chats processados com PII mascarados
    """
    __tablename__ = "pii_processing_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    original_filename = Column(String(255), nullable=False)
    file_hash = Column(String(64), nullable=False)

    total_messages = Column(String, default="0")
    messages_with_pii = Column(String, default="0")
    total_pii_found = Column(String, default="0")

    pii_summary = Column(JSONB, default={})

    original_chat_preview = Column(Text, nullable=True)
    masked_chat_text = Column(Text, nullable=True)

    original_chars = Column(String, default="0")
    masked_chars = Column(String, default="0")
    compression_ratio = Column(String, default="0")
    chunk_count = Column(String, default="0")
    chunk_size = Column(String, default="60000")
    chunk_overlap = Column(String, default="30000")
    estimated_tokens = Column(String, default="0")

    status = Column(String(20), default="completed")
    error_message = Column(Text, nullable=True)
    
    pseudonymization_mode = Column(String(20), default="tags", nullable=False)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship("PIIMessage", back_populates="job", cascade="all, delete-orphan")
    analyses = relationship("PIIAnalysis", back_populates="job", cascade="all, delete-orphan")
    vault = relationship("PIIVault", back_populates="job", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<PIIProcessingJob {self.id} - {self.original_filename}>"


class PIIMessage(Base):
    """
    Mensagem individual do chat com PII detectados
    """
    __tablename__ = "pii_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("pii_processing_jobs.id"), nullable=False)

    timestamp = Column(String(50), nullable=False)
    sender = Column(String(255), nullable=False)
    original_content = Column(Text, nullable=False)
    masked_content = Column(Text, nullable=False)

    pii_found = Column(JSONB, default=[])
    has_pii = Column(Boolean, default=False)

    message_index = Column(String, default="0")

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("PIIProcessingJob", back_populates="messages")

    def __repr__(self):
        return f"<PIIMessage {self.id} - {self.sender}>"


class PIIVault(Base):
    """
    Vault para armazenar mapeamentos de pseudonimização reversível.
    Permite recuperar dados originais após processamento com LLM.
    """
    __tablename__ = "pii_vault"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("pii_processing_jobs.id"), nullable=False, unique=True)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)

    deanonymizer_mapping = Column(JSONB, nullable=False, default={})
    anonymizer_mapping = Column(JSONB, nullable=False, default={})

    faker_seed = Column(String, nullable=True)
    processing_method = Column(String(50), default="presidio")

    total_entities_mapped = Column(String, default="0")
    entity_types = Column(JSONB, default=[])

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    job = relationship("PIIProcessingJob", back_populates="vault")

    def __repr__(self):
        return f"<PIIVault {self.id} - job {self.job_id}>"


class PIIAnalysis(Base):
    """
    Análise de conversa com LLM
    """
    __tablename__ = "pii_analyses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("pii_processing_jobs.id"), nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    task_type = Column(String(50), nullable=False)
    prompt = Column(Text, nullable=False)

    llm_model = Column(String(100), nullable=True)
    llm_response = Column(Text, nullable=True)

    user_rating = Column(String, nullable=True)
    feedback = Column(Text, nullable=True)

    status = Column(String(20), default="pending")

    is_chunked = Column(Boolean, default=False)
    total_chunks = Column(String, nullable=True)
    completed_chunks = Column(String, default="0")
    failed_chunks = Column(String, default="0")
    consolidated_response = Column(Text, nullable=True)

    tokens_per_min = Column(String, default="30000")
    delay_between_chunks = Column(String, default="2")
    is_paused = Column(Boolean, default=False)
    pause_reason = Column(Text, nullable=True)
    rate_limit_wait_until = Column(DateTime, nullable=True)
    
    started_at = Column(DateTime, nullable=True)
    estimated_completion = Column(DateTime, nullable=True)
    avg_chunk_time_ms = Column(String, default="0")

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    job = relationship("PIIProcessingJob", back_populates="analyses")
    chunks = relationship("PIIAnalysisChunk", back_populates="analysis", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<PIIAnalysis {self.id} - {self.task_type}>"


class PIIAnalysisChunk(Base):
    """
    Chunk de análise para conversas longas
    Permite processar conversas em partes com overlap
    """
    __tablename__ = "pii_analysis_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id = Column(UUID(as_uuid=True), ForeignKey("pii_analyses.id"), nullable=False)

    chunk_index = Column(String, nullable=False)
    total_chunks = Column(String, nullable=False)
    start_char = Column(String, nullable=False)
    end_char = Column(String, nullable=False)

    prompt = Column(Text, nullable=True)
    llm_response = Column(Text, nullable=True)
    result_data = Column(JSONB, default={})

    status = Column(String(20), default="pending")
    retry_count = Column(String, default="0")
    max_retries = Column(String, default="3")
    error_message = Column(Text, nullable=True)
    error_code = Column(String(50), nullable=True)
    
    processing_time_ms = Column(String, default="0")
    tokens_used = Column(String, default="0")
    
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    last_retry_at = Column(DateTime, nullable=True)
    rate_limit_delay_s = Column(String, default="0")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    analysis = relationship("PIIAnalysis", back_populates="chunks")

    def __repr__(self):
        return f"<PIIAnalysisChunk {self.id} - chunk {self.chunk_index}>"


class PIIPattern(Base):
    """
    Padrões de PII customizados por organização
    """
    __tablename__ = "pii_patterns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)

    name = Column(String(100), nullable=False)
    regex = Column(String(500), nullable=False)
    pii_type = Column(String(50), nullable=False)
    masking_strategy = Column(String(50), default="redaction")
    description = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<PIIPattern {self.name}>"


# ============================================================================
# SCHEMAS PYDANTIC
# ============================================================================

from pydantic import BaseModel
from typing import List, Optional, Dict
from uuid import UUID as PyUUID


class PIIMessageResponse(BaseModel):
    id: PyUUID
    timestamp: str
    sender: str
    original_content: str
    masked_content: str
    pii_found: List[Dict]
    has_pii: bool

    class Config:
        from_attributes = True


class PIIProcessingJobResponse(BaseModel):
    id: PyUUID
    original_filename: str
    total_messages: str
    messages_with_pii: str
    total_pii_found: str
    pii_summary: Dict
    masked_chat_text: Optional[str] = None
    original_chars: Optional[str] = "0"
    masked_chars: Optional[str] = "0"
    compression_ratio: Optional[str] = "0"
    chunk_count: Optional[str] = "0"
    chunk_size: Optional[str] = "60000"
    chunk_overlap: Optional[str] = "30000"
    estimated_tokens: Optional[str] = "0"
    pseudonymization_mode: Optional[str] = "tags"
    status: str
    created_at: datetime
    created_by: PyUUID

    class Config:
        from_attributes = True


class PIIAnalysisChunkResponse(BaseModel):
    id: PyUUID
    chunk_index: str
    total_chunks: str
    start_char: str
    end_char: str
    llm_response: Optional[str]
    status: str
    retry_count: Optional[str] = "0"
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    processing_time_ms: Optional[str] = "0"
    rate_limit_delay_s: Optional[str] = "0"
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PIIAnalysisResponse(BaseModel):
    id: PyUUID
    job_id: PyUUID
    task_type: str
    prompt: str
    llm_model: Optional[str]
    llm_response: Optional[str]
    user_rating: Optional[str]
    status: str
    is_chunked: Optional[bool] = False
    total_chunks: Optional[str] = None
    completed_chunks: Optional[str] = "0"
    failed_chunks: Optional[str] = "0"
    consolidated_response: Optional[str] = None
    is_paused: Optional[bool] = False
    pause_reason: Optional[str] = None
    rate_limit_wait_until: Optional[datetime] = None
    started_at: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    avg_chunk_time_ms: Optional[str] = "0"
    created_at: datetime

    class Config:
        from_attributes = True


class ChunkProgressItem(BaseModel):
    index: int
    status: str
    retry_count: int = 0
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    processing_time_ms: int = 0
    rate_limit_delay_s: int = 0


class AnalysisProgressResponse(BaseModel):
    analysis_id: PyUUID
    job_id: PyUUID
    task_type: str
    llm_model: Optional[str]
    status: str
    is_paused: bool = False
    pause_reason: Optional[str] = None
    
    total_chunks: int
    completed_chunks: int
    failed_chunks: int
    pending_chunks: int
    processing_chunks: int
    progress_percent: float
    
    chunks: List[ChunkProgressItem]
    
    started_at: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    estimated_remaining_seconds: Optional[int] = None
    avg_chunk_time_ms: int = 0
    
    rate_limit_info: Optional[Dict] = None
    
    can_resume: bool = False
    can_change_model: bool = False


class AnalyzeWithLLMConfigRequest(BaseModel):
    job_id: PyUUID
    task_type: str
    llm_model: Optional[str] = None
    custom_prompt: Optional[str] = None
    tokens_per_min: Optional[int] = 30000
    delay_between_chunks: Optional[int] = 2


class ResumeAnalysisRequest(BaseModel):
    analysis_id: PyUUID
    new_model: Optional[str] = None
    reset_failed_chunks: bool = True


class ProcessChatRequest(BaseModel):
    filename: str
    content: str


class AnalyzeWithLLMRequest(BaseModel):
    job_id: PyUUID
    task_type: str
    llm_model: Optional[str] = None
    custom_prompt: Optional[str] = None


class CreatePIIPatternRequest(BaseModel):
    name: str
    regex: str
    pii_type: str
    masking_strategy: str
    description: Optional[str] = None


class ChatWithAnalysisRequest(BaseModel):
    analysis_id: PyUUID
    question: str
    include_context: bool = True


class ChatWithAnalysisResponse(BaseModel):
    answer: str
    sources: List[str] = []
    analysis_id: PyUUID


class ChatWithJobRequest(BaseModel):
    job_id: PyUUID
    question: str
    llm_model: Optional[str] = "gpt-4-turbo"
    include_analyses: bool = True


class ChatWithJobResponse(BaseModel):
    answer: str
    sources: List[str] = []
    job_id: PyUUID
    tokens_used: Optional[int] = None


class PrivilegedViewRequest(BaseModel):
    job_id: PyUUID
    reason: str
    message_ids: Optional[List[PyUUID]] = None
