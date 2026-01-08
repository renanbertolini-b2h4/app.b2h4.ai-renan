"""
Rotas FastAPI para Análise Profunda (Deep Analysis)
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
import asyncio
import json
import logging

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.services.auth_service import AuthService
from app.models.user import User
from app.models.pii import PIIProcessingJob
from app.models.deep_analysis import (
    DeepAnalysisJob,
    DeepAnalysisChunkResult,
    DeepAnalysisJobResponse,
    DeepAnalysisChunkResponse,
    CreateDeepAnalysisRequest,
    DeepAnalysisProgressResponse,
    DeepAnalysisTypesResponse,
    ANALYSIS_TYPE_INFO
)
from app.services.deep_analysis_service import DeepAnalysisService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/deep-analysis", tags=["deep-analysis"])


def require_deep_analysis_access(current_user: User = Depends(get_current_user)) -> User:
    """Verifica se o usuário tem acesso ao módulo de análise profunda"""
    effective = current_user.get_effective_features()
    if not effective.get("deepAnalysisAccess", False) and not effective.get("piiAccess", False):
        raise HTTPException(
            status_code=403,
            detail="Acesso negado. Você não tem permissão para usar o módulo de Análise Profunda."
        )
    return current_user


def user_can_access_job(job: DeepAnalysisJob, current_user: User) -> bool:
    """Verifica se o usuário pode acessar o job"""
    if current_user.is_super_admin:
        return True
    if job.created_by == current_user.id:
        return True
    if job.organization_id == current_user.organization_id:
        return True
    return False


@router.get("/types", response_model=DeepAnalysisTypesResponse)
async def get_analysis_types():
    """Retorna os tipos de análise disponíveis"""
    types = [
        {
            "id": type_id,
            "label": info["label"],
            "icon": info["icon"],
            "description": info["description"],
            "estimated_time": info["estimated_time"]
        }
        for type_id, info in ANALYSIS_TYPE_INFO.items()
    ]
    
    detail_levels = [
        {"id": "resumido", "label": "Resumido", "description": "Análise concisa focando nos pontos principais"},
        {"id": "normal", "label": "Normal", "description": "Análise equilibrada com bom nível de detalhe"},
        {"id": "detalhado", "label": "Detalhado", "description": "Análise completa com máximo de informações"}
    ]
    
    return DeepAnalysisTypesResponse(types=types, detail_levels=detail_levels)


@router.get("/pii-jobs")
async def list_available_pii_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_deep_analysis_access)
):
    """Lista jobs PII disponíveis para análise profunda"""
    jobs = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.organization_id == current_user.organization_id,
        PIIProcessingJob.status == "completed",
        PIIProcessingJob.masked_chat_text.isnot(None)
    ).order_by(PIIProcessingJob.created_at.desc()).limit(50).all()
    
    return [
        {
            "id": str(job.id),
            "filename": job.original_filename,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "text_length": len(job.masked_chat_text) if job.masked_chat_text else 0,
            "pseudonymization_mode": job.pseudonymization_mode
        }
        for job in jobs
    ]


@router.post("/jobs", response_model=DeepAnalysisJobResponse)
async def create_deep_analysis_job(
    request: CreateDeepAnalysisRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_deep_analysis_access)
):
    """Cria um novo job de análise profunda"""
    
    pii_job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == request.pii_job_id
    ).first()
    
    if not pii_job:
        raise HTTPException(status_code=404, detail="Job PII não encontrado")
    
    if pii_job.organization_id != current_user.organization_id and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Acesso negado ao job PII")
    
    service = DeepAnalysisService(db)
    
    try:
        job = service.create_job(
            pii_job_id=request.pii_job_id,
            analysis_type=request.analysis_type,
            detail_level=request.detail_level,
            model=request.model,
            user_id=current_user.id,
            organization_id=current_user.organization_id
        )
        
        type_info = ANALYSIS_TYPE_INFO.get(job.analysis_type, {})
        
        return DeepAnalysisJobResponse(
            id=job.id,
            organization_id=job.organization_id,
            pii_job_id=job.pii_job_id,
            pii_job_filename=pii_job.original_filename,
            analysis_type=job.analysis_type,
            analysis_type_label=type_info.get("label", job.analysis_type),
            status=job.status,
            detail_level=job.detail_level,
            model_used=job.model_used,
            total_chunks=job.total_chunks,
            processed_chunks=job.processed_chunks,
            current_step=job.current_step,
            total_tokens_used=job.total_tokens_used or 0,
            created_at=job.created_at.isoformat() if job.created_at else "",
            progress_percent=0
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/jobs/{job_id}/start")
async def start_deep_analysis(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_deep_analysis_access)
):
    """Inicia o processamento de um job"""
    
    job = db.query(DeepAnalysisJob).filter(DeepAnalysisJob.id == job_id).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    if job.status not in ["pending", "failed"]:
        raise HTTPException(status_code=400, detail=f"Job não pode ser iniciado (status: {job.status})")
    
    return {"message": "Use o endpoint /stream para iniciar e acompanhar o processamento"}


@router.get("/jobs/{job_id}/stream")
async def stream_deep_analysis(
    job_id: UUID,
    token: Optional[str] = Query(None, description="JWT token for SSE authentication"),
    db: Session = Depends(get_db)
):
    """Stream de progresso do processamento via SSE"""
    
    if not token:
        raise HTTPException(status_code=401, detail="Token de autenticação requerido")
    
    token_data = AuthService.verify_token(token)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=401, detail="Token inválido")
    
    current_user = db.query(User).filter(User.id == token_data.user_id).first()
    if not current_user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    
    effective = current_user.get_effective_features()
    if not effective.get("deepAnalysisAccess", False) and not effective.get("piiAccess", False):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    job = db.query(DeepAnalysisJob).filter(DeepAnalysisJob.id == job_id).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    async def event_generator():
        service = DeepAnalysisService(db)
        
        try:
            async for event in service.process_job(job_id):
                yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(0.1)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/jobs/{job_id}", response_model=DeepAnalysisJobResponse)
async def get_deep_analysis_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_deep_analysis_access)
):
    """Retorna detalhes de um job"""
    
    job = db.query(DeepAnalysisJob).filter(DeepAnalysisJob.id == job_id).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    pii_job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == job.pii_job_id
    ).first()
    
    type_info = ANALYSIS_TYPE_INFO.get(job.analysis_type, {})
    
    progress = 0
    if job.total_chunks > 0:
        progress = (job.processed_chunks / job.total_chunks) * 100
    if job.status == "completed":
        progress = 100
    
    return DeepAnalysisJobResponse(
        id=job.id,
        organization_id=job.organization_id,
        pii_job_id=job.pii_job_id,
        pii_job_filename=pii_job.original_filename if pii_job else None,
        analysis_type=job.analysis_type,
        analysis_type_label=type_info.get("label", job.analysis_type),
        status=job.status,
        detail_level=job.detail_level,
        model_used=job.model_used,
        total_chunks=job.total_chunks,
        processed_chunks=job.processed_chunks,
        current_step=job.current_step,
        error_message=job.error_message,
        final_result=job.final_result,
        final_result_json=job.final_result_json,
        total_tokens_used=job.total_tokens_used or 0,
        processing_time_seconds=job.processing_time_seconds,
        created_at=job.created_at.isoformat() if job.created_at else "",
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        progress_percent=progress
    )


@router.get("/jobs/{job_id}/progress", response_model=DeepAnalysisProgressResponse)
async def get_job_progress(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_deep_analysis_access)
):
    """Retorna o progresso atual do job"""
    
    job = db.query(DeepAnalysisJob).filter(DeepAnalysisJob.id == job_id).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    chunks = db.query(DeepAnalysisChunkResult).filter(
        DeepAnalysisChunkResult.job_id == job_id
    ).order_by(DeepAnalysisChunkResult.chunk_index).all()
    
    progress = 0
    if job.total_chunks > 0:
        progress = (job.processed_chunks / job.total_chunks) * 100
    if job.status == "completed":
        progress = 100
    
    return DeepAnalysisProgressResponse(
        job_id=job.id,
        status=job.status,
        progress_percent=progress,
        current_step=job.current_step,
        processed_chunks=job.processed_chunks,
        total_chunks=job.total_chunks,
        chunks=[
            {
                "index": c.chunk_index,
                "status": c.status,
                "processing_time_ms": c.processing_time_ms
            }
            for c in chunks
        ],
        error_message=job.error_message
    )


@router.get("/jobs/{job_id}/result")
async def get_job_result(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_deep_analysis_access)
):
    """Retorna o resultado final do job"""
    
    job = db.query(DeepAnalysisJob).filter(DeepAnalysisJob.id == job_id).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="Job ainda não foi concluído")
    
    pii_job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == job.pii_job_id
    ).first()
    
    can_deanonymize = False
    if pii_job and pii_job.pseudonymization_mode in ["tags", "faker"]:
        from app.models.pii import PIIVault
        vault = db.query(PIIVault).filter(PIIVault.job_id == pii_job.id).first()
        can_deanonymize = vault is not None and vault.deanonymizer_mapping is not None
    
    return {
        "job_id": str(job.id),
        "analysis_type": job.analysis_type,
        "result": job.final_result,
        "processing_time_seconds": job.processing_time_seconds,
        "can_deanonymize": can_deanonymize,
        "pseudonymization_mode": pii_job.pseudonymization_mode if pii_job else None
    }


@router.post("/jobs/{job_id}/deanonymize")
async def deanonymize_result(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_deep_analysis_access)
):
    """Re-hidrata o resultado usando o vault do job PII"""
    
    job = db.query(DeepAnalysisJob).filter(DeepAnalysisJob.id == job_id).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="Job ainda não foi concluído")
    
    service = DeepAnalysisService(db)
    
    try:
        deanonymized = await service.deanonymize_result(job_id)
        return {"result": deanonymized}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/jobs", response_model=List[DeepAnalysisJobResponse])
async def list_deep_analysis_jobs(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_deep_analysis_access)
):
    """Lista jobs de análise profunda do usuário"""
    
    service = DeepAnalysisService(db)
    jobs = service.list_jobs(current_user.organization_id, limit)
    
    result = []
    for job in jobs:
        pii_job = db.query(PIIProcessingJob).filter(
            PIIProcessingJob.id == job.pii_job_id
        ).first()
        
        type_info = ANALYSIS_TYPE_INFO.get(job.analysis_type, {})
        
        progress = 0
        if job.total_chunks > 0:
            progress = (job.processed_chunks / job.total_chunks) * 100
        if job.status == "completed":
            progress = 100
        
        result.append(DeepAnalysisJobResponse(
            id=job.id,
            organization_id=job.organization_id,
            pii_job_id=job.pii_job_id,
            pii_job_filename=pii_job.original_filename if pii_job else None,
            analysis_type=job.analysis_type,
            analysis_type_label=type_info.get("label", job.analysis_type),
            status=job.status,
            detail_level=job.detail_level,
            model_used=job.model_used,
            total_chunks=job.total_chunks,
            processed_chunks=job.processed_chunks,
            current_step=job.current_step,
            error_message=job.error_message,
            total_tokens_used=job.total_tokens_used or 0,
            processing_time_seconds=job.processing_time_seconds,
            created_at=job.created_at.isoformat() if job.created_at else "",
            started_at=job.started_at.isoformat() if job.started_at else None,
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
            progress_percent=progress
        ))
    
    return result
