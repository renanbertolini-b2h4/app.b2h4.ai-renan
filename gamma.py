from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
import uuid
import httpx
import os

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.material import Material
from app.models.gamma_generation import GammaGeneration
from app.services.gamma_service import (
    GammaService, 
    get_gamma_api_key,
    analyze_prompt_for_mode,
    suggest_theme,
    estimate_slide_count,
    analyze_tone,
    identify_audience
)

router = APIRouter(prefix="/gamma", tags=["gamma"])

STORAGE_PATH = "storage/media/documents"


class GenerateRequest(BaseModel):
    prompt: str
    mode: str = "presentation"
    language: str = "pt-BR"
    theme: str = "default"
    folder_id: Optional[str] = None
    response_format: str = "url"
    generate_images: bool = True
    num_slides: Optional[int] = None
    tone: Optional[str] = None
    audience: Optional[str] = None
    advanced: Optional[Dict[str, Any]] = None
    save_to_library: bool = True


class ExportRequest(BaseModel):
    format: str = "pdf"


class ExportImagesRequest(BaseModel):
    save_to_storage: bool = True


class ShareRequest(BaseModel):
    access_level: str = "view"
    password: Optional[str] = None
    expiry_date: Optional[str] = None


class SuggestTemplateRequest(BaseModel):
    prompt: str
    category: Optional[str] = None


class SendToMaterialsRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    collection: str = "gamma"
    copy_permissions: bool = True


def require_gamma_access(current_user: User = Depends(get_current_user)) -> User:
    if current_user.is_super_admin:
        return current_user
    
    features = current_user.effective_features or {}
    if not features.get("gammaAccess", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso ao Gamma não habilitado"
        )
    return current_user


def get_gamma_service(db: Session = Depends(get_db)) -> GammaService:
    api_key = get_gamma_api_key(db)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API Key do Gamma não configurada. Configure em Administração > Credenciais."
        )
    return GammaService(api_key)


@router.get("/health")
async def health_check(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_gamma_access)
):
    api_key = get_gamma_api_key(db)
    if not api_key:
        return {
            "status": "not_configured",
            "api_configured": False,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    return {
        "status": "connected",
        "api_configured": True,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/themes")
async def get_themes(
    service: GammaService = Depends(get_gamma_service),
    current_user: User = Depends(require_gamma_access)
):
    try:
        themes = await service.get_themes()
        return {"themes": themes}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar temas: {str(e)}"
        )


@router.get("/folders")
async def get_folders(
    service: GammaService = Depends(get_gamma_service),
    current_user: User = Depends(require_gamma_access)
):
    try:
        folders = await service.get_folders()
        return {"folders": folders}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar pastas: {str(e)}"
        )


@router.post("/generate")
async def generate_content(
    request: GenerateRequest,
    db: Session = Depends(get_db),
    service: GammaService = Depends(get_gamma_service),
    current_user: User = Depends(require_gamma_access)
):
    if not request.prompt or not request.prompt.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O prompt é obrigatório"
        )
    
    try:
        result = await service.generate(
            prompt=request.prompt,
            mode=request.mode,
            language=request.language,
            theme=request.theme,
            folder_id=request.folder_id,
            response_format=request.response_format,
            generate_images=request.generate_images,
            num_slides=request.num_slides,
            tone=request.tone,
            audience=request.audience,
            advanced=request.advanced
        )
        
        generation_id = result.get("generationId") or result.get("id")
        
        if not generation_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Não foi possível obter o ID da geração"
            )
        
        completed_result = await service.poll_generation(generation_id)
        
        gamma_url = completed_result.get("gammaUrl") or completed_result.get("url")
        title = completed_result.get("title") or request.prompt[:100]
        
        saved_generation = None
        if request.save_to_library:
            gamma_gen = GammaGeneration(
                title=title,
                prompt=request.prompt,
                gamma_id=generation_id,
                gamma_url=gamma_url,
                format=request.mode,
                theme=request.theme,
                num_cards=request.num_slides or 10,
                status="completed",
                created_by=current_user.id,
                extra_data={
                    "language": request.language,
                    "tone": request.tone,
                    "audience": request.audience,
                    "generate_images": request.generate_images
                }
            )
            db.add(gamma_gen)
            db.commit()
            db.refresh(gamma_gen)
            saved_generation = {
                "id": str(gamma_gen.id),
                "title": gamma_gen.title,
                "gamma_url": gamma_gen.gamma_url
            }
        
        return {
            "success": True,
            "data": {
                "id": generation_id,
                "url": gamma_url,
                "edit_url": gamma_url,
                "status": completed_result.get("status"),
                "title": title,
                "format": completed_result.get("format"),
                "saved_generation": saved_generation
            },
            "generated_at": datetime.utcnow().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar conteúdo: {str(e)}"
        )


