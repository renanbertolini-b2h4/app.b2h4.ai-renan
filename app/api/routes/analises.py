from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import logging
from typing import List
from uuid import UUID
from datetime import datetime

from app.schemas.analise import AnaliseRequest, AnaliseCreate, AnaliseResponse, AnaliseStatus
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.analise import Analise
from app.models.org_credential import OrgCredential
from app.core.database import get_db
from app.tasks.flowwise_tasks import dispatch_analise
from app.services.config_service import ConfigService
from app.services.health_service import HealthCheckService
from app.services.document_export_service import DocumentExportService

logger = logging.getLogger(__name__)

router = APIRouter()


def require_flowise_access(current_user: User = Depends(get_current_user)) -> User:
    """Verifica se o usuário tem acesso ao Flowise"""
    effective = current_user.get_effective_features()
    if not effective.get("flowiseAccess", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Você não tem permissão para acessar o Flowise. Entre em contato com o administrador."
        )
    return current_user

def get_flowwise_api_url():
    """Lê a URL da API Flowwise dinamicamente do banco de dados (global)"""
    config = ConfigService.get_flowwise_config()
    return config.get("flowise_url", "")

def has_flowwise_configured(organization_id, db: Session) -> bool:
    """
    Verifica se existe configuração Flowise completa (org ou global).
    Requer tanto URL quanto API key para considerar como configurado.
    """
    if organization_id:
        org_url = db.query(OrgCredential).filter(
            OrgCredential.organization_id == organization_id,
            OrgCredential.key == "FLOWISE_API_URL",
            OrgCredential.is_active == True
        ).first()
        
        org_key = db.query(OrgCredential).filter(
            OrgCredential.organization_id == organization_id,
            OrgCredential.key == "FLOWISE_API_KEY",
            OrgCredential.is_active == True
        ).first()
        
        if org_url and org_url.is_configured and org_key and org_key.is_configured:
            return True
    
    config = ConfigService.get_flowwise_config()
    global_url = (config.get("flowise_url", "") or "").strip()
    global_key = (config.get("flowise_key", "") or "").strip()
    return bool(global_url) and bool(global_key)


@router.post("/analises", response_model=AnaliseResponse)
async def criar_analise(
    request: AnaliseRequest,
    current_user: User = Depends(require_flowise_access),
    db: Session = Depends(get_db)
):
    """
    Cria uma nova análise política e a processa de forma assíncrona com Celery.
    Retorna imediatamente com status 'pendente'.
    """
    if not has_flowwise_configured(current_user.organization_id, db):
        raise HTTPException(
            status_code=400,
            detail="API Flowwise não configurada. Por favor, configure a URL do Flowwise na página de Configurações."
        )
    
    # Verificar saúde dos serviços antes de criar análise
    health_status = await HealthCheckService.check_all()
    
    if not health_status["analysis_available"]:
        flowwise_status = health_status["services"]["flowwise"]["status"]
        if flowwise_status == "not_configured":
            raise HTTPException(
                status_code=400,
                detail="Flowwise não configurado. Configure em Configurações para habilitar análises."
            )
        else:
            raise HTTPException(
                status_code=503,
                detail="Flowwise indisponível no momento. Tente novamente mais tarde."
            )
    
    logger.info(
        "Análise solicitada",
        extra={
            "user_id": str(current_user.id),
            "organization_id": str(current_user.organization_id) if current_user.organization_id else None,
            "politico": request.politico,
            "lei": request.lei
        }
    )
    
    try:
        # Criar registro da análise no banco
        analise = Analise(
            user_id=current_user.id,
            organization_id=current_user.organization_id,
            politico=request.politico,
            lei=request.lei,
            status="pendente"
        )
        
        db.add(analise)
        db.commit()
        db.refresh(analise)
        
        logger.info(f"✅ Análise criada: {analise.id}")
        
        # Disparar tarefa (async com Celery se disponível, ou sync)
        dispatch_result = dispatch_analise(str(analise.id), async_mode=True)
        
        # Salvar ID da tarefa Celery se disponível
        if dispatch_result.get("task_id"):
            analise.celery_task_id = dispatch_result["task_id"]
            db.commit()
            logger.info(f"✅ Tarefa Celery disparada: {dispatch_result['task_id']}")
        else:
            logger.info(f"✅ Análise executada em modo síncrono")
            db.refresh(analise)
        
        # Retornar resposta
        return AnaliseResponse.from_orm(analise)
    
    except Exception as e:
        logger.error(f"❌ Erro ao criar análise: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao criar análise: {str(e)}")


