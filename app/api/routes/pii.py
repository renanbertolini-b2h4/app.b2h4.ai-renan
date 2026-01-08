"""
Rotas FastAPI para PII Masking
Arquivo: app/api/routes/pii.py
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List
from uuid import UUID
import asyncio
import logging

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.pii import (
    PIIProcessingJob,
    PIIMessage,
    PIIAnalysis,
    PIIAnalysisChunk,
    PIIVault,
    PIIProcessingJobResponse,
    PIIMessageResponse,
    PIIAnalysisResponse,
    PIIAnalysisChunkResponse,
    AnalyzeWithLLMRequest,
    CreatePIIPatternRequest,
    ChatWithAnalysisRequest,
    ChatWithAnalysisResponse,
    ChatWithJobRequest,
    ChatWithJobResponse,
    PrivilegedViewRequest,
    AnalysisProgressResponse,
    ChunkProgressItem,
    ResumeAnalysisRequest,
    AnalyzeWithLLMConfigRequest,
    PseudonymizationMode,
)
from pydantic import BaseModel
from app.services.pii_service import PIIService
from app.services.llm_service import get_llm_service
from app.tasks.pii_tasks import create_chunks, process_pii_analysis_sync
import uuid as uuid_module

logger = logging.getLogger(__name__)

CHUNK_SIZE = 60000

router = APIRouter(prefix="/pii", tags=["pii"])


def require_pii_access(current_user: User = Depends(get_current_user)) -> User:
    effective = current_user.get_effective_features()
    if not effective.get("piiAccess", False):
        raise HTTPException(
            status_code=403,
            detail="Acesso negado. Você não tem permissão para usar o módulo PII."
        )
    return current_user


def user_can_access_job(job: PIIProcessingJob, current_user: User) -> bool:
    if job.created_by == current_user.id:
        return True
    if job.organization_id == current_user.organization_id:
        return True
    return False


@router.post("/process-chat", response_model=PIIProcessingJobResponse)
async def process_chat(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    try:
        if not file.filename.endswith('.txt'):
            raise HTTPException(
                status_code=400,
                detail="Arquivo deve ser .txt (exportado do WhatsApp)"
            )

        MAX_FILE_SIZE = 50 * 1024 * 1024
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail="Arquivo muito grande. Máximo: 50MB"
            )

        text_content = content.decode('utf-8')

        if not text_content.strip():
            raise HTTPException(
                status_code=400,
                detail="Arquivo vazio"
            )

        organization_id = current_user.organization_id
        if not organization_id:
            raise HTTPException(
                status_code=400,
                detail="Usuário não tem organização associada"
            )

        job, messages = PIIService.process_and_save_chat(
            content=text_content,
            filename=file.filename,
            db=db,
            current_user=current_user,
            organization_id=organization_id
        )

        return PIIProcessingJobResponse.model_validate(job)

    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Arquivo não é um texto válido UTF-8"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao processar chat: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao processar arquivo: {str(e)}"
        )


@router.get("/jobs", response_model=List[PIIProcessingJobResponse])
async def get_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100)
):
    organization_id = current_user.organization_id
    if not organization_id:
        return []

    jobs = db.query(PIIProcessingJob).filter(
        and_(
            PIIProcessingJob.is_active == True,
            PIIProcessingJob.organization_id == organization_id
        )
    ).order_by(
        PIIProcessingJob.created_at.desc()
    ).offset(skip).limit(limit).all()

    return [PIIProcessingJobResponse.model_validate(job) for job in jobs]


@router.get("/jobs/{job_id}", response_model=PIIProcessingJobResponse)
async def get_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    return PIIProcessingJobResponse.model_validate(job)


@router.get("/jobs/{job_id}/messages", response_model=List[PIIMessageResponse])
async def get_job_messages(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500)
):
    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    messages = db.query(PIIMessage).filter(
        PIIMessage.job_id == job_id
    ).order_by(
        PIIMessage.created_at.asc()
    ).offset(skip).limit(limit).all()

    return [PIIMessageResponse.model_validate(msg) for msg in messages]


@router.post("/analyze-with-llm", response_model=PIIAnalysisResponse)
async def analyze_with_llm(
    request: AnalyzeWithLLMRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == request.job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    valid_tasks = ["sentiment", "summary", "topics", "intent", "quality", "action_items"]
    if request.task_type not in valid_tasks:
        raise HTTPException(
            status_code=400,
            detail=f"Task inválida. Opções: {', '.join(valid_tasks)}"
        )

    task_instructions = {
        "sentiment": "Analise o sentimento geral desta conversa do WhatsApp. Classifique como: positivo, negativo ou neutro. Justifique sua análise.",
        "summary": "Faça um resumo conciso desta conversa do WhatsApp em 3-5 linhas. Destaque os pontos principais.",
        "topics": "Identifique os 3-5 tópicos principais desta conversa do WhatsApp. Liste cada tópico com uma breve descrição.",
        "intent": "Classifique a intenção principal desta conversa do WhatsApp. Opções: informação, suporte, venda, social, urgente, outro. Justifique.",
        "quality": "Avalie a qualidade da comunicação nesta conversa do WhatsApp. Considere: clareza, profissionalismo, eficiência. Escala: 1-10.",
        "action_items": "Extraia todos os itens de ação (tarefas, compromissos, decisões) desta conversa. Liste cada item com responsável e prazo se mencionado."
    }

    task_instruction = task_instructions.get(request.task_type, request.custom_prompt or "")

    prompt = f"""{task_instruction}

