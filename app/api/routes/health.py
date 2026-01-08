from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import os
from app.services.health_service import HealthCheckService
from app.core.celery_app import get_celery_status
from app.services import storage_service
from app.core.database import get_db
from app.models.material import Material

router = APIRouter()


@router.get("/ping")
def ping():
    """Endpoint simples para health check do deploy (não verifica serviços externos)"""
    return {"status": "ok", "message": "B2H4 Platform is running"}


@router.get("/health")
async def health_check():
    """
    Verifica a saúde de todos os serviços do sistema.
    
    Returns:
        Dict com status detalhado de Redis, Celery e Flowwise
    """
    return await HealthCheckService.check_all()


@router.get("/health/redis")
def health_check_redis():
    """Verifica apenas o Redis"""
    return HealthCheckService.check_redis()


@router.get("/health/celery")
def health_check_celery():
    """Verifica apenas o Celery"""
    return HealthCheckService.check_celery()


@router.get("/health/flowwise")
async def health_check_flowwise():
    """Verifica apenas o Flowwise"""
    return await HealthCheckService.check_flowwise()


@router.get("/system/celery-status")
def get_celery_execution_status():
    """
    Retorna o status atual do modo de execução do Celery.
    
    Usado pelo frontend para mostrar aviso sobre modo síncrono/assíncrono.
    
    Returns:
        Dict com:
        - enabled: bool - Se Celery está ativo
        - redis_connected: bool - Se Redis está conectado
        - mode: str - "sync" ou "async"
        - message: str - Mensagem descritiva para o usuário
    """
    return get_celery_status()


@router.get("/system/storage-status")
def get_storage_status():
    """
    Retorna o status atual do serviço de armazenamento.
    
    Returns:
        Dict com:
        - object_storage_available: bool - Se Object Storage está disponível
        - fallback_mode: bool - Se está usando armazenamento local como fallback
        - storage_type: str - "replit_object_storage" ou "local_filesystem"
    """
    return storage_service.get_storage_status()


@router.get("/system/storage-integrity")
def check_storage_integrity(db: Session = Depends(get_db)):
    """
    Verifica integridade dos arquivos no Object Storage.
    Identifica materiais com arquivos faltando.
    Usa verificação em lote para evitar rate limits.
    
    Returns:
        Dict com status do storage e lista de arquivos faltando
    """
    materials = db.query(Material).filter(
        Material.file_path.isnot(None),
        Material.file_path != ""
    ).all()
    
    missing_files = []
    valid_count = 0
    
    photo_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
    video_exts = {'.mp4', '.mov', '.webm', '.avi', '.mkv'}
    
    existing_files = storage_service.list_all_files()
    
    for material in materials:
        file_path = material.file_path
        if not file_path or "/api/media/file/" not in file_path:
            continue
        
        filename = os.path.basename(file_path.split("?")[0])
        file_ext = os.path.splitext(filename)[1].lower()
        
        if file_ext in photo_exts:
            media_type = "photo"
        elif file_ext in video_exts:
            media_type = "video"
        else:
            media_type = "document"
        
        storage_key = storage_service.get_storage_key(filename, media_type)
        
        if storage_key in existing_files:
            valid_count += 1
        else:
            missing_files.append({
                "id": str(material.id),
                "title": material.title,
                "media_type": material.media_type,
                "filename": filename
            })
    
    storage_status = storage_service.get_storage_status()
    
    return {
        "status": "healthy" if len(missing_files) == 0 else "degraded",
        "storage_available": storage_status["object_storage_available"],
        "storage_type": storage_status["storage_type"],
        "total_materials": len(materials),
        "valid_files": valid_count,
        "missing_files_count": len(missing_files),
        "missing_files": missing_files,
        "message": "Todos os arquivos disponíveis" if len(missing_files) == 0 else f"{len(missing_files)} arquivo(s) precisam ser re-uploadados"
    }
