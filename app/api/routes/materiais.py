from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import uuid
import os
import shutil

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.organization import Organization
from app.models.material import Material
from app.models.material_access import MaterialOrganizationAccess, MaterialUserAccess
from app.services import storage_service

router = APIRouter()

MEDIA_BASE_DIR = "storage/media"
DOCUMENTS_DIR = os.path.join(MEDIA_BASE_DIR, "documents")
PHOTOS_DIR = os.path.join(MEDIA_BASE_DIR, "photos")
VIDEOS_DIR = os.path.join(MEDIA_BASE_DIR, "videos")
THUMBNAILS_DIR = os.path.join(MEDIA_BASE_DIR, "thumbnails")

UPLOAD_DIR = DOCUMENTS_DIR

os.makedirs(DOCUMENTS_DIR, exist_ok=True)
os.makedirs(PHOTOS_DIR, exist_ok=True)
os.makedirs(VIDEOS_DIR, exist_ok=True)
os.makedirs(THUMBNAILS_DIR, exist_ok=True)


def get_storage_dir_for_media_type(media_type: str) -> str:
    """Retorna o diretório de storage apropriado para o tipo de mídia"""
    if media_type == "photo":
        return PHOTOS_DIR
    elif media_type == "video":
        return VIDEOS_DIR
    elif media_type == "document":
        return DOCUMENTS_DIR
    return DOCUMENTS_DIR


def get_storage_dir_for_extension(ext: str) -> str:
    """Retorna o diretório de storage apropriado baseado na extensão do arquivo"""
    ext = ext.lower()
    photo_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
    video_exts = {'.mp4', '.mov', '.webm', '.avi', '.mkv'}
    
    if ext in photo_exts:
        return PHOTOS_DIR
    elif ext in video_exts:
        return VIDEOS_DIR
    return DOCUMENTS_DIR


class MaterialResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    icon: str
    file: str
    size: str
    type: str
    sort_order: int
    is_active: bool
    media_type: str = "document"
    collection: str = "course"
    thumbnail: Optional[str] = None
    metadata: Optional[dict] = None

    class Config:
        from_attributes = True


class MaterialCreate(BaseModel):
    title: str
    description: Optional[str] = None
    icon: str = "📄"
    file_type: str = "md"
    content: Optional[str] = None
    sort_order: int = 0


class MaterialUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    content: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


def require_course_access(current_user: User = Depends(get_current_user)) -> User:
    """Verifica se o usuário tem acesso ao curso"""
    effective = current_user.get_effective_features()
    if not effective.get("courseAccess", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Você não tem permissão para acessar os materiais do curso."
        )
    return current_user


def require_course_management(current_user: User = Depends(get_current_user)) -> User:
    """Verifica se o usuário pode gerenciar materiais do curso"""
    effective = current_user.get_effective_features()
    if not effective.get("courseManagement", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Você não tem permissão para gerenciar materiais."
        )
    return current_user


def material_to_response(material: Material) -> MaterialResponse:
    file_path = material.file_path or ""
    if material.file_type == "md" and material.content:
        file_path = f"/api/materiais/{material.id}/content"
    
    return MaterialResponse(
        id=str(material.id),
        title=material.title,
        description=material.description,
        icon=material.icon or "📄",
        file=file_path,
        size=material.file_size or "0 KB",
        type=material.file_type or "md",
        sort_order=material.sort_order or 0,
        is_active=material.is_active,
        media_type=material.media_type or "document",
        collection=material.collection or "course",
        thumbnail=material.thumbnail_path,
        metadata=material.extra_data or {}
    )


def user_can_access_material(material: Material, user: User) -> bool:
    """Verifica se o usuário tem acesso a um material específico"""
    if user.is_super_admin:
        return True
    
    has_org_restrictions = len(material.organization_access) > 0
    has_user_restrictions = len(material.user_access) > 0
    
    if not has_org_restrictions and not has_user_restrictions:
        return True
    
    if has_org_restrictions and user.organization_id:
        allowed_org_ids = [a.organization_id for a in material.organization_access]
        if user.organization_id in allowed_org_ids:
            return True
    
    if has_user_restrictions:
        allowed_user_ids = [a.user_id for a in material.user_access]
        if user.id in allowed_user_ids:
            return True
    
    return False


