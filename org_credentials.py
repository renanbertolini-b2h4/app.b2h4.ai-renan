import os
import re
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from datetime import datetime

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.api.routes.admin import require_super_admin
from app.models.user import User
from app.models.organization import Organization
from app.models.org_credential import OrgCredential

router = APIRouter()

ORG_PREDEFINED_APIS = [
    {
        "key": "FLOWISE_API_KEY",
        "name": "Flowise API Key",
        "description": "Chave da API Flowise para chatbots desta organização"
    },
    {
        "key": "FLOWISE_API_URL",
        "name": "Flowise URL",
        "description": "URL base da API Flowise desta organização"
    },
    {
        "key": "GAMMA_API_KEY",
        "name": "Gamma API Key",
        "description": "Chave da API Gamma para criação de apresentações"
    }
]


class OrgCredentialUpdate(BaseModel):
    value: str


class OrgCredentialResponse(BaseModel):
    key: str
    name: str
    description: str
    is_configured: bool
    masked_value: str
    is_active: bool
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


def require_org_admin(current_user: User = Depends(get_current_user)) -> User:
    """Requer que o usuário seja admin da organização ou super admin."""
    if current_user.is_super_admin:
        return current_user
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores"
        )
    return current_user


@router.get("/org/credentials/predefined")
def list_org_predefined_apis(
    current_user: User = Depends(require_org_admin)
):
    """Lista as APIs predefinidas disponíveis para configuração por organização."""
    return {"apis": ORG_PREDEFINED_APIS}


@router.get("/org/credentials", response_model=List[OrgCredentialResponse])
def list_org_credentials(
    organization_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin)
):
    """Lista credenciais da organização do usuário ou de uma org específica (super admin)."""
    if organization_id and current_user.is_super_admin:
        org_id = uuid.UUID(organization_id)
    elif current_user.organization_id:
        org_id = current_user.organization_id
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não pertence a nenhuma organização"
        )
    
    db_credentials = {c.key: c for c in db.query(OrgCredential).filter(
        OrgCredential.organization_id == org_id
    ).all()}
    
    result = []
    for api in ORG_PREDEFINED_APIS:
        key = api["key"]
        cred = db_credentials.get(key)
        
        result.append(OrgCredentialResponse(
            key=key,
            name=api["name"],
            description=api["description"],
            is_configured=cred.is_configured if cred else False,
            masked_value=cred.masked_value if cred else "",
            is_active=cred.is_active if cred else True,
            updated_at=cred.updated_at if cred else None
        ))
    
    return result


def validate_flowise_url(url: str) -> bool:
    """
    Valida formato de URL do Flowise.
    Aceita padrões:
    - https://cloud.flowiseai.com/api/v1/prediction/{flow_id}
    - https://custom-domain.com/api/v1/prediction/{flow_id}
    """
    pattern = r'^https?://[^\s/$.?#][^\s]*/api/v1/prediction/[a-f0-9\-]{36}$'
    if re.match(pattern, url, re.IGNORECASE):
        return True
    basic_pattern = r'^https?://[^\s/$.?#][^\s]*$'
    return bool(re.match(basic_pattern, url))


@router.put("/org/credentials/{key}", response_model=OrgCredentialResponse)
def update_org_credential(
    key: str,
    data: OrgCredentialUpdate,
    organization_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin)
):
    """Atualiza ou cria uma credencial para a organização."""
    predefined = next((a for a in ORG_PREDEFINED_APIS if a["key"] == key), None)
    if not predefined:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credencial não disponível para configuração por organização"
        )
    
    if not data.value or not data.value.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O valor da credencial não pode estar vazio"
        )
    
    if key == "FLOWISE_API_URL" and not validate_flowise_url(data.value.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL inválida. Use o formato: https://exemplo.com/api/v1/prediction/id"
        )
    
    if organization_id and current_user.is_super_admin:
        org_id = uuid.UUID(organization_id)
    elif current_user.organization_id:
        org_id = current_user.organization_id
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não pertence a nenhuma organização"
        )
    
    existing = db.query(OrgCredential).filter(
        OrgCredential.organization_id == org_id,
        OrgCredential.key == key
    ).first()
    
    if existing:
        existing.value = data.value
        existing.updated_at = datetime.utcnow()
        credential = existing
    else:
        credential = OrgCredential(
            id=uuid.uuid4(),
            organization_id=org_id,
            key=key,
            is_active=True
        )
        credential.value = data.value
        db.add(credential)
    
    db.commit()
    db.refresh(credential)
    
    return OrgCredentialResponse(
        key=credential.key,
        name=predefined["name"],
        description=predefined["description"],
        is_configured=credential.is_configured,
        masked_value=credential.masked_value,
        is_active=credential.is_active,
        updated_at=credential.updated_at
    )


