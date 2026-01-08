from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base
from app.core.crypto import EncryptionService


class OrgCredential(Base):
    """
    Credenciais de API específicas por organização.
    Permite que cada organização configure suas próprias APIs (ex: Flowise).
    """
    __tablename__ = "org_credentials"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String(100), nullable=False, index=True)
    encrypted_value = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    organization = relationship("Organization", backref="credentials")
    
    __table_args__ = (
        UniqueConstraint('organization_id', 'key', name='uq_org_credential_key'),
    )
    
    @property
    def value(self) -> str:
        if not self.encrypted_value:
            return ""
        try:
            return EncryptionService.decrypt_value(self.encrypted_value)
        except:
            return ""
    
    @value.setter
    def value(self, plaintext: str):
        if plaintext:
            self.encrypted_value = EncryptionService.encrypt_value(plaintext)
        else:
            self.encrypted_value = None
    
    @property
    def is_configured(self) -> bool:
        """Verifica se a credencial está configurada com valor não vazio."""
        if not self.encrypted_value:
            return False
        try:
            decrypted = EncryptionService.decrypt_value(self.encrypted_value)
            return bool(decrypted and decrypted.strip())
        except:
            return False
    
    @property
    def masked_value(self) -> str:
        if not self.encrypted_value:
            return ""
        try:
            decrypted = EncryptionService.decrypt_value(self.encrypted_value)
            if len(decrypted) <= 8:
                return "*" * len(decrypted)
            return decrypted[:4] + "*" * (len(decrypted) - 8) + decrypted[-4:]
        except:
            return "****"
