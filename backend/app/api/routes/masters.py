from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas.masters import (
    LineListResponse,
    LineResponse,
    MachineListResponse,
    MachineResponse,
    OperatorListResponse,
    OperatorResponse,
    PartListResponse,
    PartResponse,
    PlantListResponse,
    PlantResponse,
    ShiftListResponse,
    ShiftResponse,
)
from app.core.rbac import require_permission
from app.db.session import get_db
from app.models.line import Line
from app.models.machine import Machine
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
