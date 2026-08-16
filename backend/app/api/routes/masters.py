from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas.masters import (
    DepartmentListResponse,
    DepartmentResponse,
    LineCreateRequest,
    LineListResponse,
    LineResponse,
    MachineCreateRequest,
    MachineListResponse,
    MachineResponse,
    MachineStatusCreateRequest,
    MachineStatusListResponse,
    MachineStatusResponse,
    MachineTypeCreateRequest,
    MachineTypeListResponse,
    MachineTypeResponse,
    OperatorListResponse,
    OperatorResponse,
    PartListResponse,
    PartResponse,
    PlantCreateRequest,
    PlantListResponse,
    PlantResponse,
    ShiftListResponse,
    ShiftResponse,
)
from app.core.rbac import require_permission
from app.db.session import get_db
from app.models.department import Department
from app.models.line import Line
from app.models.machine import Machine
from app.models.machine_status import MachineStatus
from app.models.machine_type import MachineType
from app.models.operator import Operator
from app.models.part import Part
from app.models.plant import Plant
from app.models.shift import Shift

router = APIRouter(prefix="/api/v1", tags=["masters"])


def _detail(message: str) -> str:
    return message


@router.get(
    "/plants",
    response_model=PlantListResponse,
    dependencies=[Depends(require_permission("masters", "READ"))],
    summary="List plants",
)
def list_plants(db: Session = Depends(get_db)) -> PlantListResponse:
    plants = db.scalars(select(Plant).order_by(Plant.code)).all()
    return PlantListResponse(
        items=[PlantResponse.model_validate(p) for p in plants],
        count=len(plants),
    )


@router.get(
    "/departments",
    response_model=DepartmentListResponse,
    dependencies=[Depends(require_permission("masters", "READ"))],
    summary="List departments",
)
def list_departments(db: Session = Depends(get_db)) -> DepartmentListResponse:
    rows = db.scalars(select(Department).order_by(Department.code)).all()
    return DepartmentListResponse(
        items=[DepartmentResponse.model_validate(d) for d in rows],
        count=len(rows),
    )


@router.get(
    "/lines",
    response_model=LineListResponse,
    dependencies=[Depends(require_permission("masters", "READ"))],
    summary="List lines",
)
def list_lines(
    plant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
) -> LineListResponse:
    stmt = select(Line)
    if plant_id is not None:
        if db.get(Plant, plant_id) is None:
            raise HTTPException(
                status_code=404,
                detail=_detail("Plant not found"),
            )
        stmt = stmt.where(Line.plant_id == plant_id)
    rows = db.scalars(stmt.order_by(Line.code)).all()
    return LineListResponse(
        items=[LineResponse.model_validate(r) for r in rows],
        count=len(rows),
    )


@router.get(
    "/machines",
    response_model=MachineListResponse,
    dependencies=[Depends(require_permission("masters", "READ"))],
    summary="List machines",
)
def list_machines(
    line_id: UUID | None = Query(default=None),
    plant_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
) -> MachineListResponse:
    if line_id is not None:
        if db.get(Line, line_id) is None:
            raise HTTPException(
                status_code=404,
                detail=_detail("Line not found"),
            )
        stmt = select(Machine).where(Machine.line_id == line_id)
    elif plant_id is not None:
        if db.get(Plant, plant_id) is None:
            raise HTTPException(
                status_code=404,
                detail=_detail("Plant not found"),
            )
        stmt = select(Machine).where(Machine.plant_id == plant_id)
    else:
        stmt = select(Machine)

    rows = db.scalars(stmt.order_by(Machine.code)).all()
    items = [
        MachineResponse(
            id=m.id,
            code=m.code,
            name=m.name,
            plant_id=m.plant_id,
            line_id=m.line_id,
            status_id=m.status_id,
            status_code=m.status.code if m.status else None,
            status_name=m.status.name if m.status else None,
            status_is_active=m.status.is_active if m.status else None,
        )
        for m in rows
    ]
    return MachineListResponse(items=items, count=len(items))


@router.get(
    "/parts",
    response_model=PartListResponse,
    dependencies=[Depends(require_permission("masters", "READ"))],
    summary="List parts",
)
def list_parts(db: Session = Depends(get_db)) -> PartListResponse:
    rows = db.scalars(select(Part).order_by(Part.code)).all()
    return PartListResponse(
        items=[PartResponse.model_validate(r) for r in rows],
        count=len(rows),
    )


