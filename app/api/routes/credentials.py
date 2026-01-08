import os
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.api.routes.admin import require_super_admin
from app.models.user import User
from app.models.api_credential import ApiCredential

router = APIRouter()

PREDEFINED_APIS = [
    {
        "key": "REPLICATE_API_TOKEN",
        "name": "Replicate API",
        "description": "Token para geração de imagens com IA (certificados)",
        "category": "ai",
        "docs_url": "https://replicate.com/account/api-tokens"
    },
    {
        "key": "OPENAI_API_KEY",
        "name": "OpenAI API",
        "description": "Chave da API OpenAI para GPT e outros modelos",
        "category": "ai",
        "docs_url": "https://platform.openai.com/api-keys"
    },
    {
        "key": "FLOWWISE_API_KEY",
        "name": "Flowise API",
        "description": "Chave da API Flowise para chatbots",
        "category": "ai",
        "docs_url": ""
    },
    {
        "key": "FLOWWISE_API_URL",
        "name": "Flowise URL",
        "description": "URL base da API Flowise",
        "category": "ai",
        "docs_url": ""
    },
    {
        "key": "ELEVENLABS_API_KEY",
        "name": "ElevenLabs API",
        "description": "Chave da API ElevenLabs para síntese de voz",
        "category": "ai",
        "docs_url": "https://elevenlabs.io/app/settings/api-keys"
    },
    {
        "key": "GAMMA_API_KEY",
        "name": "Gamma API",
        "description": "Chave da API Gamma para criação de apresentações com IA",
        "category": "ai",
        "docs_url": "https://gamma.app"
    },
    {
        "key": "SMTP_HOST",
        "name": "SMTP Host",
        "description": "Servidor SMTP para envio de emails",
        "category": "email",
        "docs_url": ""
    },
    {
        "key": "SMTP_PORT",
        "name": "SMTP Port",
        "description": "Porta do servidor SMTP",
        "category": "email",
        "docs_url": ""
    },
    {
        "key": "SMTP_USER",
        "name": "SMTP User",
        "description": "Usuário do servidor SMTP",
        "category": "email",
        "docs_url": ""
    },
    {
        "key": "SMTP_PASSWORD",
        "name": "SMTP Password",
        "description": "Senha do servidor SMTP",
        "category": "email",
        "docs_url": ""
    }
]


class CredentialCreate(BaseModel):
    key: str
    name: str
    value: str
    description: Optional[str] = None
    category: str = "general"


class CredentialUpdate(BaseModel):
    name: Optional[str] = None
    value: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CredentialResponse(BaseModel):
    id: str
    key: str
    name: str
    description: Optional[str]
    category: str
    is_configured: bool
    masked_value: str
    is_active: bool
    docs_url: Optional[str] = None
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class CredentialStatusResponse(BaseModel):
    key: str
    name: str
    description: str
    category: str
    is_configured: bool
    source: str
    docs_url: Optional[str] = None


@router.get("/admin/credentials/predefined")
def list_predefined_apis(
    current_user: User = Depends(require_super_admin)
):
    return {"apis": PREDEFINED_APIS}


@router.get("/admin/credentials/status")
def get_credentials_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    status_list = []
    
    db_credentials = {c.key: c for c in db.query(ApiCredential).all()}
    
    for api in PREDEFINED_APIS:
        key = api["key"]
        
        env_value = os.environ.get(key)
        db_cred = db_credentials.get(key)
        
        if db_cred and db_cred.is_configured:
            is_configured = True
            source = "database"
        elif env_value:
            is_configured = True
            source = "environment"
        else:
            is_configured = False
            source = "not_configured"
        
        status_list.append(CredentialStatusResponse(
            key=key,
            name=api["name"],
            description=api["description"],
            category=api["category"],
            is_configured=is_configured,
            source=source,
            docs_url=api.get("docs_url")
        ))
    
    custom_creds = db.query(ApiCredential).filter(
        ~ApiCredential.key.in_([a["key"] for a in PREDEFINED_APIS])
    ).all()
    
    for cred in custom_creds:
        status_list.append(CredentialStatusResponse(
            key=cred.key,
            name=cred.name,
            description=cred.description or "",
            category=cred.category,
            is_configured=cred.is_configured,
            source="database",
            docs_url=None
        ))
    
    return {"credentials": status_list}