@router.get("/materiais", response_model=List[MaterialResponse])
def get_materiais(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_access)
):
    """Lista todos os materiais ativos do curso que o usuário pode acessar"""
    materials = db.query(Material).options(
        joinedload(Material.organization_access),
        joinedload(Material.user_access)
    ).filter(
        Material.is_active == True
    ).order_by(Material.sort_order.asc(), Material.created_at.asc()).all()
    
    accessible_materials = [m for m in materials if user_can_access_material(m, current_user)]
    
    return [material_to_response(m) for m in accessible_materials]


@router.get("/materiais/{material_id}/content")
def get_material_content(
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_access)
):
    """Retorna o conteúdo Markdown de um material"""
    material = db.query(Material).options(
        joinedload(Material.organization_access),
        joinedload(Material.user_access)
    ).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    
    if not user_can_access_material(material, current_user):
        raise HTTPException(status_code=403, detail="Você não tem permissão para acessar este material")
    
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=material.content or "", media_type="text/markdown")


def serve_media_file(filename: str, db: Session, current_user: User):
    """Função compartilhada para servir arquivos de mídia autenticados via Object Storage.
    Usa streaming (FileResponse) para arquivos grandes para não carregar tudo na memória."""
    from fastapi.responses import FileResponse
    from sqlalchemy import or_
    from starlette.background import BackgroundTask
    
    safe_filename = os.path.basename(filename)
    if safe_filename != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido")
    
    is_thumbnail = "_thumb" in safe_filename
    
    material = db.query(Material).options(
        joinedload(Material.organization_access),
        joinedload(Material.user_access)
    ).filter(
        or_(
            Material.file_path.like(f"%{safe_filename}%"),
            Material.thumbnail_path.like(f"%{safe_filename}%")
        )
    ).first()
    
    if not material:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    
    if not user_can_access_material(material, current_user):
        raise HTTPException(status_code=403, detail="Você não tem permissão para acessar este arquivo")
    
    file_ext = os.path.splitext(safe_filename)[1].lower()
    
    if is_thumbnail:
        media_type_key = "thumbnail"
    else:
        photo_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
        video_exts = {'.mp4', '.mov', '.webm', '.avi', '.mkv'}
        
        if file_ext in photo_exts:
            media_type_key = "photo"
        elif file_ext in video_exts:
            media_type_key = "video"
        else:
            media_type_key = "document"
    
    storage_key = storage_service.get_storage_key(safe_filename, media_type_key)
    
    file_path = storage_service.download_file_to_temp(storage_key)
    
    if file_path is None:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no storage")
    
    content_type = storage_service.get_content_type(safe_filename)
    
    is_temp_file = file_path.startswith("/tmp/")
    
    def cleanup_temp_file():
        if is_temp_file and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass
    
    return FileResponse(
        path=file_path,
        media_type=content_type,
        filename=safe_filename,
        headers={"Cache-Control": "private, max-age=3600"},
        background=BackgroundTask(cleanup_temp_file) if is_temp_file else None
    )


def get_user_from_token(token: str, db: Session) -> User:
    """Valida token e retorna o usuário"""
    from app.services.auth_service import AuthService
    
    token_data = AuthService.verify_token(token)
    if token_data is None or token_data.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido"
        )
    
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado ou inativo"
        )
    
    effective = user.get_effective_features()
    if not effective.get("courseAccess", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Você não tem permissão para acessar os materiais."
        )
    
    return user


@router.get("/media/file/{filename}")
def get_media_file(
    filename: str,
    token: str,
    db: Session = Depends(get_db)
):
    """Endpoint unificado para servir todos os tipos de mídia (documentos, fotos, vídeos).
    Requer autenticação via query parameter 'token' para uso em tags img/video."""
    
    user = get_user_from_token(token, db)
    return serve_media_file(filename, db, user)


@router.get("/materiais/file/{filename}")
def get_material_file(
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_access)
):
    """Serve arquivos de materiais (legacy - redireciona para /media/file)"""
    return serve_media_file(filename, db, current_user)


@router.get("/admin/materiais", response_model=List[MaterialResponse])
def get_all_materiais(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management)
):
    """Lista todos os materiais (ativos e inativos) para administração"""
    materials = db.query(Material).order_by(
        Material.sort_order.asc(), 
        Material.created_at.asc()
    ).all()
    
    return [material_to_response(m) for m in materials]


