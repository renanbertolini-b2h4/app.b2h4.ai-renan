from sqlalchemy import Column, String, Text, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
from app.core.database import Base
from app.core.crypto import EncryptionService


class ApiCredential(Base):
    __tablename__ = "api_credentials"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    key = Column(String(100), unique=True, nullable=False, index=True)
    encrypted_value = Column(Text, nullable=True)
    description = Column(String(500), nullable=True)
    category = Column(String(50), nullable=False, default="general")
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
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
        return bool(self.encrypted_value)
    
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