Conversa:
{job.masked_chat_text}

Resposta:"""

    analysis = PIIAnalysis(
        id=uuid_module.uuid4(),
        job_id=job.id,
        organization_id=current_user.organization_id,
        created_by=current_user.id,
        task_type=request.task_type,
        prompt=prompt,
        llm_model=request.llm_model,
        status="pending"
    )

    db.add(analysis)
    db.commit()

    return PIIAnalysisResponse.model_validate(analysis)


@router.post("/analyze-with-llm-execute", response_model=PIIAnalysisResponse)
async def analyze_with_llm_execute(
    request: AnalyzeWithLLMRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == request.job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    valid_tasks = ["sentiment", "summary", "topics", "intent", "quality", "action_items"]
    if request.task_type not in valid_tasks:
        raise HTTPException(
            status_code=400,
            detail=f"Task inválida. Opções: {', '.join(valid_tasks)}"
        )

    llm_service = get_llm_service()
    available_models = llm_service.get_available_models()
    
    if not available_models:
        raise HTTPException(
            status_code=503,
            detail="Nenhum provedor de LLM configurado. Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY."
        )

    chat_text = job.masked_chat_text or ""
    needs_chunking = len(chat_text) > CHUNK_SIZE

    if needs_chunking:
        analysis = PIIAnalysis(
            id=uuid_module.uuid4(),
            job_id=job.id,
            organization_id=current_user.organization_id,
            created_by=current_user.id,
            task_type=request.task_type,
            prompt="Análise em chunks - ver chunks individuais",
            llm_model=request.llm_model or "gpt-4-turbo",
            status="processing",
            is_chunked=True
        )
        db.add(analysis)
        db.commit()
        
        try:
            from app.core.celery_app import celery_app
            if celery_app:
                from app.tasks.pii_tasks import process_pii_analysis_chunked
                process_pii_analysis_chunked.delay(str(analysis.id))
                
                return PIIAnalysisResponse.model_validate(analysis)
            else:
                result = process_pii_analysis_sync(str(analysis.id), db)
                db.refresh(analysis)
                return PIIAnalysisResponse.model_validate(analysis)
        except Exception as e:
            logger.error(f"Erro ao processar chunks: {str(e)}")
            result = process_pii_analysis_sync(str(analysis.id), db)
            db.refresh(analysis)
            return PIIAnalysisResponse.model_validate(analysis)
    else:
        task_instructions = {
            "sentiment": "Analise o sentimento geral desta conversa do WhatsApp. Classifique como: positivo, negativo ou neutro. Justifique sua análise.",
            "summary": "Faça um resumo conciso desta conversa do WhatsApp em 3-5 linhas. Destaque os pontos principais.",
            "topics": "Identifique os 3-5 tópicos principais desta conversa do WhatsApp. Liste cada tópico com uma breve descrição.",
            "intent": "Classifique a intenção principal desta conversa do WhatsApp. Opções: informação, suporte, venda, social, urgente, outro. Justifique.",
            "quality": "Avalie a qualidade da comunicação nesta conversa do WhatsApp. Considere: clareza, profissionalismo, eficiência. Escala: 1-10.",
            "action_items": "Extraia todos os itens de ação (tarefas, compromissos, decisões) desta conversa. Liste cada item com responsável e prazo se mencionado."
        }

        task_instruction = task_instructions.get(request.task_type, request.custom_prompt or "")

        prompt = f"""{task_instruction}

Conversa:
{chat_text}

