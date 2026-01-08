from sqlalchemy import Column, String, Text, Integer, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime
import uuid


class Analise(Base):
    """Model para armazenar análises políticas"""
    __tablename__ = "analises"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Relacionamento com usuário
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    
    # Dados da análise
    politico = Column(String(255), nullable=False)
    lei = Column(String(255), nullable=False)
    
    # Resultado
    resultado = Column(Text, nullable=True)
    
    # Status
    status = Column(String(50), nullable=False, default="pendente")  # pendente, processando, concluido, erro
    error_message = Column(Text, nullable=True)
    
    # Metadados de execução
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    execution_time = Column(Float, nullable=True)  # em segundos
    tokens_used = Column(Integer, nullable=True)
    
    # IDs do Flowwise
    flowwise_session_id = Column(String(255), nullable=True)
    celery_task_id = Column(String(255), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    user = relationship("User", back_populates="analises")
    organization = relationship("Organization")
