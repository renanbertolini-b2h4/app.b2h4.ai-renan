from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.api.routes.admin import require_super_admin
from app.models.user import User
from app.models.nps_rating import NpsRating
from app.schemas.nps import NpsCreate, NpsResponse, NpsStats, NpsFeedbackItem

router = APIRouter()


@router.get("/nps/stats", response_model=NpsStats)
def get_nps_stats(
    current_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db)
):
    total_responses = db.query(func.count(NpsRating.id)).scalar() or 0
    
    promoters_count = db.query(func.count(NpsRating.id)).filter(
        NpsRating.score >= 9
    ).scalar() or 0
    
    neutrals_count = db.query(func.count(NpsRating.id)).filter(
        NpsRating.score >= 7,
        NpsRating.score <= 8
    ).scalar() or 0
    
    detractors_count = db.query(func.count(NpsRating.id)).filter(
        NpsRating.score <= 6
    ).scalar() or 0
    
    if total_responses > 0:
        promoters_percentage = (promoters_count / total_responses) * 100
        neutrals_percentage = (neutrals_count / total_responses) * 100
        detractors_percentage = (detractors_count / total_responses) * 100
        nps_score = promoters_percentage - detractors_percentage
    else:
        promoters_percentage = 0.0
        neutrals_percentage = 0.0
        detractors_percentage = 0.0
        nps_score = 0.0
    
    recent_ratings = db.query(NpsRating).join(
        User, NpsRating.user_id == User.id
    ).order_by(
        NpsRating.created_at.desc()
    ).limit(20).all()
    
    recent_feedbacks = []
    for rating in recent_ratings:
        recent_feedbacks.append(NpsFeedbackItem(
            id=rating.id,
            score=rating.score,
            feedback=rating.feedback,
            allow_showcase=rating.allow_showcase,
            created_at=rating.created_at,
            user_name=rating.user.full_name if rating.user else None,
            user_email=rating.user.email if rating.user else None
        ))
    
    return NpsStats(
        total_responses=total_responses,
        nps_score=round(nps_score, 1),
        promoters_count=promoters_count,
        neutrals_count=neutrals_count,
        detractors_count=detractors_count,
        promoters_percentage=round(promoters_percentage, 1),
        neutrals_percentage=round(neutrals_percentage, 1),
        detractors_percentage=round(detractors_percentage, 1),
        recent_feedbacks=recent_feedbacks
    )


@router.post("/nps", response_model=NpsResponse, status_code=status.HTTP_201_CREATED)
def create_nps_rating(
    nps_data: NpsCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if nps_data.score < 0 or nps_data.score > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Score must be between 0 and 10"
        )
    
    nps_rating = NpsRating(
        user_id=current_user.id,
        score=nps_data.score,
        feedback=nps_data.feedback,
        allow_showcase=nps_data.allow_showcase
    )
    
    db.add(nps_rating)
    db.commit()
    db.refresh(nps_rating)
    
    return nps_rating
