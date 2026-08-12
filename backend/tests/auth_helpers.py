from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import seed_role_catalog
from app.core.security import create_access_token, hash_password
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole


def make_auth_headers(
    db_session: Session,
    *,
    role_code: str = "VIEWER",
    plant_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    email: str | None = None,
    employee_code: str | None = None,
) -> tuple[User, dict[str, str]]:
    seed_role_catalog(db_session)
    role = db_session.scalar(select(Role).where(Role.code == role_code))
    if role is None:
        raise ValueError(f"Role not found: {role_code}")

    uid = uuid.uuid4().hex[:8]
    user = User(
        email=email or f"{uid}@patil.local",
        employee_code=employee_code or f"EMP-{uid}",
        password_hash=hash_password("Password@123"),
        is_active=True,
        plant_id=plant_id,
        department_id=department_id,
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserRole(user_id=user.id, role_id=role.id))
    db_session.flush()

    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        employee_code=user.employee_code,
    )
    return user, {"Authorization": f"Bearer {token}"}