@router.get("/admin/materiais/{material_id}")
def get_material_detail(
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management)
):
    """Retorna detalhes de um material incluindo conteúdo e permissões"""
    material = db.query(Material).options(
        joinedload(Material.organization_access).joinedload(MaterialOrganizationAccess.organization),
        joinedload(Material.user_access).joinedload(MaterialUserAccess.user)
    ).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    
    allowed_orgs = [
        {"id": str(a.organization_id), "name": a.organization.name if a.organization else "Unknown"}
        for a in material.organization_access
    ]
    allowed_users = [
        {"id": str(a.user_id), "email": a.user.email if a.user else "Unknown", "name": a.user.full_name if a.user else "Unknown"}
        for a in material.user_access
    ]
    
    return {
        "id": str(material.id),
        "title": material.title,
        "description": material.description,
        "icon": material.icon,
        "file_type": material.file_type,
        "file_path": material.file_path,
        "content": material.content,
        "file_size": material.file_size,
        "sort_order": material.sort_order,
        "is_active": material.is_active,
        "created_at": material.created_at.isoformat() if material.created_at else None,
        "updated_at": material.updated_at.isoformat() if material.updated_at else None,
        "allowed_organizations": allowed_orgs,
        "allowed_users": allowed_users,
        "has_restrictions": len(allowed_orgs) > 0 or len(allowed_users) > 0
    }


@router.post("/admin/materiais", response_model=MaterialResponse)
def create_material(
    data: MaterialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management)
):
    """Cria um novo material (Markdown)"""
    material = Material(
        id=uuid.uuid4(),
        title=data.title,
        description=data.description,
        icon=data.icon,
        file_type=data.file_type,
        content=data.content,
        file_size=f"{len(data.content or '')} bytes",
        sort_order=data.sort_order,
        is_active=True,
        created_by=current_user.id
    )
    
    db.add(material)
    db.commit()
    db.refresh(material)
    
    return material_to_response(material)


DOCUMENT_EXTENSIONS = {'.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.md'}
PHOTO_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.webm', '.avi', '.mkv'}

MAX_DOCUMENT_SIZE = 50 * 1024 * 1024   # 50 MB
MAX_PHOTO_SIZE = 10 * 1024 * 1024      # 10 MB
MAX_VIDEO_SIZE = 500 * 1024 * 1024     # 500 MB
MAX_THUMBNAIL_SIZE = 2 * 1024 * 1024   # 2 MB


def get_allowed_extensions(media_type: str) -> set:
    """Retorna extensões permitidas para cada tipo de mídia"""
    if media_type == "photo":
        return PHOTO_EXTENSIONS
    elif media_type == "video":
        return VIDEO_EXTENSIONS
    return DOCUMENT_EXTENSIONS


def get_max_size(media_type: str) -> int:
    """Retorna tamanho máximo permitido para cada tipo de mídia"""
    if media_type == "photo":
        return MAX_PHOTO_SIZE
    elif media_type == "video":
        return MAX_VIDEO_SIZE
    return MAX_DOCUMENT_SIZE


def get_default_icon(media_type: str) -> str:
    """Retorna ícone padrão para cada tipo de mídia"""
    if media_type == "photo":
        return "📷"
    elif media_type == "video":
        return "🎬"
    return "📄"


def extract_image_metadata(file_content: bytes) -> dict:
    """Extrai metadados de uma imagem usando Pillow"""
    try:
        from PIL import Image
        from io import BytesIO
        
        img = Image.open(BytesIO(file_content))
        metadata = {
            "width": img.width,
            "height": img.height,
            "format": img.format,
            "mode": img.mode
        }
        
        if hasattr(img, '_getexif') and img._getexif():
            exif = img._getexif()
            if exif:
                EXIF_TAGS = {
                    271: "camera_make",
                    272: "camera_model", 
                    306: "datetime",
                    274: "orientation"
                }
                for tag_id, tag_name in EXIF_TAGS.items():
                    if tag_id in exif:
                        metadata[tag_name] = str(exif[tag_id])
        
        return metadata
    except Exception as e:
        return {"error": str(e)}


def extract_video_metadata(file_ext: str, file_size: int) -> dict:
    """Retorna metadados básicos de vídeo (sem ffprobe)"""
    return {
        "format": file_ext.replace(".", "").upper(),
        "size_bytes": file_size
    }


