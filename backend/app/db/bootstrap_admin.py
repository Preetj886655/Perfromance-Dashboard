from __future__ import annotations

import os
import secrets
import sys
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.rbac import seed_role_catalog
from app.core.security import hash_password
from app.db.session import get_session_factory
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _normalize_employee_code(employee_code: str) -> str:
    return (employee_code or "").strip()


def _read_required(env_var: str) -> str:
    value = (os.getenv(env_var) or "").strip()
    if not value:
        raise ValueError(f"{env_var} is required.")
    return value


def ensure_super_admin(
    db: Session,
    *,
    email: str,
    employee_code: str,
    password: str,
) -> bool:
    """Ensure exactly one SUPER_ADMIN exists; create it only when none exists.

    Returns True when a new SUPER_ADMIN was created and False when one already exists.
    """
    normalized_email = _normalize_email(email)
    normalized_employee_code = _normalize_employee_code(employee_code)

    if not normalized_email:
        raise ValueError("Email is required.")
    if not normalized_employee_code:
        raise ValueError("Employee code is required.")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")

    seed_role_catalog(db)

    super_admin_role = db.scalar(select(Role).where(Role.code == "SUPER_ADMIN"))
    if super_admin_role is None:
        raise RuntimeError("SUPER_ADMIN role is missing from the role catalog.")

    existing_super_admin = db.scalar(
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .where(UserRole.role_id == super_admin_role.id)
        .limit(1)
    )
    if existing_super_admin is not None:
        return False

    if db.scalar(select(User).where(func.lower(User.email) == normalized_email)) is not None:
        raise ValueError("A user with this email already exists.")

    if db.scalar(
        select(User).where(func.lower(User.employee_code) == normalized_employee_code.lower())
    ) is not None:
        raise ValueError("A user with this employee code already exists.")

    user = User(
        employee_code=normalized_employee_code,
        email=normalized_email,
        password_hash=hash_password(password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=super_admin_role.id))
    db.flush()
    return True


def main(argv: Sequence[str] | None = None) -> int:
    _ = argv
    email = _read_required("APP_BOOTSTRAP_EMAIL")
    employee_code = _read_required("APP_BOOTSTRAP_EMPLOYEE_CODE")
    password = os.getenv("APP_BOOTSTRAP_PASSWORD") or secrets.token_urlsafe(16)

    try:
        session_factory = get_session_factory()
        with session_factory() as db:
            created = ensure_super_admin(
                db,
                email=email,
                employee_code=employee_code,
                password=password,
            )
            if created:
                db.commit()
                print("SUPER_ADMIN created successfully.")
                # Do not print the password or other secrets.
                return 0

            db.rollback()
            print("SUPER_ADMIN already exists; no changes made.")
            return 0
    except ValueError as exc:
        print(f"Bootstrap failed: {exc}")
        return 1
    except Exception as exc:  # pragma: no cover - runtime safety guard
        print(f"Bootstrap failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
