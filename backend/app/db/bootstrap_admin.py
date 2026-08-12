from __future__ import annotations

import getpass
import os
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

LOCAL_BOOTSTRAP_WARNING = (
    "WARNING: This local bootstrap is for LOCAL DEVELOPMENT ONLY and creates the initial SUPER_ADMIN account."
)


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _normalize_employee_code(employee_code: str) -> str:
    return (employee_code or "").strip()


def _read_value(prompt: str, *, env_var: str | None = None, hidden: bool = False) -> str:
    value = os.getenv(env_var) if env_var else None
    if value is not None and value != "":
        return value
    if hidden:
        return getpass.getpass(prompt)
    return input(prompt)


def ensure_local_super_admin(
    db: Session,
    *,
    email: str,
    employee_code: str,
    password: str,
) -> bool:
    """Ensure exactly one local SUPER_ADMIN exists for development use.

    Returns True when a new SUPER_ADMIN was created, False when one already exists.
    """
    normalized_email = _normalize_email(email)
    normalized_employee_code = _normalize_employee_code(employee_code)

    if not normalized_email:
        raise ValueError("Email is required.")
    if not normalized_employee_code:
        raise ValueError("Employee code is required.")
    if len((password or "").strip()) < 8:
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
    print(LOCAL_BOOTSTRAP_WARNING)

    email = _read_value("Email: ", env_var="APP_BOOTSTRAP_EMAIL")
    employee_code = _read_value("Employee Code: ", env_var="APP_BOOTSTRAP_EMPLOYEE_CODE")
    password = _read_value("Password: ", env_var="APP_BOOTSTRAP_PASSWORD", hidden=True)

    try:
        session_factory = get_session_factory()
        with session_factory() as db:
            created = ensure_local_super_admin(
                db,
                email=email,
                employee_code=employee_code,
                password=password,
            )
            if created:
                db.commit()
                print("Local SUPER_ADMIN created successfully.")
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