async def save_thumbnail(thumbnail: UploadFile, file_id: str) -> Optional[str]:
    """Salva thumbnail no Object Storage e retorna o path"""
    if not thumbnail or not thumbnail.filename:
        return None
    
    thumb_ext = os.path.splitext(thumbnail.filename)[1].lower()
    if thumb_ext not in PHOTO_EXTENSIONS:
        return None
    
    thumb_content = await thumbnail.read()
    if len(thumb_content) > MAX_THUMBNAIL_SIZE:
        return None
    
    thumb_filename = f"{file_id}_thumb{thumb_ext}"
    
    success, _ = storage_service.upload_file(thumb_content, thumb_filename, "thumbnail")
    if not success:
        return None
    
    return f"/api/media/file/{thumb_filename}"


@router.post("/admin/materiais/upload")
async def upload_material_file(
    title: str = Form(...),
    description: str = Form(None),
    icon: str = Form(None),
    sort_order: int = Form(0),
    media_type: str = Form("document"),
    collection: str = Form("course"),
    file: UploadFile = File(...),
    thumbnail: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management)
):
    """Upload de mídia unificado (documentos, fotos, vídeos)"""
    
    if media_type not in ["document", "photo", "video"]:
        raise HTTPException(status_code=400, detail="Tipo de mídia inválido. Use: document, photo ou video")
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nome do arquivo não fornecido")
    
    safe_basename = os.path.basename(file.filename)
    file_ext = os.path.splitext(safe_basename)[1].lower()
    
    allowed_extensions = get_allowed_extensions(media_type)
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Tipo de arquivo não permitido para {media_type}. Permitidos: {', '.join(allowed_extensions)}"
        )
    
    file_content = await file.read()
    max_size = get_max_size(media_type)
    if len(file_content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo muito grande. Tamanho máximo para {media_type}: {max_size // (1024 * 1024)} MB"
        )
    
    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}{file_ext}"
    
    success, storage_key = storage_service.upload_file(file_content, safe_filename, media_type)
    if not success:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivo: {storage_key}")
    
    file_size = len(file_content)
    size_str = f"{file_size / 1024:.1f} KB" if file_size < 1024 * 1024 else f"{file_size / (1024 * 1024):.1f} MB"
    
    file_type = file_ext.replace(".", "")
    
    extra_data = {}
    if media_type == "photo":
        extra_data = extract_image_metadata(file_content)
    elif media_type == "video":
        extra_data = extract_video_metadata(file_ext, file_size)
    
    thumbnail_path = None
    if thumbnail:
        thumbnail_path = await save_thumbnail(thumbnail, file_id)
    
    final_icon = icon if icon else get_default_icon(media_type)
    
    material = Material(
        id=uuid.uuid4(),
        title=title,
        description=description,
        icon=final_icon,
        file_type=file_type,
        file_path=f"/api/media/file/{safe_filename}",
        file_size=size_str,
        sort_order=sort_order,
        is_active=True,
        created_by=current_user.id,
        media_type=media_type,
        collection=collection,
        extra_data=extra_data,
        thumbnail_path=thumbnail_path
    )
    
    db.add(material)
    db.commit()
    db.refresh(material)
    
    return material_to_response(material)


@router.put("/admin/materiais/{material_id}", response_model=MaterialResponse)
def update_material(
    material_id: str,
    data: MaterialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management)
):
    """Atualiza um material existente"""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    
    if data.title is not None:
        material.title = data.title
    if data.description is not None:
        material.description = data.description
    if data.icon is not None:
        material.icon = data.icon
    if data.content is not None:
        material.content = data.content
        material.file_size = f"{len(data.content)} bytes"
    if data.sort_order is not None:
        material.sort_order = data.sort_order
    if data.is_active is not None:
        material.is_active = data.is_active
    
    material.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(material)
    
    return material_to_response(material)


@router.delete("/admin/materiais/{material_id}")
def delete_material(
    material_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management)
):
    """Exclui um material e seus arquivos do Object Storage"""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    
    if material.file_path and "/api/media/file/" in str(material.file_path):
        filename = os.path.basename(str(material.file_path))
        file_ext = os.path.splitext(filename)[1].lower()
        
        photo_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
        video_exts = {'.mp4', '.mov', '.webm', '.avi', '.mkv'}
        
        if file_ext in photo_exts:
            media_type = "photo"
        elif file_ext in video_exts:
            media_type = "video"
        else:
            media_type = "document"
        
        storage_key = storage_service.get_storage_key(filename, media_type)
        storage_service.delete_file(storage_key)
    
    if material.thumbnail_path and "/api/media/file/" in str(material.thumbnail_path):
        thumb_filename = os.path.basename(str(material.thumbnail_path))
        thumb_storage_key = storage_service.get_storage_key(thumb_filename, "thumbnail")
        storage_service.delete_file(thumb_storage_key)
    
    db.delete(material)
    db.commit()
    
    return {"message": "Material excluído com sucesso"}