@router.get(
    "/shifts",
    response_model=ShiftListResponse,
    dependencies=[Depends(require_permission("masters", "READ"))],
    summary="List shifts",
)
def list_shifts(db: Session = Depends(get_db)) -> ShiftListResponse:
    rows = db.scalars(select(Shift).order_by(Shift.code)).all()
    return ShiftListResponse(
        items=[ShiftResponse.model_validate(r) for r in rows],
        count=len(rows),
    )


@router.get(
    "/operators",
    response_model=OperatorListResponse,
    dependencies=[Depends(require_permission("masters", "READ"))],
    summary="List operators",
)
def list_operators(db: Session = Depends(get_db)) -> OperatorListResponse:
    rows = db.scalars(select(Operator).order_by(Operator.name, Operator.employee_code)).all()
    return OperatorListResponse(
        items=[OperatorResponse.model_validate(r) for r in rows],
        count=len(rows),
    )


# ============================================================================
# CREATE / WRITE ENDPOINTS
# ============================================================================


@router.post(
    "/plants",
    response_model=PlantResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("masters", "CREATE"))],
    summary="Create a new plant",
)
def create_plant(payload: PlantCreateRequest, db: Session = Depends(get_db)) -> PlantResponse:
    """Create a new plant.
    
    Returns 400 if code is empty.
    Returns 409 if code already exists.
    """
    code = (payload.code or "").strip()
    name = (payload.name or "").strip()
    timezone = (payload.timezone or "").strip() or "UTC"
    
    if not code:
        raise HTTPException(status_code=400, detail=_detail("Plant code is required"))
    if not name:
        raise HTTPException(status_code=400, detail=_detail("Plant name is required"))
    
    # Check for duplicate code
    existing = db.scalar(select(Plant).where(func.lower(Plant.code) == code.lower()))
    if existing is not None:
        raise HTTPException(status_code=409, detail=_detail("Plant code already exists"))
    
    plant = Plant(code=code, name=name, timezone=timezone, is_active=True)
    db.add(plant)
    db.flush()
    return PlantResponse.model_validate(plant)


@router.post(
    "/lines",
    response_model=LineResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("masters", "CREATE"))],
    summary="Create a new line",
)
def create_line(payload: LineCreateRequest, db: Session = Depends(get_db)) -> LineResponse:
    """Create a new line under a plant.
    
    Returns 404 if plant_id does not exist.
    Returns 400 if code or name is empty.
    Returns 409 if line code already exists for that plant.
    """
    code = (payload.code or "").strip()
    name = (payload.name or "").strip()
    plant_id = payload.plant_id
    
    if not code:
        raise HTTPException(status_code=400, detail=_detail("Line code is required"))
    if not name:
        raise HTTPException(status_code=400, detail=_detail("Line name is required"))
    
    # Validate plant exists
    plant = db.get(Plant, plant_id)
    if plant is None:
        raise HTTPException(status_code=404, detail=_detail("Plant not found"))
    
    # Check for duplicate code within this plant
    existing = db.scalar(
        select(Line).where(
            Line.plant_id == plant_id,
            func.lower(Line.code) == code.lower(),
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail=_detail("Line code already exists for this plant"))
    
    line = Line(plant_id=plant_id, code=code, name=name)
    db.add(line)
    db.flush()
    return LineResponse.model_validate(line)


@router.get(
    "/machine-types",
    response_model=MachineTypeListResponse,
    dependencies=[Depends(require_permission("masters", "READ"))],
    summary="List machine types",
)
def list_machine_types(db: Session = Depends(get_db)) -> MachineTypeListResponse:
    """List all machine types."""
    rows = db.scalars(select(MachineType).order_by(MachineType.code)).all()
    return MachineTypeListResponse(
        items=[MachineTypeResponse.model_validate(r) for r in rows],
        count=len(rows),
    )


@router.post(
    "/machine-types",
    response_model=MachineTypeResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("masters", "CREATE"))],
    summary="Create a new machine type",
)
def create_machine_type(payload: MachineTypeCreateRequest, db: Session = Depends(get_db)) -> MachineTypeResponse:
    """Create a new machine type.
    
    Returns 400 if code or name is empty.
    Returns 409 if code already exists.
    """
    code = (payload.code or "").strip()
    name = (payload.name or "").strip()
    
    if not code:
        raise HTTPException(status_code=400, detail=_detail("Machine type code is required"))
    if not name:
        raise HTTPException(status_code=400, detail=_detail("Machine type name is required"))
    
    # Check for duplicate code
    existing = db.scalar(select(MachineType).where(func.lower(MachineType.code) == code.lower()))
    if existing is not None:
        raise HTTPException(status_code=409, detail=_detail("Machine type code already exists"))
    
    mtype = MachineType(code=code, name=name, is_active=True)
    db.add(mtype)
    db.flush()
    return MachineTypeResponse.model_validate(mtype)