Resposta:"""

        analysis = PIIAnalysis(
            id=uuid_module.uuid4(),
            job_id=job.id,
            organization_id=current_user.organization_id,
            created_by=current_user.id,
            task_type=request.task_type,
            prompt=prompt,
            llm_model=request.llm_model or "gpt-4-turbo",
            status="processing"
        )

        db.add(analysis)
        db.commit()

        try:
            model = request.llm_model or "gpt-4-turbo"

            try:
                llm_response = await asyncio.wait_for(
                    llm_service.analyze(
                        prompt=prompt,
                        model=model,
                        temperature=0.7,
                        max_tokens=2000
                    ),
                    timeout=60.0
                )
            except asyncio.TimeoutError:
                analysis.status = "timeout"
                analysis.llm_response = "Timeout: LLM não respondeu em 60 segundos"
                db.commit()
                raise HTTPException(
                    status_code=504,
                    detail="Timeout ao chamar LLM. Tente novamente."
                )

            analysis.llm_response = llm_response
            analysis.status = "completed"
            db.commit()

            return PIIAnalysisResponse.model_validate(analysis)

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Erro ao chamar LLM: {str(e)}")
            analysis.status = "failed"
            analysis.llm_response = f"Erro: {str(e)}"
            db.commit()
            raise HTTPException(
                status_code=500,
                detail=f"Erro ao processar com LLM: {str(e)}"
            )


@router.get("/analyses/{analysis_id}", response_model=PIIAnalysisResponse)
async def get_analysis(
    analysis_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    analysis = db.query(PIIAnalysis).filter(
        PIIAnalysis.id == analysis_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == analysis.job_id
    ).first()

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    return PIIAnalysisResponse.model_validate(analysis)


@router.get("/analyses/{analysis_id}/chunks", response_model=List[PIIAnalysisChunkResponse])
async def get_analysis_chunks(
    analysis_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """Retorna os chunks de uma análise em processamento."""
    analysis = db.query(PIIAnalysis).filter(
        PIIAnalysis.id == analysis_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == analysis.job_id
    ).first()

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    chunks = db.query(PIIAnalysisChunk).filter(
        PIIAnalysisChunk.analysis_id == analysis_id
    ).order_by(PIIAnalysisChunk.chunk_index).all()

    return [PIIAnalysisChunkResponse.model_validate(c) for c in chunks]


@router.get("/analyses/{analysis_id}/prompts")
async def get_analysis_prompts(
    analysis_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """Retorna os prompts enviados ao LLM para cada chunk da análise."""
    analysis = db.query(PIIAnalysis).filter(
        PIIAnalysis.id == analysis_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == analysis.job_id
    ).first()

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    chunks = db.query(PIIAnalysisChunk).filter(
        PIIAnalysisChunk.analysis_id == analysis_id
    ).order_by(PIIAnalysisChunk.chunk_index).all()

    prompts = []
    for chunk in chunks:
        prompts.append({
            "chunk_index": int(chunk.chunk_index),
            "total_chunks": int(chunk.total_chunks),
            "prompt": chunk.prompt or "",
            "status": chunk.status
        })

    full_prompt_text = ""
    for p in prompts:
        full_prompt_text += f"{'='*80}\n"
        full_prompt_text += f"CHUNK {p['chunk_index']+1} de {p['total_chunks']} (Status: {p['status']})\n"
        full_prompt_text += f"{'='*80}\n\n"
        full_prompt_text += p['prompt'] + "\n\n"

    return {
        "analysis_id": str(analysis_id),
        "task_type": analysis.task_type,
        "model": analysis.model,
        "total_chunks": len(chunks),
        "chunks": prompts,
        "full_prompt_text": full_prompt_text
    }


@router.get("/analyses/{analysis_id}/progress", response_model=dict)
async def get_analysis_progress(
    analysis_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """Retorna o progresso de uma análise em chunks."""
    analysis = db.query(PIIAnalysis).filter(
        PIIAnalysis.id == analysis_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == analysis.job_id
    ).first()

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    total_chunks = int(analysis.total_chunks or "0")
    completed_chunks = int(analysis.completed_chunks or "0")
    
    progress = 0
    if total_chunks > 0:
        progress = int((completed_chunks / total_chunks) * 100)

    return {
        "analysis_id": str(analysis.id),
        "status": analysis.status,
        "is_chunked": analysis.is_chunked or False,
        "total_chunks": total_chunks,
        "completed_chunks": completed_chunks,
        "progress_percent": progress,
        "llm_response": analysis.llm_response if analysis.status == "completed" else None
    }


@router.post("/patterns", response_model=dict)
async def create_pattern(
    request: CreatePIIPatternRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    organization_id = current_user.organization_id
    if not organization_id:
        raise HTTPException(status_code=400, detail="Usuário não tem organização")

    try:
        import re
        re.compile(request.regex)
    except re.error as e:
        raise HTTPException(
            status_code=400,
            detail=f"Regex inválido: {str(e)}"
        )

    pattern = PIIService.create_custom_pattern(
        db=db,
        organization_id=organization_id,
        name=request.name,
        regex=request.regex,
        pii_type=request.pii_type,
        masking_strategy=request.masking_strategy,
        description=request.description
    )

    return {
        "id": str(pattern.id),
        "name": pattern.name,
        "pii_type": pattern.pii_type,
        "masking_strategy": pattern.masking_strategy,
        "message": "Padrão criado com sucesso"
    }


@router.get("/patterns", response_model=List[dict])
async def get_patterns(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    organization_id = current_user.organization_id
    if not organization_id:
        return []

    patterns = PIIService.get_organization_patterns(db, organization_id)
    return patterns


@router.put("/patterns/{pattern_id}", response_model=dict)
async def update_pattern(
    pattern_id: UUID,
    request: CreatePIIPatternRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    from app.models.pii import PIIPattern
    
    organization_id = current_user.organization_id
    if not organization_id:
        raise HTTPException(status_code=400, detail="Usuário não tem organização")

    pattern = db.query(PIIPattern).filter(
        and_(
            PIIPattern.id == pattern_id,
            PIIPattern.organization_id == organization_id
        )
    ).first()

    if not pattern:
        raise HTTPException(status_code=404, detail="Padrão não encontrado")

    try:
        import re
        re.compile(request.regex)
    except re.error as e:
        raise HTTPException(
            status_code=400,
            detail=f"Regex inválido: {str(e)}"
        )

    pattern.name = request.name
    pattern.regex = request.regex
    pattern.pii_type = request.pii_type
    pattern.masking_strategy = request.masking_strategy
    pattern.description = request.description

    db.commit()

    return {
        "id": str(pattern.id),
        "name": pattern.name,
        "pii_type": pattern.pii_type,
        "masking_strategy": pattern.masking_strategy,
        "message": "Padrão atualizado com sucesso"
    }


@router.delete("/patterns/{pattern_id}", response_model=dict)
async def delete_pattern(
    pattern_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    from app.models.pii import PIIPattern
    
    organization_id = current_user.organization_id
    if not organization_id:
        raise HTTPException(status_code=400, detail="Usuário não tem organização")

    pattern = db.query(PIIPattern).filter(
        and_(
            PIIPattern.id == pattern_id,
            PIIPattern.organization_id == organization_id
        )
    ).first()

    if not pattern:
        raise HTTPException(status_code=404, detail="Padrão não encontrado")

    db.delete(pattern)
    db.commit()

    return {"message": "Padrão excluído com sucesso", "id": str(pattern_id)}


@router.get("/models", response_model=dict)
async def get_available_models(
    current_user: User = Depends(require_pii_access)
):
    llm_service = get_llm_service()
    return llm_service.get_available_models()


@router.get("/info", response_model=dict)
async def get_info(
    current_user: User = Depends(require_pii_access)
):
    return {
        "module": "PII Masking",
        "version": "1.0.0",
        "supported_tasks": [
            "sentiment",
            "summary",
            "topics",
            "intent",
            "quality",
            "action_items"
        ],
        "supported_pii_types": [
            "document",
            "contact",
            "financial",
            "online",
            "personal"
        ],
        "masking_strategies": [
            "redaction",
            "hash",
            "substitution"
        ]
    }


@router.post("/chat", response_model=ChatWithAnalysisResponse)
async def chat_with_analysis(
    request: ChatWithAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """
    Permite fazer perguntas sobre uma análise já realizada.
    O LLM responde com base no contexto da conversa mascarada e análises anteriores.
    """
    analysis = db.query(PIIAnalysis).filter(
        PIIAnalysis.id == request.analysis_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == analysis.job_id
    ).first()

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    if analysis.status != "completed":
        raise HTTPException(
            status_code=400,
            detail="A análise ainda não foi concluída. Aguarde o processamento."
        )

    context_parts = []
    
    if request.include_context and job.masked_chat_text:
        chat_preview = job.masked_chat_text[:30000] if len(job.masked_chat_text) > 30000 else job.masked_chat_text
        context_parts.append(f"## Conversa Analisada (mascarada):\n{chat_preview}")
    
    if analysis.llm_response:
        context_parts.append(f"## Análise Anterior ({analysis.task_type}):\n{analysis.llm_response}")
    
    context = "\n\n".join(context_parts)
    
    prompt = f"""Você é um assistente que ajuda a analisar conversas do WhatsApp.
