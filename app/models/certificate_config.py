from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base


DEFAULT_PROMPT_STYLE = """Corporate background for digital certificate, abstract technology theme. Central focal point: glowing AI digital brain with neural pathways and circuit patterns, positioned prominently in the center. Vibrant cyan (#00BCD4) and dark blue (#1A1F3A) gradients radiating from the central brain. Data flows and neural network connections emanating outward from the brain. Minimalist clean style, symmetrical composition, the AI brain should be the clear centerpiece surrounded by negative space for text overlay. High quality 8k render, professional business aesthetic, futuristic holographic effect on the brain element."""


class CertificateConfig(Base):
    __tablename__ = "certificate_configs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, unique=True)
    
    prompt_style = Column(Text, default=DEFAULT_PROMPT_STYLE)
    aspect_ratio = Column(String(20), default="16:9")
    certificate_title = Column(String(200), default="CERTIFICADO DE CONCLUSÃO")
    certificate_subtitle = Column(String(200), default="Conferido a")
    conclusion_message = Column(Text, default="Pela participação na Imersão de Transformação Digital & IA.")
    event_date = Column(String(100), nullable=True)
    primary_color = Column(String(20), default="#00BCD4")
    background_color = Column(String(20), default="#1A1F3A")
    text_color = Column(String(20), default="#FFFFFF")
    instructors = Column(JSONB, default=list)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    organization = relationship("Organization", backref="certificate_config")