class MaterialAccessUpdate(BaseModel):
    organization_ids: Optional[List[str]] = None
    user_ids: Optional[List[str]] = None


class BulkAccessFilter(BaseModel):
    organization_ids: Optional[List[str]] = None
    roles: Optional[List[str]] = None
    has_feature: Optional[str] = None


class BulkAccessRequest(BaseModel):
    material_ids: List[str]
    operation: str  # 'add', 'remove', 'replace'
    target_type: str  # 'organizations' or 'users'
    target_ids: Optional[List[str]] = None
    filter: Optional[BulkAccessFilter] = None


@router.put("/admin/materiais/{material_id}/access")
def update_material_access(
    material_id: str,
    data: MaterialAccessUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management)
):
    """Atualiza permissões de acesso de um material (organizações e usuários)"""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    
    if data.organization_ids is not None:
        db.query(MaterialOrganizationAccess).filter(
            MaterialOrganizationAccess.material_id == material.id
        ).delete()
        
        for org_id in data.organization_ids:
            try:
                org_uuid = uuid.UUID(org_id)
                org = db.query(Organization).filter(Organization.id == org_uuid).first()
                if org:
                    access = MaterialOrganizationAccess(
                        material_id=material.id,
                        organization_id=org_uuid,
                        created_by=current_user.id
                    )
                    db.add(access)
            except ValueError:
                continue
    
    if data.user_ids is not None:
        db.query(MaterialUserAccess).filter(
            MaterialUserAccess.material_id == material.id
        ).delete()
        
        for user_id in data.user_ids:
            try:
                user_uuid = uuid.UUID(user_id)
                user = db.query(User).filter(User.id == user_uuid).first()
                if user:
                    access = MaterialUserAccess(
                        material_id=material.id,
                        user_id=user_uuid,
                        created_by=current_user.id
                    )
                    db.add(access)
            except ValueError:
                continue
    
    db.commit()
    
    return {"message": "Permissões atualizadas com sucesso"}


@router.get("/admin/organizations/list")
def list_organizations_for_access(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management),
    search: Optional[str] = None,
    has_feature: Optional[str] = None
):
    """Lista todas as organizações para seleção de permissões com filtros"""
    query = db.query(Organization).filter(Organization.is_active == True)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Organization.name.ilike(search_term)) |
            (Organization.slug.ilike(search_term))
        )
    
    orgs = query.order_by(Organization.name).all()
    
    result = []
    for org in orgs:
        features = org.features or {}
        if has_feature and not features.get(has_feature, False):
            continue
        result.append({
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "features": features
        })
    
    return result


@router.get("/admin/users/list")
def list_users_for_access(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management),
    search: Optional[str] = None,
    org_id: Optional[str] = None,
    role: Optional[str] = None,
    has_feature: Optional[str] = None,
    limit: int = 100
):
    """Lista usuários para seleção de permissões (com filtros avançados)"""
    query = db.query(User).filter(User.is_active == True)
    
    if org_id:
        try:
            org_uuid = uuid.UUID(org_id)
            query = query.filter(User.organization_id == org_uuid)
        except ValueError:
            pass
    
    if role:
        query = query.filter(User.role == role)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (User.email.ilike(search_term)) | 
            (User.full_name.ilike(search_term))
        )
    
    users = query.order_by(User.email).limit(min(limit, 500)).all()
    
    result = []
    for user in users:
        features = user.features or {}
        if has_feature and not features.get(has_feature, False):
            continue
        result.append({
            "id": str(user.id), 
            "email": user.email, 
            "name": user.full_name,
            "role": user.role,
            "organization_id": str(user.organization_id) if user.organization_id else None,
            "features": features
        })
    
    return result


