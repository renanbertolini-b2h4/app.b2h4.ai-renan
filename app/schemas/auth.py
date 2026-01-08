from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None


class OrganizationFeatures(BaseModel):
    flowiseAccess: bool = False
    gammaAccess: bool = False
    courseAccess: bool = True
    settingsAccess: bool = False
    healthCheckAccess: bool = False
    courseManagement: bool = False
    piiAccess: bool = False


class EffectiveFeatures(BaseModel):
    flowiseAccess: bool = False
    gammaAccess: bool = False
    courseAccess: bool = True
    settingsAccess: bool = False
    healthCheckAccess: bool = False
    courseManagement: bool = False
    piiAccess: bool = False
    isAdmin: bool = False
    isSuperAdmin: bool = False


class OrganizationInfo(BaseModel):
    id: UUID
    name: str
    slug: str
    features: Dict[str, Any] = {"flowiseAccess": False, "courseAccess": True}
    
    class Config:
        from_attributes = True


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None


class UserInDB(UserBase):
    id: UUID
    is_active: bool
    organization_id: Optional[UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class User(UserInDB):
    organization: Optional[OrganizationInfo] = None
    role: str = "member"
    effectiveFeatures: Optional[EffectiveFeatures] = None
