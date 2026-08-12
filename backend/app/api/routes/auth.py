from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from sqlalchemy import func, or_, select

from app.api.schemas.auth import (
    AuthenticatedUserResponse,
    ForgotPasswordRequest,
    GenericResponse,
    LoginRequest,
    LoginResponse,
    ResetPasswordRequest,
    UserAuthResponse,
)
from app.core.rbac import get_user_roles, user_permission_codes
from app.core.security import (
    authenticate_user,
    create_access_token,
    create_password_reset_token,
    get_current_user,
    hash_password,
    verify_password,
    verify_password_reset_token,
)
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

    roles = [role.code for role in get_user_roles(db, user)]
    permissions = sorted(user_permission_codes(db, user))

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=UserAuthResponse(
            id=user.id,
            employee_code=user.employee_code,
            email=user.email,
            plant_id=user.plant_id,
            department_id=user.department_id,
            is_active=user.is_active,
            roles=roles,
            permissions=permissions,
        ),
    )


@router.get("/me", response_model=AuthenticatedUserResponse, summary="Get the authenticated user")
def get_current_authenticated_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthenticatedUserResponse:
    roles = [role.code for role in get_user_roles(db, current_user)]
    permissions = sorted(user_permission_codes(db, current_user))
    return AuthenticatedUserResponse(
        id=current_user.id,
        employee_code=current_user.employee_code,
        email=current_user.email,
        plant_id=current_user.plant_id,
        department_id=current_user.department_id,
        is_active=current_user.is_active,
        roles=roles,
        permissions=permissions,
    )


@router.post(
    "/forgot-password",
    response_model=GenericResponse,
    summary="Request a password reset without revealing whether the account exists",
)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> GenericResponse:
    identifier = (payload.email_or_employee_code or "").strip()
    if not identifier:
        return GenericResponse(detail="If the account exists, password reset instructions have been provided.")

    lower_identifier = identifier.lower()
    user = db.scalar(
        select(User).where(
            or_(
                func.lower(User.email) == lower_identifier,
                func.lower(User.employee_code) == lower_identifier,
            )
        )
    )

    if user is not None and user.is_active and user.password_hash:
        create_password_reset_token(user)

    return GenericResponse(detail="If the account exists, password reset instructions have been provided.")


@router.post(
    "/reset-password",
    response_model=GenericResponse,
    summary="Reset a forgotten password using a signed, short-lived token",
)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> GenericResponse:
    token = (payload.token or "").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This password reset link is invalid or expired.",
        )

    password = (payload.password or "").strip()
    confirm_password = (payload.confirm_password or "").strip()
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long.",
        )
    if password != confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match.",
        )

    user = verify_password_reset_token(db, token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This password reset link is invalid or expired.",
        )

    if user.password_hash and verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        )

    user.password_hash = hash_password(password)
    db.flush()
    db.commit()
    return GenericResponse(detail="Password reset successful. Please sign in.")