@router.post("/admin/materiais/bulk-access")
def bulk_update_material_access(
    data: BulkAccessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management)
):
    """Atualiza permissões de acesso em massa para múltiplos materiais"""
    
    if data.operation not in ['add', 'remove', 'replace']:
        raise HTTPException(status_code=400, detail="Operação inválida. Use: add, remove ou replace")
    
    if data.target_type not in ['organizations', 'users']:
        raise HTTPException(status_code=400, detail="Tipo de alvo inválido. Use: organizations ou users")
    
    target_ids = []
    
    if data.target_ids:
        target_ids = data.target_ids
    elif data.filter:
        if data.target_type == 'organizations':
            query = db.query(Organization).filter(Organization.is_active == True)
            orgs = query.all()
            for org in orgs:
                features = org.features or {}
                if data.filter.has_feature and not features.get(data.filter.has_feature, False):
                    continue
                target_ids.append(str(org.id))
        else:
            query = db.query(User).filter(User.is_active == True)
            if data.filter.organization_ids:
                org_uuids = []
                for oid in data.filter.organization_ids:
                    try:
                        org_uuids.append(uuid.UUID(oid))
                    except ValueError:
                        continue
                if org_uuids:
                    query = query.filter(User.organization_id.in_(org_uuids))
            if data.filter.roles:
                query = query.filter(User.role.in_(data.filter.roles))
            
            users = query.all()
            for user in users:
                features = user.features or {}
                if data.filter.has_feature and not features.get(data.filter.has_feature, False):
                    continue
                target_ids.append(str(user.id))
    
    if not target_ids:
        raise HTTPException(status_code=400, detail="Nenhum alvo encontrado com os critérios especificados")
    
    materials_updated = 0
    permissions_added = 0
    permissions_removed = 0
    
    for material_id in data.material_ids:
        try:
            material_uuid = uuid.UUID(material_id)
        except ValueError:
            continue
        
        material = db.query(Material).filter(Material.id == material_uuid).first()
        if not material:
            continue
        
        if data.target_type == 'organizations':
            if data.operation == 'replace':
                deleted = db.query(MaterialOrganizationAccess).filter(
                    MaterialOrganizationAccess.material_id == material.id
                ).delete()
                permissions_removed += deleted
            
            for org_id_str in target_ids:
                try:
                    org_uuid = uuid.UUID(org_id_str)
                except ValueError:
                    continue
                
                if data.operation == 'remove':
                    deleted = db.query(MaterialOrganizationAccess).filter(
                        MaterialOrganizationAccess.material_id == material.id,
                        MaterialOrganizationAccess.organization_id == org_uuid
                    ).delete()
                    permissions_removed += deleted
                else:
                    existing = db.query(MaterialOrganizationAccess).filter(
                        MaterialOrganizationAccess.material_id == material.id,
                        MaterialOrganizationAccess.organization_id == org_uuid
                    ).first()
                    
                    if not existing:
                        access = MaterialOrganizationAccess(
                            material_id=material.id,
                            organization_id=org_uuid,
                            created_by=current_user.id
                        )
                        db.add(access)
                        permissions_added += 1
        else:
            if data.operation == 'replace':
                deleted = db.query(MaterialUserAccess).filter(
                    MaterialUserAccess.material_id == material.id
                ).delete()
                permissions_removed += deleted
            
            for user_id_str in target_ids:
                try:
                    user_uuid = uuid.UUID(user_id_str)
                except ValueError:
                    continue
                
                if data.operation == 'remove':
                    deleted = db.query(MaterialUserAccess).filter(
                        MaterialUserAccess.material_id == material.id,
                        MaterialUserAccess.user_id == user_uuid
                    ).delete()
                    permissions_removed += deleted
                else:
                    existing = db.query(MaterialUserAccess).filter(
                        MaterialUserAccess.material_id == material.id,
                        MaterialUserAccess.user_id == user_uuid
                    ).first()
                    
                    if not existing:
                        access = MaterialUserAccess(
                            material_id=material.id,
                            user_id=user_uuid,
                            created_by=current_user.id
                        )
                        db.add(access)
                        permissions_added += 1
        
        materials_updated += 1
    
    db.commit()
    
    return {
        "message": "Permissões atualizadas em massa com sucesso",
        "materials_updated": materials_updated,
        "permissions_added": permissions_added,
        "permissions_removed": permissions_removed,
        "targets_affected": len(target_ids)
    }


