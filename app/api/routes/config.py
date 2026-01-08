from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.services.config_service import ConfigService
import os

router = APIRouter()

class FlowiseConfig(BaseModel):
    flowise_url: str
    flowise_key: str = ""


def require_flowise_access(current_user: User = Depends(get_current_user)) -> User:
    """Verifica se o usuário tem acesso ao Flowise"""
    effective = current_user.get_effective_features()
    if not effective.get("flowiseAccess", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Você não tem permissão para acessar o Flowise. Entre em contato com o administrador."
        )
    return current_user


@router.get("/flowwise")
async def get_flowwise_config(
    current_user: User = Depends(require_flowise_access),
    db: Session = Depends(get_db)
):
    return ConfigService.get_masked_flowwise_config()

@router.post("/flowwise")
async def save_flowise_config(
    config: FlowiseConfig,
    current_user: User = Depends(require_flowise_access),
    db: Session = Depends(get_db)
):
    try:
        if not config.flowise_url:
            raise HTTPException(status_code=400, detail="URL do Flowwise é obrigatória")
        
        # Salvar no banco de dados PostgreSQL
        ConfigService.save_flowwise_config(config.flowise_url, config.flowise_key)
        
        # Também atualizar variáveis de ambiente em runtime
        os.environ["FLOWWISE_API_URL"] = config.flowise_url
        if config.flowise_key:
            os.environ["FLOWWISE_API_KEY"] = config.flowise_key
        
        return {
            "success": True,
            "message": "Configuração salva com sucesso!"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
