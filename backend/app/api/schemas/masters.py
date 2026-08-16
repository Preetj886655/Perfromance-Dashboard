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


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str


class DepartmentListResponse(BaseModel):
    items: list[DepartmentResponse]
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


# ============================================================================
# CREATE REQUEST SCHEMAS (write operations)
# ============================================================================


class PlantCreateRequest(BaseModel):
    """Request to create a new plant."""

    code: str
    name: str
    timezone: str = "UTC"


class LineCreateRequest(BaseModel):
    """Request to create a new line under a plant."""

    plant_id: UUID
    code: str
    name: str


class MachineTypeResponse(BaseModel):
    """Machine type lookup item."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    is_active: bool


class MachineTypeListResponse(BaseModel):
    items: list[MachineTypeResponse]
    count: int


class MachineTypeCreateRequest(BaseModel):
    """Request to create a new machine type."""

    code: str
    name: str


class MachineStatusResponse(BaseModel):
    """Machine status lookup item."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    is_active: bool


class MachineStatusListResponse(BaseModel):
    items: list[MachineStatusResponse]
    count: int


class MachineStatusCreateRequest(BaseModel):
    """Request to create a new machine status."""

    code: str
    name: str


class MachineCreateRequest(BaseModel):
    """Request to create a new machine under a line."""

    plant_id: UUID
    line_id: UUID | None = None
    code: str
    name: str
    machine_type_id: UUID
    status_id: UUID
    ideal_cycle_time_sec: float | None = None
