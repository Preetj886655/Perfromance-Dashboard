from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas.user_management import (
    RoleSummaryResponse,
    UserAssignDepartmentRequest,
    UserAssignPlantRequest,
    UserAssignRolesRequest,
    UserCreateRequest,
    UserListResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.core.rbac import require_permission, seed_role_catalog
from app.core.security import hash_password
from app.db.session import get_db
from app.models.department import Department
from app.models.plant import Plant
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole

router = APIRouter(prefix="/api/v1", tags=["users"])


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _normalize_employee_code(code: str) -> str:
    return (code or "").strip()


def _validate_targets(db: Session, *, plant_id: UUID | None, department_id: UUID | None) -> None:
    if plant_id is not None and db.get(Plant, plant_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plant not found")
    if department_id is not None and db.get(Department, department_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")


def _role_by_code(db: Session, code: str) -> Role:
    role = db.scalar(select(Role).where(func.lower(Role.code) == code.strip().lower()))
    if role is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role: {code}")
    return role


def _serialize_user(db: Session, user: User) -> UserResponse:
    roles = db.scalars(
        select(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id)
        .order_by(Role.name)
    ).all()
    return UserResponse(
        id=user.id,
        employee_code=user.employee_code,
        email=user.email,
        plant_id=user.plant_id,
        department_id=user.department_id,
        is_active=user.is_active,
        roles=[RoleSummaryResponse.model_validate(role) for role in roles],
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get(
    "/users",
    response_model=UserListResponse,
    dependencies=[Depends(require_permission("users", "MANAGE"))],
    summary="List users",
)
def list_users(db: Session = Depends(get_db)) -> UserListResponse:
    seed_role_catalog(db)
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return UserListResponse(items=[_serialize_user(db, user) for user in users], count=len(users))


@router.get(
    "/users/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(require_permission("users", "MANAGE"))],
    summary="Get a user",
)
def get_user(user_id: UUID = Path(...), db: Session = Depends(get_db)) -> UserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _serialize_user(db, user)


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("users", "MANAGE"))],
    summary="Create a user",
)
def create_user(payload: UserCreateRequest, db: Session = Depends(get_db)) -> UserResponse:
    seed_role_catalog(db)
    employee_code = _normalize_employee_code(payload.employee_code)
    email = _normalize_email(payload.email)
    if not employee_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="employee_code is required")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email is required")
    if not payload.password or len(payload.password.strip()) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
    _validate_targets(db, plant_id=payload.plant_id, department_id=payload.department_id)

    if db.scalar(select(User).where(func.lower(User.employee_code) == employee_code.lower())) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee code already exists")
    if db.scalar(select(User).where(func.lower(User.email) == email)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

    user = User(
        employee_code=employee_code,
        email=email,
        password_hash=hash_password(payload.password),
        plant_id=payload.plant_id,
        department_id=payload.department_id,
        is_active=True,
    )
    db.add(user)
    db.flush()

    for role_code in payload.role_codes:
        role = _role_by_code(db, role_code)
        existing = db.scalar(select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id))
        if existing is None:
            db.add(UserRole(user_id=user.id, role_id=role.id))

    db.flush()
    return _serialize_user(db, user)


@router.patch(
    "/users/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(require_permission("users", "MANAGE"))],
    summary="Update a user",
)
def update_user(
    payload: UserUpdateRequest,
    user_id: UUID = Path(...),
    db: Session = Depends(get_db),
) -> UserResponse:
    seed_role_catalog(db)
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.employee_code is not None:
        employee_code = _normalize_employee_code(payload.employee_code)
        if not employee_code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="employee_code cannot be blank")
        if db.scalar(
            select(User).where(
                func.lower(User.employee_code) == employee_code.lower(),
                User.id != user.id,
            )
        ) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee code already exists")
        user.employee_code = employee_code

    if payload.email is not None:
        email = _normalize_email(payload.email)
        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email cannot be blank")
        if db.scalar(select(User).where(func.lower(User.email) == email, User.id != user.id)) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
        user.email = email

    if payload.plant_id is not None or payload.department_id is not None:
        _validate_targets(
            db,
            plant_id=payload.plant_id if payload.plant_id is not None else user.plant_id,
            department_id=payload.department_id if payload.department_id is not None else user.department_id,
        )

    if payload.plant_id is not None:
        user.plant_id = payload.plant_id
    if payload.department_id is not None:
        user.department_id = payload.department_id
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role_codes is not None:
        db.execute(select(UserRole).where(UserRole.user_id == user.id)).scalar()
        db.query(UserRole).filter(UserRole.user_id == user.id).delete()
        for role_code in payload.role_codes:
            role = _role_by_code(db, role_code)
            db.add(UserRole(user_id=user.id, role_id=role.id))

    db.flush()
    return _serialize_user(db, user)


@router.post(
    "/users/{user_id}/activate",
    response_model=UserResponse,
    dependencies=[Depends(require_permission("users", "MANAGE"))],
    summary="Activate a user",
)
def activate_user(user_id: UUID = Path(...), db: Session = Depends(get_db)) -> UserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = True
    db.flush()
    return _serialize_user(db, user)


@router.post(
    "/users/{user_id}/deactivate",
    response_model=UserResponse,
    dependencies=[Depends(require_permission("users", "MANAGE"))],
    summary="Deactivate a user",
)
def deactivate_user(user_id: UUID = Path(...), db: Session = Depends(get_db)) -> UserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = False
    db.flush()
    return _serialize_user(db, user)


@router.post(
    "/users/{user_id}/roles",
    response_model=UserResponse,
    dependencies=[Depends(require_permission("users", "MANAGE"))],
    summary="Assign roles to a user",
)
def assign_user_roles(
    payload: UserAssignRolesRequest,
    user_id: UUID = Path(...),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    for role_code in payload.role_codes:
        _role_by_code(db, role_code)

    db.query(UserRole).filter(UserRole.user_id == user.id).delete()
    for role_code in payload.role_codes:
        role = _role_by_code(db, role_code)
        db.add(UserRole(user_id=user.id, role_id=role.id))
    db.flush()
    return _serialize_user(db, user)


@router.delete(
    "/users/{user_id}/roles/{role_id}",
    response_model=UserResponse,
    dependencies=[Depends(require_permission("users", "MANAGE"))],
    summary="Remove a user role",
)
def remove_user_role(user_id: UUID = Path(...), role_id: UUID = Path(...), db: Session = Depends(get_db)) -> UserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    db.query(UserRole).filter(UserRole.user_id == user.id, UserRole.role_id == role.id).delete()
    db.flush()
    return _serialize_user(db, user)


@router.patch(
    "/users/{user_id}/plant",
    response_model=UserResponse,
    dependencies=[Depends(require_permission("users", "MANAGE"))],
    summary="Assign a plant to a user",
)
def assign_user_plant(
    payload: UserAssignPlantRequest,
    user_id: UUID = Path(...),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _validate_targets(db, plant_id=payload.plant_id, department_id=user.department_id)
    user.plant_id = payload.plant_id
    db.flush()
    return _serialize_user(db, user)


@router.patch(
    "/users/{user_id}/department",
    response_model=UserResponse,
    dependencies=[Depends(require_permission("users", "MANAGE"))],
    summary="Assign a department to a user",
)
def assign_user_department(
    payload: UserAssignDepartmentRequest,
    user_id: UUID = Path(...),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _validate_targets(db, plant_id=user.plant_id, department_id=payload.department_id)
    user.department_id = payload.department_id
    db.flush()
    return _serialize_user(db, user)