@router.get("/analises/{analise_id}", response_model=AnaliseResponse)
async def obter_analise(
    analise_id: UUID,
    current_user: User = Depends(require_flowise_access),
    db: Session = Depends(get_db)
):
    """
    Obtém uma análise específica pelo ID.
    """
    analise = db.query(Analise).filter(
        Analise.id == analise_id,
        Analise.user_id == current_user.id
    ).first()
    
    if not analise:
        raise HTTPException(status_code=404, detail="Análise não encontrada")
    
    return AnaliseResponse.from_orm(analise)


@router.get("/analises/{analise_id}/status", response_model=AnaliseStatus)
async def obter_status_analise(
    analise_id: UUID,
    current_user: User = Depends(require_flowise_access),
    db: Session = Depends(get_db)
):
    """
    Obtém apenas o status de uma análise (para polling).
    """
    analise = db.query(Analise).filter(
        Analise.id == analise_id,
        Analise.user_id == current_user.id
    ).first()
    
    if not analise:
        raise HTTPException(status_code=404, detail="Análise não encontrada")
    
    return AnaliseStatus.from_orm(analise)


@router.get("/analises", response_model=List[AnaliseResponse])
async def listar_analises(
    current_user: User = Depends(require_flowise_access),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """
    Lista todas as análises do usuário atual.
    """
    analises = db.query(Analise).filter(
        Analise.user_id == current_user.id
    ).order_by(Analise.created_at.desc()).offset(skip).limit(limit).all()
    
    return [AnaliseResponse.from_orm(a) for a in analises]


@router.get("/analises/{analise_id}/export/{format}")
async def exportar_analise(
    analise_id: UUID,
    format: str,
    current_user: User = Depends(require_flowise_access),
    db: Session = Depends(get_db)
):
    """
    Exporta uma análise em formato PDF, DOCX ou Markdown.
    
    Args:
        analise_id: ID da análise
        format: Formato de exportação (pdf, docx, md)
    
    Returns:
        Arquivo para download no formato solicitado
    """
    # Validar formato
    valid_formats = ['pdf', 'docx', 'md']
    format_lower = format.lower()
    
    if format_lower not in valid_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Formato inválido. Use um dos seguintes: {', '.join(valid_formats)}"
        )
    
    # Buscar análise
    analise = db.query(Analise).filter(
        Analise.id == analise_id,
        Analise.user_id == current_user.id
    ).first()
    
    if not analise:
        raise HTTPException(status_code=404, detail="Análise não encontrada")
    
    if not analise.resultado:
        raise HTTPException(
            status_code=400,
            detail="Esta análise ainda não possui resultado disponível para exportação"
        )
    
    # Preparar metadados
    metadata = {
        'politico': analise.politico,
        'lei': analise.lei,
        'data': analise.created_at.strftime('%d/%m/%Y %H:%M:%S'),
        'tempo_execucao': f"{analise.execution_time:.2f}s" if analise.execution_time else "N/A"
    }
    
    # Gerar documento
    export_service = DocumentExportService()
    
    try:
        if format_lower == 'pdf':
            buffer = export_service.generate_pdf(
                content=analise.resultado,
                metadata=metadata
            )
            filename = f"analise_{analise.politico.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            media_type = "application/pdf"
            
        elif format_lower == 'docx':
            buffer = export_service.generate_docx(
                content=analise.resultado,
                metadata=metadata
            )
            filename = f"analise_{analise.politico.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx"
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            
        else:  # md
            buffer = export_service.generate_markdown(
                content=analise.resultado,
                metadata=metadata
            )
            filename = f"analise_{analise.politico.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
            media_type = "text/markdown"
        
        logger.info(
            "Análise exportada com sucesso",
            extra={
                "analise_id": str(analise_id),
                "format": format_lower,
                "user_id": str(current_user.id)
            }
        )
        
        return StreamingResponse(
            buffer,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        logger.error(
            f"Erro ao exportar análise: {str(e)}",
            extra={"analise_id": str(analise_id), "format": format_lower}
        )
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao gerar documento {format_lower.upper()}: {str(e)}"
        )
