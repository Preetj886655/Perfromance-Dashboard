from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.schemas.auth import AuthenticatedUserResponse, LoginRequest, LoginResponse, UserAuthResponse
from app.core.security import authenticate_user, create_access_token, get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse, summary="Authenticate a user")
def login_user(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = authenticate_user(db, payload.email_or_employee_code, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        employee_code=user.employee_code,
    )

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=UserAuthResponse.model_validate(user),
    )


@router.get("/me", response_model=AuthenticatedUserResponse, summary="Get the authenticated user")
def get_current_authenticated_user(current_user: User = Depends(get_current_user)) -> AuthenticatedUserResponse:
    return AuthenticatedUserResponse.model_validate(current_user)