@router.get("/generations")
async def list_generations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_gamma_access),
    skip: int = 0,
    limit: int = 20
):
    query = db.query(GammaGeneration).filter(GammaGeneration.is_active == True)
    
    if not current_user.is_super_admin:
        query = query.filter(GammaGeneration.created_by == current_user.id)
    
    total = query.count()
    generations = query.order_by(GammaGeneration.created_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "items": [
            {
                "id": str(g.id),
                "title": g.title,
                "prompt": g.prompt[:100] + "..." if len(g.prompt) > 100 else g.prompt,
                "gamma_url": g.gamma_url,
                "format": g.format,
                "status": g.status,
                "has_pdf": g.pdf_path is not None,
                "has_material": g.material_id is not None,
                "created_at": g.created_at.isoformat() if g.created_at else None,
                "created_by": str(g.created_by) if g.created_by else None
            }
            for g in generations
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/generations/{generation_id}")
async def get_generation(
    generation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_gamma_access)
):
    generation = db.query(GammaGeneration).filter(
        GammaGeneration.id == uuid.UUID(generation_id),
        GammaGeneration.is_active == True
    ).first()
    
    if not generation:
        raise HTTPException(status_code=404, detail="Geração não encontrada")
    
    if not current_user.is_super_admin and generation.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    return {
        "id": str(generation.id),
        "title": generation.title,
        "prompt": generation.prompt,
        "gamma_id": generation.gamma_id,
        "gamma_url": generation.gamma_url,
        "format": generation.format,
        "theme": generation.theme,
        "num_cards": generation.num_cards,
        "status": generation.status,
        "pdf_path": generation.pdf_path,
        "material_id": str(generation.material_id) if generation.material_id else None,
        "extra_data": generation.extra_data,
        "created_at": generation.created_at.isoformat() if generation.created_at else None,
        "created_by": str(generation.created_by) if generation.created_by else None
    }


@router.delete("/generations/{generation_id}")
async def delete_generation(
    generation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_gamma_access)
):
    generation = db.query(GammaGeneration).filter(
        GammaGeneration.id == uuid.UUID(generation_id)
    ).first()
    
    if not generation:
        raise HTTPException(status_code=404, detail="Geração não encontrada")
    
    if not current_user.is_super_admin and generation.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Apenas o criador pode deletar")
    
    generation.is_active = False
    db.commit()
    
    return {"success": True, "message": "Geração removida"}


@router.post("/generations/{generation_id}/send-to-materials")
async def send_to_materials(
    generation_id: str,
    request: SendToMaterialsRequest,
    db: Session = Depends(get_db),
    service: GammaService = Depends(get_gamma_service),
    current_user: User = Depends(require_gamma_access)
):
    generation = db.query(GammaGeneration).filter(
        GammaGeneration.id == uuid.UUID(generation_id),
        GammaGeneration.is_active == True
    ).first()
    
    if not generation:
        raise HTTPException(status_code=404, detail="Geração não encontrada")
    
    if generation.material_id:
        existing_material = db.query(Material).filter(Material.id == generation.material_id).first()
        if existing_material:
            return {
                "success": True,
                "message": "Material já existe",
                "material_id": str(existing_material.id),
                "already_exists": True
            }
    
    pdf_path = None
    pdf_url = None
    
    if generation.gamma_id:
        try:
            export_result = await service.export_content(generation.gamma_id, "pdf")
            pdf_url = export_result.get("url") or export_result.get("downloadUrl")
        except Exception as e:
            print(f"Aviso: Não foi possível exportar PDF: {e}")
    
    if pdf_url:
        try:
            os.makedirs(STORAGE_PATH, exist_ok=True)
            
            filename = f"gamma_{generation.gamma_id}_{uuid.uuid4().hex[:8]}.pdf"
            pdf_path = os.path.join(STORAGE_PATH, filename)
            
            async with httpx.AsyncClient() as client:
                response = await client.get(pdf_url, timeout=60.0)
                if response.status_code == 200:
                    with open(pdf_path, "wb") as f:
                        f.write(response.content)
                    
                    generation.pdf_path = pdf_path
        except Exception as e:
            print(f"Aviso: Não foi possível baixar PDF: {e}")
            pdf_path = None
    
    material = Material(
        title=request.title or generation.title,
        description=request.description or f"Gerado com Gamma AI: {generation.prompt[:200]}",
        icon="📊" if generation.format == "presentation" else "📄",
        file_type="pdf" if pdf_path else "link",
        file_path=pdf_path,
        content=generation.gamma_url,
        media_type="document",
        collection=request.collection,
        created_by=current_user.id,
        extra_data={
            "gamma_generation_id": str(generation.id),
            "gamma_id": generation.gamma_id,
            "gamma_url": generation.gamma_url,
            "format": generation.format,
            "source": "gamma_ai"
        }
    )
    db.add(material)
    db.flush()
    
    generation.material_id = material.id
    
    db.commit()
    db.refresh(material)
    
    return {
        "success": True,
        "message": "Material criado com sucesso",
        "material_id": str(material.id),
        "has_pdf": pdf_path is not None,
        "already_exists": False
    }


@router.get("/status/{content_id}")
async def get_status(
    content_id: str,
    service: GammaService = Depends(get_gamma_service),
    current_user: User = Depends(require_gamma_access)
):
    try:
        result = await service.get_status(content_id)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao verificar status: {str(e)}"
        )


