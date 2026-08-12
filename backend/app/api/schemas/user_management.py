from __future__ import annotations

from uuid import UUID

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RoleSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    is_active: bool


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    email: str
    plant_id: UUID | None = None
    department_id: UUID | None = None
    is_active: bool
    roles: list[RoleSummaryResponse] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class UserListResponse(BaseModel):
    items: list[UserResponse]
    count: int


class UserCreateRequest(BaseModel):
    employee_code: str
    email: str
    password: str
    plant_id: UUID | None = None
    department_id: UUID | None = None
    role_codes: list[str] = Field(default_factory=list)


class UserUpdateRequest(BaseModel):
    employee_code: str | None = None
    email: str | None = None
    plant_id: UUID | None = None
    department_id: UUID | None = None
    is_active: bool | None = None
    role_codes: list[str] | None = None


class UserAssignRolesRequest(BaseModel):
    role_codes: list[str]


class UserAssignPlantRequest(BaseModel):
    plant_id: UUID | None = None


class UserAssignDepartmentRequest(BaseModel):
    department_id: UUID | None = None
