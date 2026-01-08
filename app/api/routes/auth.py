from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from typing import Annotated
from datetime import datetime

from app.core.database import get_db
from app.services.auth_service import AuthService
from app.schemas.auth import UserRegister, UserLogin, Token, User as UserSchema, OrganizationInfo, EffectiveFeatures
from app.models.user import User

router = APIRouter()
security = HTTPBearer()


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    token_data = AuthService.verify_token(token)
    
    if token_data is None or token_data.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).options(joinedload(User.organization)).filter(User.id == token_data.user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    
    return user


@router.post("/register", response_model=Token)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    existing_user = AuthService.get_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    user = AuthService.create_user(
        db=db,
        email=user_data.email,
        password=user_data.password,
        full_name=user_data.full_name
    )
    
    access_token = AuthService.create_access_token(data={"sub": str(user.id)})
    
    return Token(access_token=access_token)


@router.post("/login", response_model=Token)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = AuthService.authenticate_user(db, user_data.email, user_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user.last_login_at = datetime.utcnow()
    db.commit()
    
    access_token = AuthService.create_access_token(data={"sub": str(user.id)})
    
    return Token(access_token=access_token)


@router.get("/me", response_model=UserSchema)
def get_current_user_info(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Session = Depends(get_db)
):
    token = credentials.credentials
    token_data = AuthService.verify_token(token)
    
    if token_data is None or token_data.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    
    user = db.query(User).options(joinedload(User.organization)).filter(User.id == token_data.user_id).first()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    if user.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    
    org_info = None
    if user.organization:
        org_info = OrganizationInfo(
            id=user.organization.id,
            name=user.organization.name,
            slug=user.organization.slug,
            features=user.organization.features or {"flowiseAccess": False, "courseAccess": True}
        )
    
    effective = user.get_effective_features()
    effective_features = EffectiveFeatures(
        flowiseAccess=effective.get("flowiseAccess", False),
        gammaAccess=effective.get("gammaAccess", False),
        courseAccess=effective.get("courseAccess", False),
        settingsAccess=effective.get("settingsAccess", False),
        healthCheckAccess=effective.get("healthCheckAccess", False),
        courseManagement=effective.get("courseManagement", False),
        piiAccess=effective.get("piiAccess", False),
        isAdmin=effective.get("isAdmin", False),
        isSuperAdmin=effective.get("isSuperAdmin", False)
    )
    
    return UserSchema(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        organization_id=user.organization_id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        organization=org_info,
        role=user.role,
        effectiveFeatures=effective_features
    )