@router.get("/admin/credentials", response_model=List[CredentialResponse])
def list_credentials(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    credentials = db.query(ApiCredential).order_by(ApiCredential.category, ApiCredential.name).all()
    
    result = []
    for cred in credentials:
        predefined = next((a for a in PREDEFINED_APIS if a["key"] == cred.key), None)
        result.append(CredentialResponse(
            id=str(cred.id),
            key=cred.key,
            name=cred.name,
            description=cred.description,
            category=cred.category,
            is_configured=cred.is_configured,
            masked_value=cred.masked_value,
            is_active=cred.is_active,
            docs_url=predefined.get("docs_url") if predefined else None,
            created_at=cred.created_at,
            updated_at=cred.updated_at
        ))
    
    return result


@router.post("/admin/credentials", response_model=CredentialResponse)
def create_credential(
    data: CredentialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    existing = db.query(ApiCredential).filter(ApiCredential.key == data.key).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credencial com essa chave já existe"
        )
    
    credential = ApiCredential(
        id=uuid.uuid4(),
        key=data.key,
        name=data.name,
        description=data.description,
        category=data.category,
        is_active=True
    )
    credential.value = data.value
    
    db.add(credential)
    db.commit()
    db.refresh(credential)
    
    predefined = next((a for a in PREDEFINED_APIS if a["key"] == credential.key), None)
    
    return CredentialResponse(
        id=str(credential.id),
        key=credential.key,
        name=credential.name,
        description=credential.description,
        category=credential.category,
        is_configured=credential.is_configured,
        masked_value=credential.masked_value,
        is_active=credential.is_active,
        docs_url=predefined.get("docs_url") if predefined else None,
        created_at=credential.created_at,
        updated_at=credential.updated_at
    )


@router.put("/admin/credentials/{credential_id}", response_model=CredentialResponse)
def update_credential(
    credential_id: str,
    data: CredentialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    credential = db.query(ApiCredential).filter(ApiCredential.id == credential_id).first()
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Credencial não encontrada"
        )
    
    if data.name is not None:
        credential.name = data.name
    if data.value is not None:
        credential.value = data.value
    if data.description is not None:
        credential.description = data.description
    if data.is_active is not None:
        credential.is_active = data.is_active
    
    credential.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(credential)
    
    predefined = next((a for a in PREDEFINED_APIS if a["key"] == credential.key), None)
    
    return CredentialResponse(
        id=str(credential.id),
        key=credential.key,
        name=credential.name,
        description=credential.description,
        category=credential.category,
        is_configured=credential.is_configured,
        masked_value=credential.masked_value,
        is_active=credential.is_active,
        docs_url=predefined.get("docs_url") if predefined else None,
        created_at=credential.created_at,
        updated_at=credential.updated_at
    )


@router.delete("/admin/credentials/{credential_id}")
def delete_credential(
    credential_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    credential = db.query(ApiCredential).filter(ApiCredential.id == credential_id).first()
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Credencial não encontrada"
        )
    
    db.delete(credential)
    db.commit()
    
    return {"message": "Credencial removida com sucesso"}


class SetupValueRequest(BaseModel):
    value: str


@router.post("/admin/credentials/setup/{key}", response_model=CredentialResponse)
def setup_predefined_credential(
    key: str,
    data: SetupValueRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    predefined = next((a for a in PREDEFINED_APIS if a["key"] == key), None)
    if not predefined:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API não encontrada na lista de APIs predefinidas"
        )
    
    existing = db.query(ApiCredential).filter(ApiCredential.key == key).first()
    
    if existing:
        existing.value = data.value
        existing.updated_at = datetime.utcnow()
        credential = existing
    else:
        credential = ApiCredential(
            id=uuid.uuid4(),
            key=key,
            name=predefined["name"],
            description=predefined["description"],
            category=predefined["category"],
            is_active=True
        )
        credential.value = data.value
        db.add(credential)
    
    db.commit()
    db.refresh(credential)
    
    return CredentialResponse(
        id=str(credential.id),
        key=credential.key,
        name=credential.name,
        description=credential.description,
        category=credential.category,
        is_configured=credential.is_configured,
        masked_value=credential.masked_value,
        is_active=credential.is_active,
        docs_url=predefined.get("docs_url"),
        created_at=credential.created_at,
        updated_at=credential.updated_at
    )


def get_api_credential(key: str, db: Session) -> Optional[str]:
    credential = db.query(ApiCredential).filter(
        ApiCredential.key == key,
        ApiCredential.is_active == True
    ).first()
    
    if credential and credential.is_configured:
        return credential.value
    
    return os.environ.get(key)
