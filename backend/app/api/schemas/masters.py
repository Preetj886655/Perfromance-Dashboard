from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PlantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    is_active: bool


class PlantListResponse(BaseModel):
    items: list[PlantResponse]
    count: int


class LineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    plant_id: UUID


class LineListResponse(BaseModel):
    items: list[LineResponse]
    count: int


class MachineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    plant_id: UUID
    line_id: UUID | None = None
    status_id: UUID | None = None
    status_code: str | None = None
    status_name: str | None = None
    status_is_active: bool | None = None


class MachineListResponse(BaseModel):
    items: list[MachineResponse]
    count: int


class PartResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str


class PartListResponse(BaseModel):
    items: list[PartResponse]
    count: int


class ShiftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    plant_id: UUID


class ShiftListResponse(BaseModel):
    items: list[ShiftResponse]
    count: int


class OperatorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    name: str
    department_id: UUID | None = None


class OperatorListResponse(BaseModel):
    items: list[OperatorResponse]
    count: int
