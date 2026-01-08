from sqlalchemy import Column, String, DateTime, Boolean, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base
from app.core.features import get_feature_keys, get_all_features_enabled, get_default_features


class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey('organizations.id', ondelete='CASCADE'),
        nullable=True,
        index=True
    )
    
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(200), nullable=True)
    
    role = Column(
        Enum('owner', 'admin', 'member', 'guest', name='user_role'),
        default='member',
        nullable=False
    )
    
    features = Column(
        JSONB,
        default=get_default_features,
        nullable=False
    )
    
    is_active = Column(Boolean, default=True, nullable=False)
    is_super_admin = Column(Boolean, default=False, nullable=False)
    last_login_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    organization = relationship("Organization", back_populates="users")
    analises = relationship("Analise", back_populates="user")
    
    def get_effective_features(self):
        """
        Calcula as features efetivas baseado na hierarquia:
        - Super Admin: acesso total (bypassa tudo)
        - Admin de Org: limitado às features da organização
        - Member: interseção de org AND user features
        """
        feature_keys = get_feature_keys()
        
        if self.is_super_admin:
            result = get_all_features_enabled()
            result["isAdmin"] = True
            result["isSuperAdmin"] = True
            return result
        
        org_features = self.organization.features if self.organization else {}
        user_features = self.features or {}
        
        is_org_admin = self.role in ('owner', 'admin')
        
        if is_org_admin:
            result = {}
            for key in feature_keys:
                result[key] = org_features.get(key, False)
            result["isAdmin"] = True
            result["isSuperAdmin"] = False
            return result
        
        result = {}
        for key in feature_keys:
            result[key] = (
                org_features.get(key, False) and 
                user_features.get(key, False)
            )
        result["isAdmin"] = False
        result["isSuperAdmin"] = False
        return result
