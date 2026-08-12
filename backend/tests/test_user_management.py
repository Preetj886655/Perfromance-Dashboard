from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import seed_role_catalog
from app.core.security import hash_password, verify_password
from app.db.session import get_db, get_engine
from app.main import app
from app.models.department import Department
from app.models.plant import Plant
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole
from tests.auth_helpers import make_auth_headers


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


def _plant(db: Session, code: str = "PLN-001", name: str = "Plant Alpha") -> Plant:
    plant = db.scalar(select(Plant).where(Plant.code == code))
    if plant is None:
        plant = Plant(code=code, name=name, timezone="Asia/Kolkata", is_active=True)
        db.add(plant)
        db.flush()
    return plant


def _department(db: Session, code: str = "ENG", name: str = "Engineering") -> Department:
    department = db.scalar(select(Department).where(Department.code == code))
    if department is None:
        department = Department(code=code, name=name)
        db.add(department)
        db.flush()
    return department


def _role(db: Session, code: str) -> Role:
    seed_role_catalog(db)
    role = db.scalar(select(Role).where(Role.code == code))
    if role is None:
        raise AssertionError(f"role not found: {code}")
    return role


def _user_headers(db: Session, role_code: str = "SUPER_ADMIN"):
    return make_auth_headers(db_session=db, role_code=role_code)


