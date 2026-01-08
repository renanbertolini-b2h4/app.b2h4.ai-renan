from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base


class GammaGeneration(Base):
    __tablename__ = "gamma_generations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    prompt = Column(Text, nullable=False)
    
    gamma_id = Column(String(100), nullable=True)
    gamma_url = Column(String(500), nullable=True)
    
    format = Column(String(20), default="presentation")
    theme = Column(String(50), nullable=True)
    num_cards = Column(Integer, default=10)
    
    status = Column(String(20), default="completed")
    
    pdf_path = Column(String(500), nullable=True)
    material_id = Column(UUID(as_uuid=True), ForeignKey("materials.id", ondelete="SET NULL"), nullable=True)
    
    extra_data = Column(JSONB, default={})
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    creator = relationship("User", foreign_keys=[created_by])
    material = relationship("Material", foreign_keys=[material_id])