@router.get(
    "/machine-statuses",
    response_model=MachineStatusListResponse,
    dependencies=[Depends(require_permission("masters", "READ"))],
    summary="List machine statuses",
)
def list_machine_statuses(db: Session = Depends(get_db)) -> MachineStatusListResponse:
    """List all machine statuses."""
    rows = db.scalars(select(MachineStatus).order_by(MachineStatus.code)).all()
    return MachineStatusListResponse(
        items=[MachineStatusResponse.model_validate(r) for r in rows],
        count=len(rows),
    )


@router.post(
    "/machine-statuses",
    response_model=MachineStatusResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("masters", "CREATE"))],
    summary="Create a new machine status",
)
def create_machine_status(payload: MachineStatusCreateRequest, db: Session = Depends(get_db)) -> MachineStatusResponse:
    """Create a new machine status.
    
    Returns 400 if code or name is empty.
    Returns 409 if code already exists.
    """
    code = (payload.code or "").strip()
    name = (payload.name or "").strip()
    
    if not code:
        raise HTTPException(status_code=400, detail=_detail("Machine status code is required"))
    if not name:
        raise HTTPException(status_code=400, detail=_detail("Machine status name is required"))
    
    # Check for duplicate code
    existing = db.scalar(select(MachineStatus).where(func.lower(MachineStatus.code) == code.lower()))
    if existing is not None:
        raise HTTPException(status_code=409, detail=_detail("Machine status code already exists"))
    
    status_obj = MachineStatus(code=code, name=name, is_active=True)
    db.add(status_obj)
    db.flush()
    return MachineStatusResponse.model_validate(status_obj)


@router.post(
    "/machines",
    response_model=MachineResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("masters", "CREATE"))],
    summary="Create a new machine",
)
def create_machine(payload: MachineCreateRequest, db: Session = Depends(get_db)) -> MachineResponse:
    """Create a new machine under a plant (and optionally a line).
    
    Returns 404 if plant_id, line_id, machine_type_id, or status_id does not exist.
    Returns 400 if code or name is empty, or if line does not belong to plant.
    Returns 409 if code already exists for that plant.
    """
    code = (payload.code or "").strip()
    name = (payload.name or "").strip()
    plant_id = payload.plant_id
    line_id = payload.line_id
    machine_type_id = payload.machine_type_id
    status_id = payload.status_id
    
    if not code:
        raise HTTPException(status_code=400, detail=_detail("Machine code is required"))
    if not name:
        raise HTTPException(status_code=400, detail=_detail("Machine name is required"))
    
    # Validate plant exists
    plant = db.get(Plant, plant_id)
    if plant is None:
        raise HTTPException(status_code=404, detail=_detail("Plant not found"))
    
    # Validate line if provided
    if line_id is not None:
        line = db.get(Line, line_id)
        if line is None:
            raise HTTPException(status_code=404, detail=_detail("Line not found"))
        # Verify line belongs to this plant
        if line.plant_id != plant_id:
            raise HTTPException(status_code=400, detail=_detail("Line does not belong to the selected plant"))
    
    # Validate machine type exists
    mtype = db.get(MachineType, machine_type_id)
    if mtype is None:
        raise HTTPException(status_code=404, detail=_detail("Machine type not found"))
    
    # Validate machine status exists
    mstatus = db.get(MachineStatus, status_id)
    if mstatus is None:
        raise HTTPException(status_code=404, detail=_detail("Machine status not found"))
    
    # Check for duplicate code within this plant
    existing = db.scalar(
        select(Machine).where(
            Machine.plant_id == plant_id,
            func.lower(Machine.code) == code.lower(),
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail=_detail("Machine code already exists for this plant"))
    
    machine = Machine(
        plant_id=plant_id,
        line_id=line_id,
        code=code,
        name=name,
        machine_type_id=machine_type_id,
        status_id=status_id,
        ideal_cycle_time_sec=payload.ideal_cycle_time_sec,
    )
    db.add(machine)
    db.flush()
    
    # Reload with relationships for response
    db.refresh(machine)
    return MachineResponse(
        id=machine.id,
        code=machine.code,
        name=machine.name,
        plant_id=machine.plant_id,
        line_id=machine.line_id,
        status_id=machine.status_id,
        status_code=machine.status.code if machine.status else None,
        status_name=machine.status.name if machine.status else None,
        status_is_active=machine.status.is_active if machine.status else None,
    )
