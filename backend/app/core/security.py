from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

security_scheme = HTTPBearer(auto_error=False)


def _token_secret() -> str:
    configured = (settings.auth_secret_key or "").strip()
    if configured:
        return configured
    if not hasattr(_token_secret, "generated_secret"):
        _token_secret.generated_secret = secrets.token_urlsafe(32)
    return _token_secret.generated_secret


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(*, user_id: str, email: str, employee_code: str, expires_delta: timedelta | None = None) -> str:
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.auth_access_token_expire_minutes)

    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "employee_code": employee_code,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, _token_secret(), algorithm=settings.auth_algorithm)


def create_password_reset_token(user: User, *, expires_delta: timedelta | None = None) -> str:
    if expires_delta is None:
        expires_delta = timedelta(minutes=15)

    if not user.password_hash:
        raise ValueError("User does not have a password hash configured.")

    fingerprint = hashlib.sha256(user.password_hash.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "employee_code": user.employee_code,
        "typ": "password_reset",
        "ver": 1,
        "pw_fingerprint": fingerprint,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, _token_secret(), algorithm=settings.auth_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            _token_secret(),
            algorithms=[settings.auth_algorithm],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:  # pragma: no cover - exercised by runtime auth tests
        raise ValueError("Token expired") from exc
    except jwt.InvalidTokenError as exc:  # pragma: no cover - exercised by runtime auth tests
        raise ValueError("Invalid token") from exc


def authenticate_user(db: Session, email_or_employee_code: str, password: str) -> User | None:
    identifier = (email_or_employee_code or "").strip()
    if not identifier:
        return None

    lower_identifier = identifier.lower()
    user = db.scalar(
        select(User).where(
            or_(
                func.lower(User.email) == lower_identifier,
                func.lower(User.employee_code) == lower_identifier,
            )
        )
    )

    if user is None or not user.is_active or not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def verify_password_reset_token(db: Session, token: str) -> User | None:
    try:
        payload = jwt.decode(
            token,
            _token_secret(),
            algorithms=[settings.auth_algorithm],
            options={"require": ["exp", "sub", "typ", "pw_fingerprint"]},
        )
    except jwt.PyJWTError:
        return None

    if payload.get("typ") != "password_reset":
        return None

    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except (TypeError, ValueError):
        return None

    user = db.get(User, user_id)
    if user is None or not user.is_active or not user.password_hash:
        return None

    expected_fingerprint = hashlib.sha256(user.password_hash.encode("utf-8")).hexdigest()
    if payload.get("pw_fingerprint") != expected_fingerprint:
        return None

    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        ) from exc

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    try:
        parsed_uuid = uuid.UUID(str(user_id))
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        ) from exc

    user = db.get(User, parsed_uuid)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive or not found",
        )

    return user
