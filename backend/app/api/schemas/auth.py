from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    email_or_employee_code: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email_or_employee_code: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str
    confirm_password: str


class GenericResponse(BaseModel):
    detail: str


class UserAuthResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    email: str
    plant_id: UUID | None = None
    department_id: UUID | None = None
    is_active: bool
    roles: list[str] = []
    permissions: list[str] = []


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserAuthResponse


class AuthenticatedUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    email: str
    plant_id: UUID | None = None
    department_id: UUID | None = None
    is_active: bool
    roles: list[str] = []
    permissions: list[str] = []