Use o contexto abaixo para responder à pergunta do usuário de forma precisa e útil.

{context}

## Pergunta do Usuário:
{request.question}

## Resposta:
Responda de forma clara e objetiva, citando partes relevantes da conversa quando apropriado."""

    llm_service = get_llm_service()
    model = analysis.llm_model or "gpt-4-turbo"

    try:
        response = await asyncio.wait_for(
            llm_service.analyze(
                prompt=prompt,
                model=model,
                temperature=0.7,
                max_tokens=2000
            ),
            timeout=60.0
        )
        
        return ChatWithAnalysisResponse(
            answer=response,
            sources=[f"Análise {analysis.task_type}", "Conversa mascarada"],
            analysis_id=analysis.id
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Timeout ao processar pergunta. Tente novamente."
        )
    except Exception as e:
        logger.error(f"Erro no chat: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar: {str(e)}"
        )


@router.post("/chat-with-job", response_model=ChatWithJobResponse)
async def chat_with_job(
    request: ChatWithJobRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """
    Permite fazer perguntas diretamente sobre o chat completo pseudonimizado.
    Usa todos os chunks da conversa mascarada como contexto.
    """
    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == request.job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    if not job.masked_chat_text:
        raise HTTPException(
            status_code=400,
            detail="Este job não possui texto mascarado disponível."
        )

    context_parts = []
    sources = []
    
    masked_text = job.masked_chat_text
    text_length = len(masked_text)
    
    if text_length > 100000:
        chunk_size = 90000
        chunks = [masked_text[i:i+chunk_size] for i in range(0, len(masked_text), chunk_size)]
        context_parts.append(f"## Conversa Completa Pseudonimizada ({len(chunks)} partes, {text_length:,} caracteres):\n")
        for i, chunk in enumerate(chunks[:3], 1):
            context_parts.append(f"### Parte {i}/{len(chunks)}:\n{chunk}\n")
        if len(chunks) > 3:
            context_parts.append(f"\n[... {len(chunks) - 3} partes adicionais omitidas por limite de contexto ...]")
        sources.append(f"Conversa mascarada ({text_length:,} caracteres, primeiras 3 partes)")
    else:
        context_parts.append(f"## Conversa Completa Pseudonimizada ({text_length:,} caracteres):\n{masked_text}")
        sources.append(f"Conversa mascarada completa ({text_length:,} caracteres)")

    if request.include_analyses:
        analyses = db.query(PIIAnalysis).filter(
            PIIAnalysis.job_id == job.id,
            PIIAnalysis.status == "completed"
        ).all()
        
        for analysis in analyses:
            if analysis.llm_response:
                response_preview = analysis.llm_response[:5000] if len(analysis.llm_response) > 5000 else analysis.llm_response
                context_parts.append(f"\n## Análise Prévia ({analysis.task_type}):\n{response_preview}")
                sources.append(f"Análise {analysis.task_type}")

    context = "\n\n".join(context_parts)
    
    prompt = f"""Você é um assistente especializado em analisar conversas do WhatsApp que foram pseudonimizadas para proteção de dados pessoais.