def test_user_management_admin_can_list_users(client: TestClient, db_session: Session) -> None:
    _, headers = _user_headers(db_session, "SUPER_ADMIN")
    response = client.get("/api/v1/users", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert "items" in payload


def test_user_management_viewer_forbidden(client: TestClient, db_session: Session) -> None:
    _, headers = _user_headers(db_session, "VIEWER")
    response = client.get("/api/v1/users", headers=headers)
    assert response.status_code == 403


def test_user_management_unauthenticated_401(client: TestClient) -> None:
    response = client.get("/api/v1/users")
    assert response.status_code == 401


def test_user_management_create_user(client: TestClient, db_session: Session) -> None:
    _, headers = _user_headers(db_session, "SUPER_ADMIN")
    payload = {
        "employee_code": "EMP-USER-001",
        "email": "user001@patil.local",
        "password": "Password@123",
        "plant_id": str(_plant(db_session).id),
        "department_id": str(_department(db_session, "MFG", "Manufacturing").id),
        "role_codes": ["VIEWER"],
    }
    response = client.post("/api/v1/users", json=payload, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["employee_code"] == "EMP-USER-001"
    assert body["email"] == "user001@patil.local"
    assert "password_hash" not in body
    assert body["is_active"] is True


def test_user_management_update_user(client: TestClient, db_session: Session) -> None:
    _, headers = _user_headers(db_session, "SUPER_ADMIN")
    user = User(
        employee_code="EMP-UPDATE-101",
        email="update101@patil.local",
        password_hash=hash_password("Password@123"),
        is_active=True,
        plant_id=_plant(db_session, "PLN-UPDATE", "Plant Update").id,
        department_id=_department(db_session, "QA", "Quality").id,
    )
    db_session.add(user)
    db_session.flush()
    response = client.patch(f"/api/v1/users/{user.id}", json={"employee_code": "EMP-UPDATE-202", "email": "update202@patil.local"}, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["employee_code"] == "EMP-UPDATE-202"
    assert body["email"] == "update202@patil.local"


def test_user_management_deactivate_reactivate(client: TestClient, db_session: Session) -> None:
    _, headers = _user_headers(db_session, "SUPER_ADMIN")
    user = User(
        employee_code="EMP-ACT-001",
        email="act001@patil.local",
        password_hash=hash_password("Password@123"),
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()

    deactivate = client.post(f"/api/v1/users/{user.id}/deactivate", headers=headers)
    assert deactivate.status_code == 200
    assert deactivate.json()["is_active"] is False

    reactivate = client.post(f"/api/v1/users/{user.id}/activate", headers=headers)
    assert reactivate.status_code == 200
    assert reactivate.json()["is_active"] is True


def test_user_management_assign_roles_and_remove_role(client: TestClient, db_session: Session) -> None:
    _, headers = _user_headers(db_session, "SUPER_ADMIN")
    user = User(
        employee_code="EMP-JOB-001",
        email="job001@patil.local",
        password_hash=hash_password("Password@123"),
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()

    assign = client.post(f"/api/v1/users/{user.id}/roles", json={"role_codes": ["VIEWER", "SUPERVISOR"]}, headers=headers)
    assert assign.status_code == 200
    payload = assign.json()
    assert {item["code"] for item in payload["roles"]} == {"VIEWER", "SUPERVISOR"}

    remove = client.delete(f"/api/v1/users/{user.id}/roles/{_role(db_session, 'VIEWER').id}", headers=headers)
    assert remove.status_code == 200
    assert "VIEWER" not in {item["code"] for item in remove.json()["roles"]}


def test_user_management_assign_plant_and_department(client: TestClient, db_session: Session) -> None:
    _, headers = _user_headers(db_session, "SUPER_ADMIN")
    user = User(
        employee_code="EMP-SCOPE-001",
        email="scope001@patil.local",
        password_hash=hash_password("Password@123"),
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()
    plant = _plant(db_session, "PLN-SCOPE", "Plant Scope")
    department = _department(db_session, "HR", "Human Resources")

    assign = client.patch(f"/api/v1/users/{user.id}/plant", json={"plant_id": str(plant.id)}, headers=headers)
    assert assign.status_code == 200
    assert assign.json()["plant_id"] == str(plant.id)

    assign_department = client.patch(f"/api/v1/users/{user.id}/department", json={"department_id": str(department.id)}, headers=headers)
    assert assign_department.status_code == 200
    assert assign_department.json()["department_id"] == str(department.id)


def test_user_management_duplicate_email_forbidden(client: TestClient, db_session: Session) -> None:
    _, headers = _user_headers(db_session, "SUPER_ADMIN")
    user = User(
        employee_code="EMP-DUP-EMAIL",
        email="duplicate@example.com",
        password_hash=hash_password("Password@123"),
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()

    response = client.post("/api/v1/users", json={
        "employee_code": "EMP-DUP-NEW",
        "email": "duplicate@example.com",
        "password": "Password@123",
    }, headers=headers)
    assert response.status_code == 409


def test_user_management_duplicate_employee_code_forbidden(client: TestClient, db_session: Session) -> None:
    _, headers = _user_headers(db_session, "SUPER_ADMIN")
    user = User(
        employee_code="EMP-DUP-EMP",
        email="dupemp@example.com",
        password_hash=hash_password("Password@123"),
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()

    response = client.post("/api/v1/users", json={
        "employee_code": "EMP-DUP-EMP",
        "email": "different@example.com",
        "password": "Password@123",
    }, headers=headers)
    assert response.status_code == 409


def test_user_management_password_is_never_exposed(client: TestClient, db_session: Session) -> None:
    _, headers = _user_headers(db_session, "SUPER_ADMIN")
    response = client.post("/api/v1/users", json={
        "employee_code": "EMP-PW-001",
        "email": "pw001@patil.local",
        "password": "Password@123",
    }, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert "password_hash" not in body
    assert "password" not in body
    assert not verify_password("Password@123", body["password_hash"]) if "password_hash" in body else True


def test_user_management_inactive_user_login_rejected(client: TestClient, db_session: Session) -> None:
    user = User(
        employee_code="EMP-INACTIVE-001",
        email="inactive001@patil.local",
        password_hash=hash_password("Password@123"),
        is_active=False,
    )
    db_session.add(user)
    db_session.flush()

    response = client.post("/api/v1/auth/login", json={
        "email_or_employee_code": "inactive001@patil.local",
        "password": "Password@123",
    })
    assert response.status_code == 401