@router.post("/admin/materiais/bulk-access/preview")
def preview_bulk_access(
    data: BulkAccessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management)
):
    """Preview das permissões que serão aplicadas em massa (sem aplicar)"""
    
    target_ids = []
    targets = []
    
    if data.target_ids:
        target_ids = data.target_ids
        if data.target_type == 'organizations':
            for org_id in target_ids:
                try:
                    org = db.query(Organization).filter(Organization.id == uuid.UUID(org_id)).first()
                    if org:
                        targets.append({"id": str(org.id), "name": org.name})
                except ValueError:
                    continue
        else:
            for user_id in target_ids:
                try:
                    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
                    if user:
                        targets.append({"id": str(user.id), "name": user.full_name or user.email, "email": user.email})
                except ValueError:
                    continue
    elif data.filter:
        if data.target_type == 'organizations':
            query = db.query(Organization).filter(Organization.is_active == True)
            orgs = query.all()
            for org in orgs:
                features = org.features or {}
                if data.filter.has_feature and not features.get(data.filter.has_feature, False):
                    continue
                target_ids.append(str(org.id))
                targets.append({"id": str(org.id), "name": org.name})
        else:
            query = db.query(User).filter(User.is_active == True)
            if data.filter.organization_ids:
                org_uuids = []
                for oid in data.filter.organization_ids:
                    try:
                        org_uuids.append(uuid.UUID(oid))
                    except ValueError:
                        continue
                if org_uuids:
                    query = query.filter(User.organization_id.in_(org_uuids))
            if data.filter.roles:
                query = query.filter(User.role.in_(data.filter.roles))
            
            users = query.all()
            for user in users:
                features = user.features or {}
                if data.filter.has_feature and not features.get(data.filter.has_feature, False):
                    continue
                target_ids.append(str(user.id))
                targets.append({"id": str(user.id), "name": user.full_name or user.email, "email": user.email})
    
    materials = []
    for material_id in data.material_ids:
        try:
            material = db.query(Material).filter(Material.id == uuid.UUID(material_id)).first()
            if material:
                materials.append({"id": str(material.id), "title": material.title})
        except ValueError:
            continue
    
    return {
        "operation": data.operation,
        "target_type": data.target_type,
        "materials_count": len(materials),
        "materials": materials,
        "targets_count": len(targets),
        "targets": targets[:50],
        "has_more_targets": len(targets) > 50
    }


@router.get("/admin/materiais/integrity")
def check_materials_integrity(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_course_management)
):
    """Verifica integridade dos materiais - identifica arquivos faltando no Object Storage"""
    
    materials = db.query(Material).filter(
        Material.file_path.isnot(None),
        Material.file_path != ""
    ).all()
    
    missing_files = []
    valid_files = []
    
    for material in materials:
        file_path = material.file_path
        if not file_path or "/api/media/file/" not in file_path:
            continue
        
        filename = os.path.basename(file_path.split("?")[0])
        file_ext = os.path.splitext(filename)[1].lower()
        
        photo_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
        video_exts = {'.mp4', '.mov', '.webm', '.avi', '.mkv'}
        
        if file_ext in photo_exts:
            media_type = "photo"
        elif file_ext in video_exts:
            media_type = "video"
        else:
            media_type = "document"
        
        storage_key = storage_service.get_storage_key(filename, media_type)
        
        file_exists = storage_service.file_exists(storage_key)
        
        material_info = {
            "id": str(material.id),
            "title": material.title,
            "media_type": material.media_type,
            "file_path": file_path,
            "filename": filename,
            "storage_key": storage_key
        }
        
        if file_exists:
            valid_files.append(material_info)
        else:
            missing_files.append(material_info)
        
        if material.thumbnail_path and "/api/media/file/" in material.thumbnail_path:
            thumb_filename = os.path.basename(material.thumbnail_path.split("?")[0])
            thumb_storage_key = storage_service.get_storage_key(thumb_filename, "thumbnail")
            if not storage_service.file_exists(thumb_storage_key):
                missing_files.append({
                    "id": str(material.id),
                    "title": f"{material.title} (thumbnail)",
                    "media_type": "thumbnail",
                    "file_path": material.thumbnail_path,
                    "filename": thumb_filename,
                    "storage_key": thumb_storage_key
                })
    
    return {
        "storage_available": storage_service.is_storage_available(),
        "storage_type": "object_storage" if storage_service.is_storage_available() else "local",
        "total_materials": len(materials),
        "valid_files_count": len(valid_files),
        "missing_files_count": len(missing_files),
        "missing_files": missing_files,
        "message": "Arquivos listados em 'missing_files' precisam ser re-uploadados" if missing_files else "Todos os arquivos estão disponíveis"
    }
