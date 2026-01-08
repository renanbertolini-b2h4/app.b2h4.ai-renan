from sqlalchemy import Column, String, DateTime, Boolean, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base


class Material(Base):
    __tablename__ = "materials"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(10), default="📄")
    
    file_type = Column(String(10), default="md")
    file_path = Column(String(500), nullable=True)
    content = Column(Text, nullable=True)
    file_size = Column(String(50), nullable=True)
    
    media_type = Column(String(20), default="document")
    collection = Column(String(50), default="course")
    extra_data = Column("metadata", JSONB, default={})
    thumbnail_path = Column(String(500), nullable=True)
    
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    
    organization_access = relationship("MaterialOrganizationAccess", back_populates="material", cascade="all, delete-orphan")
    user_access = relationship("MaterialUserAccess", back_populates="material", cascade="all, delete-orphan")
    
    def has_restrictions(self) -> bool:
        return len(self.organization_access) > 0 or len(self.user_access) > 0
    
    def get_allowed_org_ids(self) -> list:
        return [access.organization_id for access in self.organization_access]
    
    def get_allowed_user_ids(self) -> list:
        return [access.user_id for access in self.user_access]
