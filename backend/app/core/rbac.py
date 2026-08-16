from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.line import Line
from app.models.machine import Machine
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User
from app.models.user_role import UserRole

ROLE_DEFINITIONS: dict[str, str] = {
    "SUPER_ADMIN": "Super Admin",
    "MANAGEMENT": "Management",
    "PLANT_HEAD": "Plant Head",
    "DEPT_HEAD": "Department Head",
    "SUPERVISOR": "Supervisor",
    "OPERATOR": "Operator",
    "ENGINEER": "Engineer",
    "VIEWER": "Viewer",
}

ROLE_PERMISSION_MATRIX: dict[str, set[tuple[str, str]]] = {
    "SUPER_ADMIN": {
        ("dashboard", "READ"),
        ("production", "READ"),
        ("production", "UPDATE"),
        ("quality", "READ"),
        ("ppc", "READ"),
        ("maintenance", "READ"),
        ("imports", "READ"),
        ("imports", "CREATE"),
        ("masters", "READ"),
        ("masters", "CREATE"),
        ("users", "MANAGE"),
        ("reports", "READ"),
        ("reports", "EXPORT"),
    },
    "MANAGEMENT": {
        ("dashboard", "READ"),
        ("production", "READ"),
        ("quality", "READ"),
        ("ppc", "READ"),
        ("maintenance", "READ"),
        ("imports", "READ"),
        ("imports", "CREATE"),
        ("masters", "READ"),
        ("masters", "CREATE"),
        ("users", "MANAGE"),
        ("reports", "READ"),
        ("reports", "EXPORT"),
    },
    "PLANT_HEAD": {
        ("dashboard", "READ"),
        ("production", "READ"),
        ("quality", "READ"),
        ("ppc", "READ"),
        ("maintenance", "READ"),
        ("imports", "READ"),
        ("imports", "CREATE"),
        ("masters", "READ"),
        ("masters", "CREATE"),
        ("reports", "READ"),
    },
    "DEPT_HEAD": {
        ("dashboard", "READ"),
        ("production", "READ"),
        ("quality", "READ"),
        ("masters", "READ"),
        ("reports", "READ"),
    },
    "SUPERVISOR": {
        ("dashboard", "READ"),
        ("production", "READ"),
        ("production", "UPDATE"),
        ("quality", "READ"),
        ("imports", "READ"),
        ("imports", "CREATE"),
        ("masters", "READ"),
        ("masters", "CREATE"),
        ("reports", "READ"),
    },
    "OPERATOR": {
        ("dashboard", "READ"),
        ("production", "READ"),
        ("masters", "READ"),
    },
    "ENGINEER": {
        ("dashboard", "READ"),
        ("production", "READ"),
        ("maintenance", "READ"),
        ("masters", "READ"),
        ("imports", "READ"),
    },
    "VIEWER": {
        ("dashboard", "READ"),
        ("masters", "READ"),
        ("reports", "READ"),
    },
}


def _seed_role_row(db: Session, code: str) -> Role:
    role = db.scalar(select(Role).where(Role.code == code))
    if role is None:
        role = Role(code=code, name=ROLE_DEFINITIONS[code], is_active=True)
        db.add(role)
    else:
        role.name = ROLE_DEFINITIONS[code]
        role.is_active = True
    return role


def seed_role_catalog(db: Session) -> None:
    """Create or refresh the app role catalog and permission grants idempotently."""
    for code in ROLE_DEFINITIONS:
        _seed_role_row(db, code)

    db.flush()

    for code, permissions in ROLE_PERMISSION_MATRIX.items():
        role = db.scalar(select(Role).where(Role.code == code))
        if role is None:
            continue
        for module, action in permissions:
            existing = db.scalar(
                select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.module == module,
                    RolePermission.action == action,
                )
            )
            if existing is None:
                db.add(
                    RolePermission(
                        role_id=role.id,
                        module=module,
                        action=action,
                        is_allowed=True,
                    )
                )
            else:
                existing.is_allowed = True

    db.commit()


def get_user_roles(db: Session, user: User) -> list[Role]:
    rows = db.scalars(
        select(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id)
    ).all()
    return rows


def user_has_permission(db: Session, user: User, module: str, action: str) -> bool:
    roles = get_user_roles(db, user)
    if not roles:
        return False

    role_codes = {role.code for role in roles if role.is_active}
    if "SUPER_ADMIN" in role_codes:
        return True

    for role in roles:
        if not role.is_active:
            continue
        permission = db.scalar(
            select(RolePermission).where(
                RolePermission.role_id == role.id,
                RolePermission.module == module,
                RolePermission.action == action,
                RolePermission.is_allowed.is_(True),
            )
        )
        if permission is not None:
            return True
    return False


def role_codes_for_user(db: Session, user: User) -> set[str]:
    return {role.code for role in get_user_roles(db, user)}


def user_permission_codes(db: Session, user: User) -> set[str]:
    permissions: set[str] = set()
    roles = get_user_roles(db, user)
    if not roles:
        return permissions

    for role in roles:
        if not role.is_active:
            continue
        rows = db.scalars(
            select(RolePermission).where(
                RolePermission.role_id == role.id,
                RolePermission.is_allowed.is_(True),
            )
        ).all()
        for row in rows:
            permissions.add(f"{row.module}:{row.action}")
    return permissions


def enforce_scope_match(
    db: Session,
    user: User,
    *,
    plant_id: UUID | str | None = None,
    department_id: UUID | str | None = None,
) -> None:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )

    if "SUPER_ADMIN" in role_codes_for_user(db, user):
        return

    if plant_id is not None and user.plant_id is not None:
        if str(user.plant_id) != str(plant_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Plant access denied",
            )

    if department_id is not None and user.department_id is not None:
        if str(user.department_id) != str(department_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Department access denied",
            )


def require_role(*allowed_codes: str):
    def dependency(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        seed_role_catalog(db)
        if not current_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User is inactive",
            )
        roles = role_codes_for_user(db, current_user)
        if not roles.intersection(set(allowed_codes)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permissions",
            )
        return current_user

    return dependency


def require_permission(module: str, action: str):
    def dependency(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        seed_role_catalog(db)
        if not current_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )
        if not user_has_permission(db, current_user, module, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied",
            )
        return current_user

    return dependency


def enforce_user_scope_for_dashboard(
    db: Session,
    user: User,
    *,
    scope_type: str | None = None,
    scope_id: UUID | str | None = None,
    plant_id: UUID | str | None = None,
) -> None:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )

    if "SUPER_ADMIN" in role_codes_for_user(db, user):
        return

    if plant_id is not None and user.plant_id is not None and str(user.plant_id) != str(plant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Plant access denied",
        )

    if scope_type == "plant" and scope_id is not None and user.plant_id is not None:
        if str(user.plant_id) != str(scope_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Plant access denied",
            )

    if scope_type == "line" and scope_id is not None:
        line = db.get(Line, UUID(str(scope_id))) if isinstance(scope_id, str) else db.get(Line, scope_id)
        if line is not None and user.plant_id is not None and str(line.plant_id) != str(user.plant_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Plant access denied",
            )

    if scope_type == "machine" and scope_id is not None:
        machine = db.get(Machine, UUID(str(scope_id))) if isinstance(scope_id, str) else db.get(Machine, scope_id)
        if machine is not None and user.plant_id is not None and str(machine.plant_id) != str(user.plant_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Plant access denied",
            )
