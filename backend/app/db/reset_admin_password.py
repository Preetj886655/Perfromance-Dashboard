from __future__ import annotations

import getpass
import os
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import get_session_factory
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole

LOCAL_RESET_WARNING = (
    "WARNING: This local admin password reset is for LOCAL DEVELOPMENT ONLY and updates an existing SUPER_ADMIN password."
)


def _read_value(prompt: str, *, env_var: str | None = None, hidden: bool = False) -> str:
    value = os.getenv(env_var) if env_var else None
    if value is not None and value != "":
        return value
    if hidden:
        return getpass.getpass(prompt)
    return input(prompt)


def reset_local_super_admin_password(db: Session, *, email: str | None = None, employee_code: str | None = None, password: str) -> bool:
    if len((password or "").strip()) < 8:
        raise ValueError("Password must be at least 8 characters long.")

    query = select(User).join(UserRole, UserRole.user_id == User.id).join(Role, Role.id == UserRole.role_id).where(Role.code == "SUPER_ADMIN")
    if email:
        query = query.where(User.email == email.strip())
    if employee_code:
        query = query.where(User.employee_code == employee_code.strip())

    user = db.scalar(query.limit(1))
    if user is None:
        raise ValueError("No SUPER_ADMIN user found for local password reset.")

    user.password_hash = hash_password(password)
    db.flush()
    return True


def main(argv: Sequence[str] | None = None) -> int:
    _ = argv
    print(LOCAL_RESET_WARNING)

    email = _read_value("SUPER_ADMIN email (leave blank to match by employee code): ", env_var="APP_RESET_ADMIN_EMAIL") or None
    employee_code = _read_value("SUPER_ADMIN employee code (leave blank to match by email): ", env_var="APP_RESET_ADMIN_EMPLOYEE_CODE") or None
    password = _read_value("New password: ", env_var="APP_RESET_ADMIN_PASSWORD", hidden=True)

    try:
        session_factory = get_session_factory()
        with session_factory() as db:
            reset_local_super_admin_password(
                db,
                email=email,
                employee_code=employee_code,
                password=password,
            )
            db.commit()
            print("Local SUPER_ADMIN password reset successfully.")
            return 0
    except ValueError as exc:
        print(f"Reset failed: {exc}")
        return 1
    except Exception as exc:  # pragma: no cover - runtime safety guard
        print(f"Reset failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
