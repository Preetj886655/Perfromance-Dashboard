from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db, get_engine
from app.main import app
from app.models.user import User


@pytest.fixture
def db_session() -> Session:
    engine = get_engine()
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, autoflush=False, expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> TestClient:
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


_HASH_SENTINEL = object()


def _make_user(
    session: Session,
    *,
    email: str,
    employee_code: str,
    password: str,
    active: bool = True,
    password_hash: str | None | object = _HASH_SENTINEL,
) -> User:
    if password_hash is _HASH_SENTINEL:
        password_hash = hash_password(password)
    user = User(
        email=email,
        employee_code=employee_code,
        password_hash=password_hash,
        is_active=active,
    )
    session.add(user)
    session.flush()
    return user


def test_auth_login_valid_by_email(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, email="alice@patil.local", employee_code="EMP-1001", password="Secret123!")

    response = client.post(
        "/api/v1/auth/login",
        json={"email_or_employee_code": user.email, "password": "Secret123!"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str)
    assert body["user"]["email"] == user.email
    assert "password_hash" not in body
    assert "password_hash" not in str(body)


def test_auth_login_valid_by_employee_code(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, email="bob@patil.local", employee_code="EMP-2002", password="PassWord99!")

    response = client.post(
        "/api/v1/auth/login",
        json={"email_or_employee_code": user.employee_code, "password": "PassWord99!"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["user"]["employee_code"] == user.employee_code


def test_auth_login_invalid_password(client: TestClient, db_session: Session) -> None:
    _make_user(db_session, email="charlie@patil.local", employee_code="EMP-3003", password="RightPass!1")

    response = client.post(
        "/api/v1/auth/login",
        json={"email_or_employee_code": "charlie@patil.local", "password": "WrongPass!1"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_auth_login_nonexistent_user(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email_or_employee_code": "ghost@patil.local", "password": "Whatever123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_auth_login_inactive_user(client: TestClient, db_session: Session) -> None:
    _make_user(db_session, email="dora@patil.local", employee_code="EMP-4004", password="Inactive123!", active=False)

    response = client.post(
        "/api/v1/auth/login",
        json={"email_or_employee_code": "dora@patil.local", "password": "Inactive123!"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_auth_login_missing_password_hash(client: TestClient, db_session: Session) -> None:
    _make_user(db_session, email="erin@patil.local", employee_code="EMP-5005", password="Secret!", password_hash=None)

    response = client.post(
        "/api/v1/auth/login",
        json={"email_or_employee_code": "erin@patil.local", "password": "Secret!"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_auth_create_access_token_and_decode(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, email="frank@patil.local", employee_code="EMP-6006", password="TokenPass!7")

    token = create_access_token(user_id=str(user.id), email=user.email, employee_code=user.employee_code)
    assert isinstance(token, str)
    assert token.startswith("eyJ")
    assert verify_password("TokenPass!7", user.password_hash)


def test_auth_dependency_accepts_valid_token(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, email="gina@patil.local", employee_code="EMP-7007", password="AuthPass!1")
    token = create_access_token(user_id=str(user.id), email=user.email, employee_code=user.employee_code)

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == user.email
    assert body["employee_code"] == user.employee_code
    assert "password_hash" not in body


def test_auth_dependency_rejects_invalid_token(client: TestClient) -> None:
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-real-token"},
    )

    assert response.status_code == 401


def test_auth_dependency_rejects_tampered_token(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, email="henry@patil.local", employee_code="EMP-8008", password="TamperPass!9")
    token = create_access_token(user_id=str(user.id), email=user.email, employee_code=user.employee_code)
    tampered = token + "A"

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {tampered}"},
    )

    assert response.status_code == 401


def test_auth_dependency_rejects_expired_token(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, email="ian@patil.local", employee_code="EMP-9009", password="ExpiredPass!1")
    expired_payload = {
        "sub": str(user.id),
        "email": user.email,
        "employee_code": user.employee_code,
        "iat": int(datetime.now(timezone.utc).timestamp()) - 3600,
        "exp": int((datetime.now(timezone.utc) - timedelta(minutes=5)).timestamp()),
    }
    expired = jwt.encode(expired_payload, settings.auth_secret_key or "dev-token-secret", algorithm=settings.auth_algorithm)

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired}"},
    )

    assert response.status_code == 401


def test_health_remains_public_without_auth(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200


def test_auth_secret_not_exposed_in_login_response(client: TestClient, db_session: Session) -> None:
    _make_user(db_session, email="ivy@patil.local", employee_code="EMP-9009", password="PublicPass!9")
    response = client.post(
        "/api/v1/auth/login",
        json={"email_or_employee_code": "ivy@patil.local", "password": "PublicPass!9"},
    )
    payload = str(response.json())
    assert settings.auth_secret_key == ""
    assert "secret" not in payload.lower()
    assert "password_hash" not in payload


def test_hash_password_does_not_equal_plaintext() -> None:
    hashed = hash_password("PlainText@123")
    assert hashed != "PlainText@123"
    assert hashed.startswith("$2b$")


def test_auth_forgot_password_returns_generic_response(client: TestClient, db_session: Session) -> None:
    _make_user(db_session, email="julia@patil.local", employee_code="EMP-1111", password="Secret123!")

    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"email_or_employee_code": "julia@patil.local"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["detail"] == "If the account exists, password reset instructions have been provided."


def test_auth_reset_password_valid_token_updates_hash(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, email="karen@patil.local", employee_code="EMP-1212", password="OldPass!23")
    token = create_password_reset_token(user)

    response = client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": token,
            "password": "NewPass!45",
            "confirm_password": "NewPass!45",
        },
    )

    assert response.status_code == 200, response.text
    db_session.refresh(user)
    assert verify_password("NewPass!45", user.password_hash)
    assert not verify_password("OldPass!23", user.password_hash)
    assert response.json()["detail"] == "Password reset successful. Please sign in."


def test_auth_reset_password_rejects_expired_token(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, email="leo@patil.local", employee_code="EMP-1313", password="OldPass!23")
    token = create_password_reset_token(user, expires_delta=timedelta(minutes=-5))

    response = client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": token,
            "password": "NewPass!45",
            "confirm_password": "NewPass!45",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "This password reset link is invalid or expired."


def test_auth_reset_password_rejects_invalid_token(client: TestClient, db_session: Session) -> None:
    _make_user(db_session, email="maya@patil.local", employee_code="EMP-1414", password="OldPass!23")

    response = client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": "not-a-real-token",
            "password": "NewPass!45",
            "confirm_password": "NewPass!45",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "This password reset link is invalid or expired."
