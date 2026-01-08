import os
import io
import uuid
import requests
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from PIL import Image, ImageDraw, ImageFont

from app.core.database import get_db
from app.api.routes.admin import require_super_admin
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.organization import Organization
from app.models.certificate_config import CertificateConfig
from app.schemas.certificate import (
    CertificateParams,
    CertificateParamsUpdate,
    CertificateParamsResponse,
    CertificateGenerateRequest,
    CertificateGenerateResponse,
    CertificateBatchRequest,
    CertificateBatchResponse
)

router = APIRouter()

STORAGE_DIR = "storage/certificates"
ASSETS_DIR = "storage/assets"
os.makedirs(STORAGE_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)


def get_default_font(size: int = 40) -> ImageFont.FreeTypeFont:
    font_paths = [
        os.path.join(ASSETS_DIR, "Roboto-Bold.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def get_regular_font(size: int = 35) -> ImageFont.FreeTypeFont:
    font_paths = [
        os.path.join(ASSETS_DIR, "Roboto-Regular.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def get_replicate_token(db: Session = None) -> Optional[str]:
    if db:
        from app.models.api_credential import ApiCredential
        credential = db.query(ApiCredential).filter(
            ApiCredential.key == "REPLICATE_API_TOKEN",
            ApiCredential.is_active == True
        ).first()
        if credential and credential.is_configured:
            return credential.value
    
    return os.environ.get("REPLICATE_API_TOKEN")


def generate_ai_background(prompt: str, aspect_ratio: str = "16:9", db: Session = None) -> Optional[Image.Image]:
    replicate_token = get_replicate_token(db)
    if not replicate_token:
        return None
    
    try:
        import replicate
        os.environ["REPLICATE_API_TOKEN"] = replicate_token
        
        output = replicate.run(
            "google/nano-banana",
            input={
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "output_format": "png",
                "num_inference_steps": 30
            }
        )
        
        if isinstance(output, list):
            image_url = output[0]
        else:
            image_url = output
        
        response = requests.get(str(image_url))
        response.raise_for_status()
        
        return Image.open(io.BytesIO(response.content)).convert("RGBA")
    except Exception as e:
        print(f"Erro na geração Replicate: {e}")
        return None


def generate_gradient_background(
    width: int = 1920, 
    height: int = 1080,
    color1: str = "#1A1F3A",
    color2: str = "#00BCD4"
) -> Image.Image:
    def hex_to_rgb(hex_color: str) -> tuple:
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    
    rgb1 = hex_to_rgb(color1)
    rgb2 = hex_to_rgb(color2)
    
    img = Image.new('RGB', (width, height))
    
    for y in range(height):
        r = int(rgb1[0] + (rgb2[0] - rgb1[0]) * y / height)
        g = int(rgb1[1] + (rgb2[1] - rgb1[1]) * y / height)
        b = int(rgb1[2] + (rgb2[2] - rgb1[2]) * y / height)
        
        for x in range(width):
            img.putpixel((x, y), (r, g, b))
    
    return img


def config_to_params(config: CertificateConfig) -> CertificateParams:
    from app.schemas.certificate import InstructorInfo
    instructors = []
    if config.instructors:
        instructors = [InstructorInfo(**i) if isinstance(i, dict) else i for i in config.instructors]
    
    return CertificateParams(
        prompt_style=config.prompt_style or CertificateParams().prompt_style,
        aspect_ratio=config.aspect_ratio or "16:9",
        certificate_title=config.certificate_title or "CERTIFICADO DE CONCLUSÃO",
        certificate_subtitle=config.certificate_subtitle or "Conferido a",
        conclusion_message=config.conclusion_message or "Pela participação na Imersão de Transformação Digital & IA.",
        event_date=config.event_date,
        primary_color=config.primary_color or "#00BCD4",
        background_color=config.background_color or "#1A1F3A",
        text_color=config.text_color or "#FFFFFF",
        instructors=instructors
    )


def get_dimensions_for_ratio(aspect_ratio: str) -> tuple:
    ratios = {
        "16:9": (1920, 1080),
        "16:10": (1920, 1200),
        "4:3": (1600, 1200),
        "3:2": (1800, 1200),
        "1:1": (1200, 1200),
        "3:4": (1200, 1600),
        "2:3": (1200, 1800),
        "9:16": (1080, 1920),
        "5:4": (1500, 1200),
        "4:5": (1200, 1500),
        "2:1": (2000, 1000),
        "1:2": (1000, 2000),
        "3:1": (2100, 700),
        "1:3": (700, 2100),
    }
    return ratios.get(aspect_ratio, (1920, 1080))


def compose_certificate(
    participant_name: str,
    params: CertificateParams,
    use_ai_background: bool = True,
    org_id: Optional[str] = None,
    db: Session = None
) -> str:
    target_width, target_height = get_dimensions_for_ratio(params.aspect_ratio)
    is_portrait = target_height > target_width
    is_square = target_width == target_height
    
    base_img = None
    if use_ai_background:
        base_img = generate_ai_background(params.prompt_style, params.aspect_ratio, db)
    
    if base_img is None:
        base_img = generate_gradient_background(
            target_width, target_height,
            params.background_color,
            params.primary_color
        )
    else:
        base_img = base_img.resize((target_width, target_height), Image.Resampling.LANCZOS)
        if base_img.mode == "RGBA":
            base_img = base_img.convert("RGB")
    
    draw = ImageDraw.Draw(base_img)
    
    scale = min(target_width, target_height) / 1080
    margin = int(80 * scale)
    frame_x1, frame_y1 = margin, margin
    frame_x2, frame_y2 = target_width - margin, target_height - margin
    frame_width = frame_x2 - frame_x1
    frame_height = frame_y2 - frame_y1
    
    overlay = Image.new('RGBA', (frame_width, frame_height), (255, 255, 255, 230))
    base_img.paste(overlay, (frame_x1, frame_y1), overlay)
    
    border_color = params.primary_color
    border_width = max(2, int(4 * scale))
    draw.rectangle(
        [frame_x1, frame_y1, frame_x2, frame_y2],
        outline=border_color,
        width=border_width
    )
    
    inner_margin = int(15 * scale)
    draw.rectangle(
        [frame_x1 + inner_margin, frame_y1 + inner_margin, 
         frame_x2 - inner_margin, frame_y2 - inner_margin],
        outline=border_color,
        width=max(1, int(2 * scale))
    )
    
    if is_portrait:
        title_size = int(42 * scale)
        name_size = int(56 * scale)
        text_size = int(28 * scale)
        date_size = int(22 * scale)
        spacing_mult = 1.2
    elif is_square:
        title_size = int(48 * scale)
        name_size = int(64 * scale)
        text_size = int(30 * scale)
        date_size = int(24 * scale)
        spacing_mult = 1.0
    else:
        title_size = int(52 * scale)
        name_size = int(72 * scale)
        text_size = int(32 * scale)
        date_size = int(26 * scale)
        spacing_mult = 1.0
    
    fnt_titulo = get_default_font(title_size)
    fnt_nome = get_default_font(name_size)
    fnt_texto = get_regular_font(text_size)
    fnt_data = get_regular_font(date_size)
    
    def draw_centered_in_frame(text: str, font, y: int, color: str):
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        x = frame_x1 + (frame_width - w) / 2
        draw.text((x, y), text, font=font, fill=color)
    
    logo_path = os.path.join(ASSETS_DIR, "logo_b2h4.png")
    logo_height = 0
    if os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
            max_logo_width = int(180 * scale)
            max_logo_height = int(100 * scale)
            ratio = min(max_logo_width / float(logo.width), max_logo_height / float(logo.height))
            new_width = int(float(logo.width) * ratio)
            new_height = int(float(logo.height) * ratio)
            logo = logo.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            logo_bg_padding = int(15 * scale)
            logo_bg_width = new_width + logo_bg_padding * 2
            logo_bg_height = new_height + logo_bg_padding * 2
            logo_bg = Image.new('RGBA', (logo_bg_width, logo_bg_height), (255, 255, 255, 255))
            
            logo_x = frame_x1 + (frame_width - logo_bg_width) // 2
            logo_y = frame_y1 + int(30 * scale)
            
            base_img.paste(logo_bg, (logo_x, logo_y), logo_bg)
            base_img.paste(logo, (logo_x + logo_bg_padding, logo_y + logo_bg_padding), logo)
            logo_height = logo_bg_height + int(20 * scale)
            
            draw = ImageDraw.Draw(base_img)
        except Exception as e:
            print(f"Erro ao carregar logo: {e}")
            logo_height = 0
    
    content_start_y = frame_y1 + int(30 * scale) + logo_height + int(15 * scale * spacing_mult)
    
    title_color = "#1A1F3A"
    draw_centered_in_frame(params.certificate_title, fnt_titulo, content_start_y, title_color)
    
    subtitle_y = content_start_y + int(60 * scale * spacing_mult)
    draw_centered_in_frame(params.certificate_subtitle, fnt_texto, subtitle_y, "#666666")
    
    name_y = subtitle_y + int(50 * scale * spacing_mult)
    name_color = params.primary_color
    draw_centered_in_frame(participant_name.upper(), fnt_nome, name_y, name_color)
    
    line_y = name_y + int(80 * scale * spacing_mult)
    dec_line_width = int(300 * scale)
    line_x1_pos = frame_x1 + (frame_width - dec_line_width) // 2
    line_x2_pos = line_x1_pos + dec_line_width
    draw.line([(line_x1_pos, line_y), (line_x2_pos, line_y)], fill=params.primary_color, width=2)
    
    message_y = line_y + int(25 * scale * spacing_mult)
    message_lines = []
    words = params.conclusion_message.split()
    current_line = ""
    max_line_width = frame_width - int(100 * scale)
    
    for word in words:
        test_line = current_line + " " + word if current_line else word
        bbox = draw.textbbox((0, 0), test_line, font=fnt_texto)
        if bbox[2] - bbox[0] <= max_line_width:
            current_line = test_line
        else:
            if current_line:
                message_lines.append(current_line)
            current_line = word
    if current_line:
        message_lines.append(current_line)
    
    line_spacing = int(35 * scale * spacing_mult)
    for i, line in enumerate(message_lines):
        draw_centered_in_frame(line, fnt_texto, message_y + i * line_spacing, "#444444")
    
    instructors = getattr(params, 'instructors', []) or []
    num_instructors = len(instructors)
    
    if num_instructors > 0:
        instructor_name_size = int(22 * scale)
        instructor_role_size = int(18 * scale)
        fnt_instructor_name = get_default_font(instructor_name_size)
        fnt_instructor_role = get_regular_font(instructor_role_size)
        
        instructor_section_height = int(80 * scale) + int(40 * scale * num_instructors)
        instructor_start_y = frame_y2 - instructor_section_height - int(30 * scale)
        
        date_y = instructor_start_y - int(40 * scale)
        
        total_width = 0
        instructor_widths = []
        spacing_between = int(80 * scale)
        
        for instructor in instructors:
            name = instructor.name if hasattr(instructor, 'name') else instructor.get('name', '')
            bbox = draw.textbbox((0, 0), name, font=fnt_instructor_name)
            width = bbox[2] - bbox[0]
            instructor_widths.append(width)
            total_width += width
        
        total_width += spacing_between * (num_instructors - 1) if num_instructors > 1 else 0
        
        start_x = frame_x1 + (frame_width - total_width) // 2
        current_x = start_x
        
        for i, instructor in enumerate(instructors):
            name = instructor.name if hasattr(instructor, 'name') else instructor.get('name', '')
            role = instructor.role if hasattr(instructor, 'role') else instructor.get('role', 'Instrutor')
            
            name_bbox = draw.textbbox((0, 0), name, font=fnt_instructor_name)
            name_width = name_bbox[2] - name_bbox[0]
            
            role_bbox = draw.textbbox((0, 0), role, font=fnt_instructor_role)
            role_width = role_bbox[2] - role_bbox[0]
            
            block_width = max(name_width, role_width)
            
            line_y_pos = instructor_start_y
            line_width = int(120 * scale)
            line_start_x = current_x + (name_width - line_width) // 2
            draw.line(
                [(line_start_x, line_y_pos), (line_start_x + line_width, line_y_pos)],
                fill=params.primary_color,
                width=2
            )
            
            name_y = line_y_pos + int(10 * scale)
            draw.text((current_x, name_y), name, font=fnt_instructor_name, fill="#1A1F3A")
            
            role_y = name_y + int(25 * scale)
            role_x = current_x + (name_width - role_width) // 2
            draw.text((role_x, role_y), role, font=fnt_instructor_role, fill="#666666")
            
            current_x += name_width + spacing_between
    else:
        date_y = frame_y2 - int(60 * scale)
    
    if params.event_date:
        data_certificado = params.event_date
    else:
        data_certificado = date.today().strftime("%d de %B de %Y").replace("January", "Janeiro").replace("February", "Fevereiro").replace("March", "Março").replace("April", "Abril").replace("May", "Maio").replace("June", "Junho").replace("July", "Julho").replace("August", "Agosto").replace("September", "Setembro").replace("October", "Outubro").replace("November", "Novembro").replace("December", "Dezembro")
    draw_centered_in_frame(data_certificado, fnt_data, date_y, "#888888")
    
    org_prefix = f"org_{org_id[:8]}_" if org_id else ""
    filename = f"cert_{org_prefix}{participant_name.replace(' ', '_').lower()}_{uuid.uuid4().hex[:8]}.png"
    filepath = os.path.join(STORAGE_DIR, filename)
    
    base_img.save(filepath, "PNG", quality=95)
    
    return filename


@router.get("/admin/certificates/organizations")
def list_organizations_for_certificates(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    orgs = db.query(Organization).filter(Organization.is_active == True).all()
    
    config_org_ids = set(
        str(c.organization_id) for c in db.query(CertificateConfig.organization_id).all()
    )
    
    return {
        "organizations": [
            {
                "id": str(org.id),
                "name": org.name,
                "slug": org.slug,
                "has_config": str(org.id) in config_org_ids
            }
            for org in orgs
        ]
    }


@router.get("/admin/certificates/configs")
def list_certificate_configs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    configs = db.query(CertificateConfig).options(
        joinedload(CertificateConfig.organization)
    ).all()
    
    return [
        {
            "id": str(config.id),
            "organization_id": str(config.organization_id),
            "organization_name": config.organization.name if config.organization else None,
            "certificate_title": config.certificate_title,
            "created_at": config.created_at.isoformat() if config.created_at else None,
            "updated_at": config.updated_at.isoformat() if config.updated_at else None
        }
        for config in configs
    ]


@router.get("/admin/certificates/params/{organization_id}")
def get_certificate_params(
    organization_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    config = db.query(CertificateConfig).options(
        joinedload(CertificateConfig.organization)
    ).filter(CertificateConfig.organization_id == organization_id).first()
    
    if not config:
        org = db.query(Organization).filter(Organization.id == organization_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organização não encontrada")
        
        default_params = CertificateParams()
        return {
            "id": None,
            "organization_id": organization_id,
            "organization_name": org.name,
            "prompt_style": default_params.prompt_style,
            "aspect_ratio": default_params.aspect_ratio,
            "certificate_title": default_params.certificate_title,
            "certificate_subtitle": default_params.certificate_subtitle,
            "conclusion_message": default_params.conclusion_message,
            "event_date": default_params.event_date,
            "primary_color": default_params.primary_color,
            "background_color": default_params.background_color,
            "text_color": default_params.text_color,
            "instructors": [],
            "created_at": None,
            "updated_at": None
        }
    
    return {
        "id": str(config.id),
        "organization_id": str(config.organization_id),
        "organization_name": config.organization.name if config.organization else None,
        "prompt_style": config.prompt_style,
        "aspect_ratio": config.aspect_ratio,
        "certificate_title": config.certificate_title,
        "certificate_subtitle": config.certificate_subtitle,
        "conclusion_message": config.conclusion_message,
        "event_date": config.event_date,
        "primary_color": config.primary_color,
        "background_color": config.background_color,
        "text_color": config.text_color,
        "instructors": config.instructors or [],
        "created_at": config.created_at.isoformat() if config.created_at else None,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None
    }


@router.put("/admin/certificates/params/{organization_id}")
def update_certificate_params(
    organization_id: str,
    params: CertificateParams,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")
    
    config = db.query(CertificateConfig).filter(
        CertificateConfig.organization_id == organization_id
    ).first()
    
    instructors_data = [{"name": i.name, "role": i.role} for i in params.instructors] if params.instructors else []
    
    if not config:
        config = CertificateConfig(
            organization_id=uuid.UUID(organization_id),
            prompt_style=params.prompt_style,
            aspect_ratio=params.aspect_ratio,
            certificate_title=params.certificate_title,
            certificate_subtitle=params.certificate_subtitle,
            conclusion_message=params.conclusion_message,
            event_date=params.event_date,
            primary_color=params.primary_color,
            background_color=params.background_color,
            text_color=params.text_color,
            instructors=instructors_data
        )
        db.add(config)
    else:
        config.prompt_style = params.prompt_style
        config.aspect_ratio = params.aspect_ratio
        config.certificate_title = params.certificate_title
        config.certificate_subtitle = params.certificate_subtitle
        config.conclusion_message = params.conclusion_message
        config.event_date = params.event_date
        config.primary_color = params.primary_color
        config.background_color = params.background_color
        config.text_color = params.text_color
        config.instructors = instructors_data
        config.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(config)
    
    return {
        "id": str(config.id),
        "organization_id": str(config.organization_id),
        "organization_name": org.name,
        "prompt_style": config.prompt_style,
        "aspect_ratio": config.aspect_ratio,
        "certificate_title": config.certificate_title,
        "certificate_subtitle": config.certificate_subtitle,
        "conclusion_message": config.conclusion_message,
        "event_date": config.event_date,
        "primary_color": config.primary_color,
        "background_color": config.background_color,
        "text_color": config.text_color,
        "instructors": config.instructors or [],
        "created_at": config.created_at.isoformat() if config.created_at else None,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None
    }


@router.post("/admin/certificates/generate", response_model=CertificateGenerateResponse)
def admin_generate_certificate(
    request: CertificateGenerateRequest,
    organization_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    config = db.query(CertificateConfig).filter(
        CertificateConfig.organization_id == organization_id
    ).first()
    
    if config:
        params = config_to_params(config)
    else:
        params = CertificateParams()
    
    try:
        filename = compose_certificate(
            request.participant_name,
            params,
            request.use_ai_background,
            organization_id,
            db
        )
        
        return CertificateGenerateResponse(
            success=True,
            message="Certificado gerado com sucesso",
            certificate_url=f"/api/certificates/download/{filename}",
            participant_name=request.participant_name,
            generated_at=datetime.now()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar certificado: {str(e)}"
        )


@router.post("/admin/certificates/generate-batch", response_model=CertificateBatchResponse)
def admin_generate_certificates_batch(
    request: CertificateBatchRequest,
    organization_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    config = db.query(CertificateConfig).filter(
        CertificateConfig.organization_id == organization_id
    ).first()
    
    if config:
        params = config_to_params(config)
    else:
        params = CertificateParams()
    
    certificates = []
    
    for name in request.participant_names:
        try:
            filename = compose_certificate(
                name,
                params,
                request.use_ai_background,
                organization_id,
                db
            )
            certificates.append(CertificateGenerateResponse(
                success=True,
                message="Certificado gerado com sucesso",
                certificate_url=f"/api/certificates/download/{filename}",
                participant_name=name,
                generated_at=datetime.now()
            ))
        except Exception as e:
            certificates.append(CertificateGenerateResponse(
                success=False,
                message=f"Erro: {str(e)}",
                certificate_url=None,
                participant_name=name,
                generated_at=datetime.now()
            ))
    
    success_count = sum(1 for c in certificates if c.success)
    
    return CertificateBatchResponse(
        success=success_count > 0,
        message=f"{success_count}/{len(request.participant_names)} certificados gerados",
        total_requested=len(request.participant_names),
        certificates=certificates
    )


@router.get("/admin/certificates/list")
def admin_list_certificates(
    organization_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    certificates = []
    
    if os.path.exists(STORAGE_DIR):
        for filename in os.listdir(STORAGE_DIR):
            if filename.endswith('.png'):
                if organization_id:
                    org_prefix = f"org_{organization_id[:8]}_"
                    if not filename.startswith(f"cert_{org_prefix}"):
                        continue
                
                filepath = os.path.join(STORAGE_DIR, filename)
                stat = os.stat(filepath)
                certificates.append({
                    "filename": filename,
                    "url": f"/api/certificates/download/{filename}",
                    "size": stat.st_size,
                    "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
    
    certificates.sort(key=lambda x: x["created_at"], reverse=True)
    return {"certificates": certificates}


@router.get("/certificates/download/{filename}")
def download_certificate(
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    filepath = os.path.join(STORAGE_DIR, filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificado não encontrado"
        )
    
    return FileResponse(
        filepath,
        media_type="image/png",
        filename=filename
    )


@router.get("/certificates/my-config")
def get_my_certificate_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não está associado a nenhuma organização"
        )
    
    config = db.query(CertificateConfig).options(
        joinedload(CertificateConfig.organization)
    ).filter(CertificateConfig.organization_id == current_user.organization_id).first()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sua organização não possui configuração de certificado"
        )
    
    return {
        "organization_name": config.organization.name if config.organization else None,
        "certificate_title": config.certificate_title,
        "certificate_subtitle": config.certificate_subtitle,
        "conclusion_message": config.conclusion_message
    }


ASPECT_RATIOS = {
    "16:9": (1920, 1080),
    "16:10": (1920, 1200),
    "4:3": (1600, 1200),
    "3:2": (1800, 1200),
    "1:1": (1200, 1200),
    "3:4": (1200, 1600),
    "2:3": (1200, 1800),
    "9:16": (1080, 1920),
    "5:4": (1500, 1200),
    "4:5": (1200, 1500),
    "2:1": (2000, 1000),
    "1:2": (1000, 2000),
    "3:1": (2100, 700),
    "1:3": (700, 2100),
}


@router.get("/certificates/aspect-ratios")
def get_aspect_ratios():
    landscape = ["16:9", "16:10", "3:1", "2:1", "3:2", "4:3", "5:4"]
    portrait = ["1:3", "1:2", "2:3", "3:4", "4:5"]
    square = ["1:1"]
    
    return {
        "landscape": [{"ratio": r, "width": ASPECT_RATIOS[r][0], "height": ASPECT_RATIOS[r][1]} for r in landscape],
        "portrait": [{"ratio": r, "width": ASPECT_RATIOS[r][0], "height": ASPECT_RATIOS[r][1]} for r in portrait],
        "square": [{"ratio": r, "width": ASPECT_RATIOS[r][0], "height": ASPECT_RATIOS[r][1]} for r in square]
    }


@router.post("/certificates/generate-my", response_model=CertificateGenerateResponse)
def generate_my_certificate(
    use_ai_background: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não está associado a nenhuma organização"
        )
    
    config = db.query(CertificateConfig).filter(
        CertificateConfig.organization_id == current_user.organization_id
    ).first()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sua organização não possui configuração de certificado"
        )
    
    params = config_to_params(config)
    participant_name = current_user.full_name or current_user.email.split('@')[0]
    
    try:
        filename = compose_certificate(
            participant_name,
            params,
            use_ai_background,
            str(current_user.organization_id),
            db
        )
        
        return CertificateGenerateResponse(
            success=True,
            message="Seu certificado foi gerado com sucesso!",
            certificate_url=f"/api/certificates/download/{filename}",
            participant_name=participant_name,
            generated_at=datetime.now()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar certificado: {str(e)}"
        )


@router.get("/certificates/my-certificates")
def list_my_certificates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.organization_id:
        return {"certificates": []}
    
    certificates = []
    org_prefix = f"org_{str(current_user.organization_id)[:8]}_"
    user_name_part = (current_user.full_name or current_user.email.split('@')[0]).replace(' ', '_').lower()
    
    if os.path.exists(STORAGE_DIR):
        for filename in os.listdir(STORAGE_DIR):
            if filename.endswith('.png') and filename.startswith(f"cert_{org_prefix}"):
                if user_name_part in filename.lower():
                    filepath = os.path.join(STORAGE_DIR, filename)
                    stat = os.stat(filepath)
                    certificates.append({
                        "filename": filename,
                        "url": f"/api/certificates/download/{filename}",
                        "size": stat.st_size,
                        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
    
    certificates.sort(key=lambda x: x["created_at"], reverse=True)
    return {"certificates": certificates}


@router.get("/certificates/params", response_model=CertificateParams)
def get_certificate_params_legacy(
    current_user: User = Depends(require_super_admin)
):
    return CertificateParams()


@router.put("/certificates/params", response_model=CertificateParams)
def update_certificate_params_legacy(
    params: CertificateParams,
    current_user: User = Depends(require_super_admin)
):
    return params


@router.post("/certificates/generate", response_model=CertificateGenerateResponse)
def generate_certificate_legacy(
    request: CertificateGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    try:
        params = CertificateParams()
        filename = compose_certificate(
            request.participant_name,
            params,
            request.use_ai_background,
            None,
            db
        )
        
        return CertificateGenerateResponse(
            success=True,
            message="Certificado gerado com sucesso",
            certificate_url=f"/api/certificates/download/{filename}",
            participant_name=request.participant_name,
            generated_at=datetime.now()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar certificado: {str(e)}"
        )


@router.post("/certificates/generate-batch", response_model=CertificateBatchResponse)
def generate_certificates_batch_legacy(
    request: CertificateBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    params = CertificateParams()
    certificates = []
    
    for name in request.participant_names:
        try:
            filename = compose_certificate(
                name,
                params,
                request.use_ai_background,
                None,
                db
            )
            certificates.append(CertificateGenerateResponse(
                success=True,
                message="Certificado gerado com sucesso",
                certificate_url=f"/api/certificates/download/{filename}",
                participant_name=name,
                generated_at=datetime.now()
            ))
        except Exception as e:
            certificates.append(CertificateGenerateResponse(
                success=False,
                message=f"Erro: {str(e)}",
                certificate_url=None,
                participant_name=name,
                generated_at=datetime.now()
            ))
    
    success_count = sum(1 for c in certificates if c.success)
    
    return CertificateBatchResponse(
        success=success_count > 0,
        message=f"{success_count}/{len(request.participant_names)} certificados gerados",
        total_requested=len(request.participant_names),
        certificates=certificates
    )


@router.get("/certificates/list")
def list_certificates_legacy(
    current_user: User = Depends(require_super_admin)
):
    certificates = []
    
    if os.path.exists(STORAGE_DIR):
        for filename in os.listdir(STORAGE_DIR):
            if filename.endswith('.png'):
                filepath = os.path.join(STORAGE_DIR, filename)
                stat = os.stat(filepath)
                certificates.append({
                    "filename": filename,
                    "url": f"/api/certificates/download/{filename}",
                    "size": stat.st_size,
                    "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
    
    certificates.sort(key=lambda x: x["created_at"], reverse=True)
    return {"certificates": certificates}