@router.get("/content/{content_id}")
async def get_content(
    content_id: str,
    service: GammaService = Depends(get_gamma_service),
    current_user: User = Depends(require_gamma_access)
):
    try:
        result = await service.get_content(content_id)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar conteúdo: {str(e)}"
        )


@router.put("/content/{content_id}")
async def update_content(
    content_id: str,
    updates: Dict[str, Any],
    service: GammaService = Depends(get_gamma_service),
    current_user: User = Depends(require_gamma_access)
):
    try:
        result = await service.update_content(content_id, updates)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar conteúdo: {str(e)}"
        )


@router.delete("/content/{content_id}")
async def delete_content(
    content_id: str,
    service: GammaService = Depends(get_gamma_service),
    current_user: User = Depends(require_gamma_access)
):
    try:
        await service.delete_content(content_id)
        return {"success": True, "message": "Conteúdo deletado com sucesso"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao deletar conteúdo: {str(e)}"
        )


@router.post("/export/{content_id}")
async def export_content(
    content_id: str,
    request: ExportRequest,
    service: GammaService = Depends(get_gamma_service),
    current_user: User = Depends(require_gamma_access)
):
    try:
        result = await service.export_content(content_id, request.format)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao exportar conteúdo: {str(e)}"
        )


@router.post("/generations/{generation_id}/export-images")
async def export_generation_images(
    generation_id: str,
    request: ExportImagesRequest = None,
    db: Session = Depends(get_db),
    service: GammaService = Depends(get_gamma_service),
    current_user: User = Depends(require_gamma_access)
):
    if request is None:
        request = ExportImagesRequest()
    
    generation = db.query(GammaGeneration).filter(
        GammaGeneration.id == uuid.UUID(generation_id),
        GammaGeneration.is_active == True
    ).first()
    
    if not generation:
        raise HTTPException(status_code=404, detail="Geração não encontrada")
    
    if not generation.gamma_id:
        raise HTTPException(status_code=400, detail="Geração não possui ID do Gamma")
    
    try:
        export_result = await service.export_as_images(generation.gamma_id, "png")
        
        image_url = export_result.get("url") or export_result.get("downloadUrl")
        
        if request.save_to_storage and image_url:
            images_path = "storage/media/photos"
            os.makedirs(images_path, exist_ok=True)
            
            filename = f"gamma_{generation.gamma_id}_{uuid.uuid4().hex[:8]}.png"
            local_path = os.path.join(images_path, filename)
            
            try:
                image_data = await service.download_export(image_url)
                with open(local_path, "wb") as f:
                    f.write(image_data)
                
                if not generation.extra_data:
                    generation.extra_data = {}
                generation.extra_data["exported_images"] = [local_path]
                db.commit()
                
                return {
                    "success": True,
                    "url": image_url,
                    "local_path": local_path,
                    "saved": True
                }
            except Exception as e:
                return {
                    "success": True,
                    "url": image_url,
                    "saved": False,
                    "save_error": str(e)
                }
        
        return {
            "success": True,
            "url": image_url,
            "saved": False
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao exportar imagens: {str(e)}"
        )


@router.post("/analyze-prompt")
async def analyze_prompt(
    request: SuggestTemplateRequest,
    current_user: User = Depends(require_gamma_access)
):
    mode = analyze_prompt_for_mode(request.prompt)
    theme = suggest_theme(request.prompt)
    slides = estimate_slide_count(request.prompt)
    tone = analyze_tone(request.prompt)
    audience = identify_audience(request.prompt)
    
    return {
        "suggested_mode": mode,
        "suggested_theme": theme,
        "suggested_slides": slides,
        "suggested_tone": tone,
        "suggested_audience": audience
    }


@router.get("/templates")
async def get_templates(
    category: Optional[str] = None,
    current_user: User = Depends(require_gamma_access)
):
    templates = [
        {
            "id": "business-pitch",
            "name": "Pitch de Negócios",
            "category": "business",
            "description": "Ideal para apresentar sua startup ou projeto",
            "suggested_slides": 12,
            "suggested_theme": "professional"
        },
        {
            "id": "training",
            "name": "Treinamento Corporativo",
            "category": "education",
            "description": "Perfeito para capacitação de equipes",
            "suggested_slides": 15,
            "suggested_theme": "modern"
        },
        {
            "id": "product-launch",
            "name": "Lançamento de Produto",
            "category": "marketing",
            "description": "Para apresentar novos produtos ou serviços",
            "suggested_slides": 10,
            "suggested_theme": "vibrant"
        },
        {
            "id": "report",
            "name": "Relatório Executivo",
            "category": "business",
            "description": "Resumo de resultados e métricas",
            "suggested_slides": 8,
            "suggested_theme": "minimal"
        },
        {
            "id": "workshop",
            "name": "Workshop Interativo",
            "category": "education",
            "description": "Para sessões práticas e hands-on",
            "suggested_slides": 20,
            "suggested_theme": "playful"
        }
    ]
    
    if category:
        templates = [t for t in templates if t["category"] == category]
    
    return {"templates": templates}
