"""Production record inspection APIs — development/internal (no auth yet).

RAW record, row-level metrics, and downtime/rejection events only.
No rollups, no calculated OEE fields on the raw endpoint.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas.production_records import (
    DowntimeEventResponse,
    ProductionRecordEventsResponse,
    ProductionRecordMetricsResponse,
    ProductionRecordRawResponse,
    RejectionEventResponse,
)
from app.core.rbac import require_permission
from app.db.session import get_db
from app.models.downtime_event import DowntimeEvent
from app.models.production_record import ProductionRecord
from app.models.production_record_metrics import ProductionRecordMetrics
from app.models.rejection_event import RejectionEvent

router = APIRouter(
    prefix="/api/v1",
    tags=["production-records"],
)


def _safe_detail(message: str) -> str:
    return message


@router.get(
    "/production-records/{production_record_id}",
    response_model=ProductionRecordRawResponse,
    dependencies=[Depends(require_permission("production", "READ"))],
    summary="Get RAW production record",
    description=(
        "Development/internal — authentication not yet implemented. "
        "Returns raw fields and lineage only; calculated OEE via /metrics."
    ),
    responses={
        404: {"description": "Production record not found"},
        500: {"description": "Unexpected server error"},
    },
)
def get_production_record(
    production_record_id: UUID,
    db: Session = Depends(get_db),
) -> ProductionRecordRawResponse:
    record = db.get(ProductionRecord, production_record_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=_safe_detail("Production record not found"),
        )
    return ProductionRecordRawResponse.model_validate(record)


@router.get(
    "/production-records/{production_record_id}/metrics",
    response_model=ProductionRecordMetricsResponse,
    dependencies=[Depends(require_permission("production", "READ"))],
    summary="Get row-level OEE metrics",
    description=(
        "Development/internal — authentication not yet implemented. "
        "SQL NULL values are returned as JSON null (not coerced to zero)."
    ),
    responses={
        404: {"description": "Production record or metrics not found"},
        500: {"description": "Unexpected server error"},
    },
)
def get_production_record_metrics(
    production_record_id: UUID,
    db: Session = Depends(get_db),
) -> ProductionRecordMetricsResponse:
    record = db.get(ProductionRecord, production_record_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=_safe_detail("Production record not found"),
        )
    metrics = db.get(ProductionRecordMetrics, production_record_id)
    if metrics is None:
        raise HTTPException(
            status_code=404,
            detail=_safe_detail("Metrics not found for production record"),
        )
    return ProductionRecordMetricsResponse.model_validate(metrics)


@router.get(
    "/production-records/{production_record_id}/events",
    response_model=ProductionRecordEventsResponse,
    dependencies=[Depends(require_permission("production", "READ"))],
    summary="Get downtime and rejection events",
    description=(
        "Development/internal — authentication not yet implemented. "
        "Returns downtime_events and rejection_events as separate collections."
    ),
    responses={
        404: {"description": "Production record not found"},
        500: {"description": "Unexpected server error"},
    },
)
def get_production_record_events(
    production_record_id: UUID,
    db: Session = Depends(get_db),
) -> ProductionRecordEventsResponse:
    record = db.get(ProductionRecord, production_record_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=_safe_detail("Production record not found"),
        )

    downtime = db.scalars(
        select(DowntimeEvent)
        .where(DowntimeEvent.production_record_id == production_record_id)
        .order_by(DowntimeEvent.created_at, DowntimeEvent.id)
    ).all()
    rejection = db.scalars(
        select(RejectionEvent)
        .where(RejectionEvent.production_record_id == production_record_id)
        .order_by(RejectionEvent.created_at, RejectionEvent.id)
    ).all()

    return ProductionRecordEventsResponse(
        downtime_events=[DowntimeEventResponse.model_validate(e) for e in downtime],
        rejection_events=[RejectionEventResponse.model_validate(e) for e in rejection],
    )