@router.delete("/org/credentials/{key}")
def delete_org_credential(
    key: str,
    organization_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin)
):
    """Remove uma credencial da organização."""
    if organization_id and current_user.is_super_admin:
        org_id = uuid.UUID(organization_id)
    elif current_user.organization_id:
        org_id = current_user.organization_id
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário não pertence a nenhuma organização"
        )
    
    credential = db.query(OrgCredential).filter(
        OrgCredential.organization_id == org_id,
        OrgCredential.key == key
    ).first()
    
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Credencial não encontrada"
        )
    
    db.delete(credential)
    db.commit()
    
    return {"message": "Credencial removida com sucesso"}


def get_org_credential(key: str, organization_id: uuid.UUID, db: Session) -> Optional[str]:
    """
    Obtém o valor de uma credencial da organização.
    Retorna None se não encontrada ou não configurada.
    """
    credential = db.query(OrgCredential).filter(
        OrgCredential.organization_id == organization_id,
        OrgCredential.key == key,
        OrgCredential.is_active == True
    ).first()
    
    if credential and credential.is_configured:
        return credential.value
    
    return None


@router.get("/admin/orgs/{org_id}/credentials", response_model=List[OrgCredentialResponse])
def list_org_credentials_admin(
    org_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    """Super admin: lista credenciais de uma organização específica."""
    org_uuid = uuid.UUID(org_id)
    
    org = db.query(Organization).filter(Organization.id == org_uuid).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organização não encontrada"
        )
    
    db_credentials = {c.key: c for c in db.query(OrgCredential).filter(
        OrgCredential.organization_id == org_uuid
    ).all()}
    
    result = []
    for api in ORG_PREDEFINED_APIS:
        key = api["key"]
        cred = db_credentials.get(key)
        
        result.append(OrgCredentialResponse(
            key=key,
            name=api["name"],
            description=api["description"],
            is_configured=cred.is_configured if cred else False,
            masked_value=cred.masked_value if cred else "",
            is_active=cred.is_active if cred else True,
            updated_at=cred.updated_at if cred else None
        ))
    
    return result


@router.put("/admin/orgs/{org_id}/credentials/{key}", response_model=OrgCredentialResponse)
def update_org_credential_admin(
    org_id: str,
    key: str,
    data: OrgCredentialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    """Super admin: atualiza credencial de uma organização específica."""
    predefined = next((a for a in ORG_PREDEFINED_APIS if a["key"] == key), None)
    if not predefined:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credencial não disponível para configuração por organização"
        )
    
    if not data.value or not data.value.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O valor da credencial não pode estar vazio"
        )
    
    if key == "FLOWISE_API_URL" and not validate_flowise_url(data.value.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL inválida. Use o formato: https://exemplo.com/api/v1/prediction/id"
        )
    
    org_uuid = uuid.UUID(org_id)
    
    org = db.query(Organization).filter(Organization.id == org_uuid).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organização não encontrada"
        )
    
    existing = db.query(OrgCredential).filter(
        OrgCredential.organization_id == org_uuid,
        OrgCredential.key == key
    ).first()
    
    if existing:
        existing.value = data.value
        existing.updated_at = datetime.utcnow()
        credential = existing
    else:
        credential = OrgCredential(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            key=key,
            is_active=True
        )
        credential.value = data.value
        db.add(credential)
    
    db.commit()
    db.refresh(credential)
    
    return OrgCredentialResponse(
        key=credential.key,
        name=predefined["name"],
        description=predefined["description"],
        is_configured=credential.is_configured,
        masked_value=credential.masked_value,
        is_active=credential.is_active,
        updated_at=credential.updated_at
    )
