from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, EmailStr
from datetime import datetime
import uuid
import bcrypt

from app.core.database import get_db
from app.core.features import AVAILABLE_FEATURES, get_feature_keys, get_default_features, normalize_features
from app.models.user import User
from app.models.organization import Organization
from app.api.routes.auth import get_current_user


router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_super_admin(current_user: User = Depends(get_current_user)):
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a Super Admins"
        )
    return current_user


class OrganizationCreate(BaseModel):
    name: str
    slug: str
    plan_type: str = "free"
    features: Optional[Dict[str, bool]] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    plan_type: Optional[str] = None
    features: Optional[Dict[str, bool]] = None
    is_active: Optional[bool] = None


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan_type: str
    features: dict
    is_active: bool
    created_at: datetime
    user_count: int = 0

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    organization_id: Optional[str] = None
    role: str = "member"
    features: Optional[Dict[str, bool]] = None
    is_super_admin: bool = False


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    full_name: Optional[str] = None
    organization_id: Optional[str] = None
    role: Optional[str] = None
    features: Optional[Dict[str, bool]] = None
    is_active: Optional[bool] = None
    is_super_admin: Optional[bool] = None


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    role: str
    features: dict
    is_active: bool
    is_super_admin: bool
    created_at: datetime
    last_login_at: Optional[datetime]
    organization: Optional[dict] = None

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_organizations: int
    active_organizations: int
    total_users: int
    active_users: int
    super_admins: int
    feature_stats: Dict[str, int]


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    total_orgs = db.query(func.count(Organization.id)).scalar()
    active_orgs = db.query(func.count(Organization.id)).filter(Organization.is_active == True).scalar()
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    super_admins = db.query(func.count(User.id)).filter(User.is_super_admin == True).scalar()
    
    feature_stats = {}
    for feature in AVAILABLE_FEATURES:
        key = feature["key"]
        count = db.query(func.count(Organization.id)).filter(
            Organization.features.op('->>')(key) == 'true'
        ).scalar()
        feature_stats[key] = count or 0
    
    return DashboardStats(
        total_organizations=total_orgs or 0,
        active_organizations=active_orgs or 0,
        total_users=total_users or 0,
        active_users=active_users or 0,
        super_admins=super_admins or 0,
        feature_stats=feature_stats
    )


@router.get("/features")
async def get_available_features(
    current_user: User = Depends(require_super_admin)
):
    """Retorna a lista de features disponíveis no sistema"""
    return AVAILABLE_FEATURES


@router.get("/organizations", response_model=List[OrganizationResponse])
async def list_organizations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()
    
    result = []
    for org in orgs:
        user_count = db.query(func.count(User.id)).filter(User.organization_id == org.id).scalar()
        result.append(OrganizationResponse(
            id=str(org.id),
            name=org.name,
            slug=org.slug,
            plan_type=org.plan_type,
            features=normalize_features(org.features),
            is_active=org.is_active,
            created_at=org.created_at,
            user_count=user_count or 0
        ))
    
    return result


@router.post("/organizations", response_model=OrganizationResponse)
async def create_organization(
    org_data: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    existing = db.query(Organization).filter(Organization.slug == org_data.slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slug já existe"
        )
    
    features = normalize_features(org_data.features)
    
    org = Organization(
        id=uuid.uuid4(),
        name=org_data.name,
        slug=org_data.slug,
        plan_type=org_data.plan_type,
        features=features,
        is_active=True
    )
    
    db.add(org)
    db.commit()
    db.refresh(org)
    
    return OrganizationResponse(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        plan_type=org.plan_type,
        features=normalize_features(org.features),
        is_active=org.is_active,
        created_at=org.created_at,
        user_count=0
    )


@router.put("/organizations/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: str,
    org_data: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organização não encontrada"
        )
    
    if org_data.name is not None:
        org.name = org_data.name
    if org_data.plan_type is not None:
        org.plan_type = org_data.plan_type
    if org_data.features is not None:
        org.features = normalize_features(org_data.features)
    if org_data.is_active is not None:
        org.is_active = org_data.is_active
    
    db.commit()
    db.refresh(org)
    
    user_count = db.query(func.count(User.id)).filter(User.organization_id == org.id).scalar()
    
    return OrganizationResponse(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        plan_type=org.plan_type,
        features=normalize_features(org.features),
        is_active=org.is_active,
        created_at=org.created_at,
        user_count=user_count or 0
    )


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    organization_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    query = db.query(User)
    
    if organization_id:
        query = query.filter(User.organization_id == organization_id)
    
    users = query.order_by(User.created_at.desc()).all()
    
    result = []
    for user in users:
        org_data = None
        if user.organization:
            org_data = {
                "id": str(user.organization.id),
                "name": user.organization.name,
                "slug": user.organization.slug
            }
        
        result.append(UserResponse(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            features=normalize_features(user.features),
            is_active=user.is_active,
            is_super_admin=user.is_super_admin,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            organization=org_data
        ))
    
    return result


@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já cadastrado"
        )
    
    password_hash = bcrypt.hashpw(
        user_data.password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')
    
    org_id = None
    if user_data.organization_id:
        org = db.query(Organization).filter(Organization.id == user_data.organization_id).first()
        if not org:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organização não encontrada"
            )
        org_id = org.id
    
    features = normalize_features(user_data.features)
    
    user = User(
        id=uuid.uuid4(),
        email=user_data.email,
        password_hash=password_hash,
        full_name=user_data.full_name,
        organization_id=org_id,
        role=user_data.role,
        features=features,
        is_active=True,
        is_super_admin=user_data.is_super_admin
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    org_data = None
    if user.organization:
        org_data = {
            "id": str(user.organization.id),
            "name": user.organization.name,
            "slug": user.organization.slug
        }
    
    return UserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        features=normalize_features(user.features),
        is_active=user.is_active,
        is_super_admin=user.is_super_admin,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        organization=org_data
    )


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    if user_data.email is not None:
        existing = db.query(User).filter(User.email == user_data.email, User.id != user_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email já cadastrado"
            )
        user.email = user_data.email
    
    if user_data.password is not None and user_data.password.strip() != "":
        password_hash = bcrypt.hashpw(
            user_data.password.encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')
        user.password_hash = password_hash
    
    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    
    if user_data.organization_id is not None:
        if user_data.organization_id == "":
            user.organization_id = None
        else:
            org = db.query(Organization).filter(Organization.id == user_data.organization_id).first()
            if not org:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Organização não encontrada"
                )
            user.organization_id = org.id
    
    if user_data.role is not None:
        user.role = user_data.role
    
    if user_data.features is not None:
        user.features = normalize_features(user_data.features)
    
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    
    if user_data.is_super_admin is not None:
        user.is_super_admin = user_data.is_super_admin
    
    db.commit()
    db.refresh(user)
    
    org_data = None
    if user.organization:
        org_data = {
            "id": str(user.organization.id),
            "name": user.organization.name,
            "slug": user.organization.slug
        }
    
    return UserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        features=normalize_features(user.features),
        is_active=user.is_active,
        is_super_admin=user.is_super_admin,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        organization=org_data
    )