Você tem acesso à conversa completa abaixo. Responda à pergunta do usuário de forma precisa, detalhada e útil.
Cite partes específicas da conversa quando relevante para fundamentar sua resposta.

{context}

## Pergunta do Usuário:
{request.question}

## Instruções:
1. Responda de forma clara, estruturada e em português
2. Cite trechos relevantes da conversa entre aspas quando apropriado
3. Se a pergunta não puder ser respondida com base no contexto, explique o motivo
4. Use markdown para formatar sua resposta (listas, negrito, etc.)

## Resposta:"""

    llm_service = get_llm_service()
    model = request.llm_model or "gpt-4-turbo"

    try:
        response = await asyncio.wait_for(
            llm_service.analyze(
                prompt=prompt,
                model=model,
                temperature=0.7,
                max_tokens=4000
            ),
            timeout=120.0
        )
        
        return ChatWithJobResponse(
            answer=response,
            sources=sources,
            job_id=job.id,
            tokens_used=None
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Timeout ao processar pergunta. A conversa pode ser muito longa. Tente uma pergunta mais específica."
        )
    except Exception as e:
        logger.error(f"Erro no chat com job: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar: {str(e)}"
        )


@router.post("/privileged-view", response_model=dict)
async def get_privileged_view(
    request: PrivilegedViewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """
    Visualização privilegiada dos dados originais (não mascarados).
    Requer justificativa e gera log de auditoria.
    Apenas Super Admins podem acessar.
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=403,
            detail="Acesso restrito a Super Admins. Esta funcionalidade requer privilégios elevados."
        )
    
    if not request.reason or len(request.reason) < 10:
        raise HTTPException(
            status_code=400,
            detail="Justificativa obrigatória (mínimo 10 caracteres)"
        )
    
    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == request.job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    logger.warning(
        f"AUDIT: Acesso privilegiado a dados PII - "
        f"User: {current_user.email} (ID: {current_user.id}) | "
        f"Job: {job.id} | "
        f"Reason: {request.reason}"
    )
    
    query = db.query(PIIMessage).filter(PIIMessage.job_id == job.id)
    
    if request.message_ids:
        query = query.filter(PIIMessage.id.in_(request.message_ids))
    
    from sqlalchemy import cast, Integer
    messages = query.order_by(cast(PIIMessage.message_index, Integer)).all()
    
    result = []
    for msg in messages:
        result.append({
            "id": str(msg.id),
            "timestamp": msg.timestamp,
            "sender": msg.sender,
            "original_content": msg.original_content,
            "masked_content": msg.masked_content,
            "pii_found": msg.pii_found,
            "has_pii": msg.has_pii,
            "message_index": msg.message_index
        })
    
    return {
        "job_id": str(job.id),
        "filename": job.original_filename,
        "total_messages": len(result),
        "accessed_by": current_user.email,
        "access_reason": request.reason,
        "messages": result,
        "warning": "DADOS SENSÍVEIS - Este acesso foi registrado para auditoria."
    }


@router.get("/jobs/{job_id}/metrics", response_model=dict)
async def get_job_metrics(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """
    Retorna métricas detalhadas de processamento de um job.
    """
    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    return {
        "job_id": str(job.id),
        "filename": job.original_filename,
        "processing_metrics": {
            "original_chars": int(job.original_chars or 0),
            "masked_chars": int(job.masked_chars or 0),
            "compression_ratio": float(job.compression_ratio or 0),
            "chunk_count": int(job.chunk_count or 0),
            "chunk_size": int(job.chunk_size or 60000),
            "chunk_overlap": int(job.chunk_overlap or 30000),
            "estimated_tokens": int(job.estimated_tokens or 0)
        },
        "pii_metrics": {
            "total_messages": int(job.total_messages or 0),
            "messages_with_pii": int(job.messages_with_pii or 0),
            "total_pii_found": int(job.total_pii_found or 0),
            "pii_types": job.pii_summary or {}
        },
        "status": job.status,
        "created_at": job.created_at.isoformat() if job.created_at else None
    }


@router.get("/jobs/{job_id}/analyses")
async def list_job_analyses(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """
    Lista todas as análises de um job.
    """
    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    analyses = db.query(PIIAnalysis).filter(
        PIIAnalysis.job_id == job_id
    ).order_by(PIIAnalysis.created_at.desc()).all()

    return [
        {
            "id": str(a.id),
            "job_id": str(a.job_id),
            "task_type": a.task_type,
            "llm_model": a.llm_model,
            "status": a.status,
            "llm_response": a.llm_response,
            "is_chunked": a.is_chunked,
            "total_chunks": a.total_chunks,
            "completed_chunks": a.completed_chunks,
            "failed_chunks": a.failed_chunks,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None
        }
        for a in analyses
    ]


@router.get("/analyses/{analysis_id}/progress", response_model=AnalysisProgressResponse)
async def get_analysis_progress(
    analysis_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """
    Retorna o progresso detalhado de uma análise em andamento.
    Ideal para polling do frontend.
    """
    from datetime import datetime
    
    analysis = db.query(PIIAnalysis).filter(
        PIIAnalysis.id == analysis_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == analysis.job_id
    ).first()

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    from sqlalchemy import cast, Integer
    chunks = db.query(PIIAnalysisChunk).filter(
        PIIAnalysisChunk.analysis_id == analysis.id
    ).order_by(cast(PIIAnalysisChunk.chunk_index, Integer)).all()

    total_chunks = max(len(chunks), 1)
    completed_chunks = sum(1 for c in chunks if c.status == "completed")
    failed_chunks = sum(1 for c in chunks if c.status == "failed")
    pending_chunks = sum(1 for c in chunks if c.status == "pending")
    processing_chunks = sum(1 for c in chunks if c.status == "processing")
    
    progress_percent = (completed_chunks / total_chunks * 100) if total_chunks > 0 else 0
    if len(chunks) == 0:
        progress_percent = 0
        total_chunks = int(analysis.total_chunks or 0)

    chunk_items = []
    for c in chunks:
        chunk_items.append(ChunkProgressItem(
            index=int(c.chunk_index),
            status=c.status,
            retry_count=int(c.retry_count or 0),
            error_message=c.error_message,
            error_code=c.error_code,
            processing_time_ms=int(c.processing_time_ms or 0),
            rate_limit_delay_s=int(c.rate_limit_delay_s or 0)
        ))

    avg_time = int(analysis.avg_chunk_time_ms or 0)
    remaining_chunks = total_chunks - completed_chunks
    estimated_remaining_seconds = None
    if avg_time > 0 and remaining_chunks > 0:
        estimated_remaining_seconds = int((remaining_chunks * avg_time) / 1000)

    rate_limit_info = None
    if analysis.rate_limit_wait_until:
        wait_seconds = (analysis.rate_limit_wait_until - datetime.utcnow()).total_seconds()
        if wait_seconds > 0:
            rate_limit_info = {
                "waiting": True,
                "wait_until": analysis.rate_limit_wait_until.isoformat(),
                "remaining_seconds": int(wait_seconds)
            }

    can_resume = analysis.status in ["paused", "partial", "failed"] and failed_chunks > 0
    can_change_model = can_resume

    return AnalysisProgressResponse(
        analysis_id=analysis.id,
        job_id=analysis.job_id,
        task_type=analysis.task_type,
        llm_model=analysis.llm_model,
        status=analysis.status,
        is_paused=analysis.is_paused or False,
        pause_reason=analysis.pause_reason,
        total_chunks=total_chunks,
        completed_chunks=completed_chunks,
        failed_chunks=failed_chunks,
        pending_chunks=pending_chunks,
        processing_chunks=processing_chunks,
        progress_percent=round(progress_percent, 1),
        chunks=chunk_items,
        started_at=analysis.started_at,
        estimated_completion=analysis.estimated_completion,
        estimated_remaining_seconds=estimated_remaining_seconds,
        avg_chunk_time_ms=avg_time,
        rate_limit_info=rate_limit_info,
        can_resume=can_resume,
        can_change_model=can_change_model
    )


@router.post("/analyses/{analysis_id}/resume", response_model=dict)
async def resume_analysis(
    analysis_id: UUID,
    request: ResumeAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """
    Continua uma análise pausada ou parcial, opcionalmente com um novo modelo.
    Preserva chunks já completados.
    """
    analysis = db.query(PIIAnalysis).filter(
        PIIAnalysis.id == analysis_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == analysis.job_id
    ).first()

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    if analysis.status not in ["paused", "partial", "failed"]:
        raise HTTPException(
            status_code=400,
            detail=f"Análise não pode ser retomada. Status atual: {analysis.status}"
        )

    if request.new_model:
        analysis.llm_model = request.new_model

    if request.reset_failed_chunks:
        failed_chunks = db.query(PIIAnalysisChunk).filter(
            PIIAnalysisChunk.analysis_id == analysis.id,
            PIIAnalysisChunk.status == "failed"
        ).all()
        
        for chunk in failed_chunks:
            chunk.status = "pending"
            chunk.retry_count = "0"
            chunk.error_message = None
            chunk.error_code = None
        
        analysis.failed_chunks = "0"

    analysis.is_paused = False
    analysis.pause_reason = None
    analysis.status = "processing"
    db.commit()

    try:
        from app.tasks.pii_tasks import process_pii_analysis_chunked
        process_pii_analysis_chunked.delay(str(analysis.id))
        
        return {
            "message": "Análise retomada com sucesso",
            "analysis_id": str(analysis.id),
            "new_model": request.new_model,
            "reset_failed": request.reset_failed_chunks
        }
    except Exception as e:
        logger.warning(f"Celery not available, running sync: {e}")
        return {
            "message": "Análise será retomada (processamento síncrono)",
            "analysis_id": str(analysis.id),
            "warning": "Celery não disponível"
        }


@router.get("/analyses/{analysis_id}/suggestions", response_model=dict)
async def get_analysis_suggestions(
    analysis_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """
    Retorna sugestões para melhorar o processamento baseado no histórico de erros.
    """
    analysis = db.query(PIIAnalysis).filter(
        PIIAnalysis.id == analysis_id
    ).first()

    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    job = db.query(PIIProcessingJob).filter(
        PIIProcessingJob.id == analysis.job_id
    ).first()

    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    rate_limit_chunks = db.query(PIIAnalysisChunk).filter(
        PIIAnalysisChunk.analysis_id == analysis.id,
        PIIAnalysisChunk.error_code == "RATE_LIMIT"
    ).count()

    failed_chunks = db.query(PIIAnalysisChunk).filter(
        PIIAnalysisChunk.analysis_id == analysis.id,
        PIIAnalysisChunk.status == "failed"
    ).count()

    total_chunks = int(analysis.total_chunks or 0)
    completed_chunks = int(analysis.completed_chunks or 0)

    suggestions = []
    
    if rate_limit_chunks > 0:
        current_model = analysis.llm_model or "gpt-4-turbo"
        if "gpt-4" in current_model.lower():
            suggestions.append({
                "type": "change_model",
                "priority": "high",
                "title": "Usar GPT-3.5 Turbo",
                "description": "GPT-3.5 tem limites muito maiores e processará mais rápido.",
                "action": {"new_model": "gpt-3.5-turbo"}
            })
        
        suggestions.append({
            "type": "increase_delay",
            "priority": "medium",
            "title": "Aumentar delay entre chunks",
            "description": "Aumentar o intervalo entre requisições para evitar rate limits.",
            "action": {"delay_between_chunks": 5}
        })

    if failed_chunks > 0 and completed_chunks > 0:
        suggestions.append({
            "type": "resume",
            "priority": "high",
            "title": "Retomar processamento",
            "description": f"{completed_chunks} de {total_chunks} chunks já foram processados. Retome para completar.",
            "action": {"reset_failed_chunks": True}
        })

    if not suggestions:
        if analysis.status == "processing":
            suggestions.append({
                "type": "wait",
                "priority": "low",
                "title": "Aguardar conclusão",
                "description": "O processamento está em andamento normalmente.",
                "action": None
            })

    return {
        "analysis_id": str(analysis.id),
        "status": analysis.status,
        "rate_limit_errors": rate_limit_chunks,
        "failed_chunks": failed_chunks,
        "suggestions": suggestions
    }


class DeanonymizeRequest(BaseModel):
    text: str


class DeanonymizeResponse(BaseModel):
    original_text: str
    deanonymized_text: str
    vault_id: str


@router.get("/jobs/{job_id}/vault")
async def get_job_vault(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """Retorna informações do vault (sem dados sensíveis)."""
    job = db.query(PIIProcessingJob).filter(PIIProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    vault = db.query(PIIVault).filter(PIIVault.job_id == job_id).first()
    if not vault:
        return {"has_vault": False, "message": "Este job não possui vault de pseudonimização"}
    
    return {
        "has_vault": True,
        "id": str(vault.id),
        "job_id": str(vault.job_id),
        "processing_method": vault.processing_method,
        "total_entities_mapped": vault.total_entities_mapped,
        "entity_types": vault.entity_types,
        "created_at": vault.created_at.isoformat() if vault.created_at else None
    }


@router.post("/jobs/{job_id}/deanonymize")
async def deanonymize_text(
    job_id: UUID,
    request: DeanonymizeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """Re-hidrata texto pseudonimizado com dados originais."""
    job = db.query(PIIProcessingJob).filter(PIIProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    vault = db.query(PIIVault).filter(PIIVault.job_id == job_id).first()
    if not vault:
        raise HTTPException(status_code=404, detail="Vault não encontrado para este job")
    
    deanonymized = PIIService.deanonymize_text(request.text, job_id, db)
    if deanonymized is None:
        raise HTTPException(status_code=500, detail="Erro ao deanonimizar texto")
    
    return {
        "original_text": request.text,
        "deanonymized_text": deanonymized,
        "vault_id": str(vault.id)
    }


@router.post("/analyses/{analysis_id}/deanonymize")
async def deanonymize_analysis(
    analysis_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """Re-hidrata a resposta de uma análise com dados originais."""
    analysis = db.query(PIIAnalysis).filter(PIIAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")
    
    job = db.query(PIIProcessingJob).filter(PIIProcessingJob.id == analysis.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    if not user_can_access_job(job, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    vault = db.query(PIIVault).filter(PIIVault.job_id == job.id).first()
    if not vault:
        return {
            "analysis_id": str(analysis.id),
            "has_vault": False,
            "llm_response": analysis.llm_response,
            "deanonymized_response": None,
            "message": "Este job não possui vault - dados não podem ser re-hidratados"
        }
    
    deanonymized = PIIService.deanonymize_text(analysis.llm_response or "", job.id, db)
    
    return {
        "analysis_id": str(analysis.id),
        "has_vault": True,
        "llm_response": analysis.llm_response,
        "deanonymized_response": deanonymized,
        "vault_id": str(vault.id)
    }


@router.get("/modes")
async def get_pseudonymization_modes():
    """
    Retorna os modos de pseudonimização disponíveis com descrições.
    """
    return {
        "modes": PseudonymizationMode.get_all_modes(),
        "default": "tags"
    }


@router.post("/upload-presidio", response_model=PIIProcessingJobResponse)
async def upload_file_presidio(
    file: UploadFile = File(...),
    mode: str = Query(default="tags", description="Modo de pseudonimização: masking, tags, faker"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pii_access)
):
    """
    Upload de arquivo com pseudonimização configurável.
    
    Modos disponíveis:
    - masking: Asteriscos (irreversível) - Ex: Jo** ***va
    - tags: Tags semânticas (recomendado) - Ex: [PESSOA_1]
    - faker: Dados sintéticos realistas - Ex: Carlos Santos
    """
    valid_modes = ["masking", "tags", "faker"]
    if mode not in valid_modes:
        raise HTTPException(
            status_code=400, 
            detail=f"Modo inválido. Use: {valid_modes}"
        )
    
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="Apenas arquivos .txt são permitidos")
    
    content = await file.read()
    try:
        text_content = content.decode('utf-8')
    except UnicodeDecodeError:
        text_content = content.decode('latin-1')
    
    if len(text_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Arquivo muito grande. Limite: 10MB")
    
    organization_id = current_user.organization_id
    
    try:
        job, messages, vault = PIIService.process_with_presidio(
            content=text_content,
            filename=file.filename,
            db=db,
            current_user=current_user,
            organization_id=organization_id,
            mode=mode
        )
        
        return PIIProcessingJobResponse.model_validate(job)
    except Exception as e:
        logger.error(f"Erro ao processar arquivo com Presidio: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar arquivo: {str(e)}")
