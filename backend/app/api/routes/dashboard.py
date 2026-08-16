"""Dashboard OEE APIs — read-only over ``oee_snapshots`` (development/internal).

Never recalculates OEE or calls rollup. ``machine_utilisation`` is always null
at this grain (column absent on snapshots; AG not computed in API).
"""

from __future__ import annotations

import asyncio
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.schemas.dashboard import (
    OeeBreakdownResponse,
    OeeSnapshotListResponse,
    OeeSnapshotResponse,
)
from app.core.rbac import require_permission
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.oee_snapshot import OeeSnapshot
from app.services import dashboard_oee as svc
from app.services.oee_rollup import AGGREGATION_RULE_VERSION
from app.services.sse import register_sse_queue, unregister_sse_queue

router = APIRouter(
    prefix="/api/v1/dashboard",
    tags=["dashboard"],
)


def _safe_detail(message: str) -> str:
    return message


def _to_snapshot_response(row: OeeSnapshot) -> OeeSnapshotResponse:
    """Map ORM row; force machine_utilisation=null (not on table)."""
    return OeeSnapshotResponse(
        id=row.id,
        scope_type=row.scope_type,
        scope_id=row.scope_id,
        period_type=row.period_type,
        period_start=row.period_start,
        sum_run_time_min=row.sum_run_time_min,
        sum_available_time_min=row.sum_available_time_min,
        sum_produced_qty=row.sum_produced_qty,
        sum_good_qty=row.sum_good_qty,
        sum_rejection_qty=row.sum_rejection_qty,
        sum_run_based_capacity=row.sum_run_based_capacity,
        availability=row.availability,
        performance=row.performance,
        machine_utilisation=None,
        quality=row.quality,
        oee=row.oee,
        aggregation_rule_version=row.aggregation_rule_version,
        computed_at=row.computed_at,
    )


def _to_breakdown_response(row: OeeSnapshot) -> OeeBreakdownResponse:
    return OeeBreakdownResponse(
        scope_type=row.scope_type,
        scope_id=row.scope_id,
        period_type=row.period_type,
        period_start=row.period_start,
        availability=row.availability,
        performance=row.performance,
        machine_utilisation=None,
        quality=row.quality,
        oee=row.oee,
        sum_run_time_min=row.sum_run_time_min,
        sum_available_time_min=row.sum_available_time_min,
        sum_produced_qty=row.sum_produced_qty,
        sum_good_qty=row.sum_good_qty,
        sum_rejection_qty=row.sum_rejection_qty,
        sum_run_based_capacity=row.sum_run_based_capacity,
        aggregation_rule_version=row.aggregation_rule_version,
        computed_at=row.computed_at,
    )


def _parse_scope_type(value: str) -> str:
    try:
        return svc.validate_scope_type(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=_safe_detail(str(exc))) from exc


def _parse_period_type(value: str) -> str:
    try:
        return svc.validate_period_type(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=_safe_detail(str(exc))) from exc


@router.get(
    "/stream",
    summary="Open SSE stream for dashboard updates",
    description=(
        "Server-Sent Events stream for real-time OEE dashboard updates. "
        "Single-instance in-process only; requires valid JWT authentication."
    ),
)
async def stream_dashboard_updates(
    request: Request,
    token: str | None = None,
) -> StreamingResponse:
    """Open SSE stream for authenticated clients (JWT required).

    Returns 401 if token is missing or invalid.
    Maintains heartbeat to keep connection alive.
    Events are broadcast when OEE snapshots are updated (via import rollup).
    """
    auth_header = (request.headers.get("authorization") or "").strip()
    token_value = token or request.query_params.get("token")
    if auth_header.lower().startswith("bearer "):
        token_value = auth_header.split(" ", 1)[1].strip() or token_value

    if not token_value:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication credentials",
        )

    try:
        decode_access_token(token_value)
    except ValueError as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication credentials",
        ) from exc

    # Register queue and get its key for later cleanup
    queue_key, queue = register_sse_queue()

    async def event_generator():
        try:
            heartbeat_count = 0
            while True:
                if queue:
                    try:
                        message = queue.popleft()
                    except IndexError:
                        message = None
                    if message is not None:
                        yield message
                        heartbeat_count = 0
                        continue

                # Send heartbeat comment every 30 iterations (~7.5s at 0.25s sleep)
                heartbeat_count += 1
                if heartbeat_count >= 30:
                    yield ": heartbeat\n\n"
                    heartbeat_count = 0

                await asyncio.sleep(0.25)
        finally:
            unregister_sse_queue(queue_key)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/oee",
    response_model=OeeSnapshotResponse,
    dependencies=[Depends(require_permission("dashboard", "READ"))],
    summary="Get OEE snapshot for scope × period",
    description=(
        "Development/internal — authentication not yet implemented. "
        "Reads existing oee_snapshots only (no recalculation). "
        "machine_utilisation is always null (not stored on snapshots)."
    ),
    responses={
        404: {"description": "Snapshot not found"},
        422: {"description": "Invalid scope_type or period_type"},
    },
)
def get_dashboard_oee(
    scope_type: str = Query(..., description="machine | line | plant"),
    scope_id: UUID = Query(...),
    period_type: str = Query(..., description="day | week | month"),
    period_start: date = Query(...),
    aggregation_rule_version: int = Query(
        AGGREGATION_RULE_VERSION,
        description="Defaults to rollup AGGREGATION_RULE_VERSION (1)",
    ),
    db: Session = Depends(get_db),
) -> OeeSnapshotResponse:
    st = _parse_scope_type(scope_type)
    pt = _parse_period_type(period_type)
    row = svc.get_oee_snapshot(
        db,
        scope_type=st,
        scope_id=scope_id,
        period_type=pt,
        period_start=period_start,
        aggregation_rule_version=aggregation_rule_version,
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=_safe_detail("OEE snapshot not found"),
        )
    return _to_snapshot_response(row)


@router.get(
    "/oee/summary",
    response_model=OeeSnapshotResponse,
    dependencies=[Depends(require_permission("dashboard", "READ"))],
    summary="Latest OEE snapshot for a scope",
    description=(
        "Development/internal — authentication not yet implemented. "
        "Latest by period_start DESC, then computed_at DESC."
    ),
    responses={
        404: {"description": "No snapshot for scope"},
        422: {"description": "Invalid scope_type or period_type"},
    },
)
def get_dashboard_oee_summary(
    scope_type: str = Query(..., description="machine | line | plant"),
    scope_id: UUID = Query(...),
    period_type: str | None = Query(
        None, description="Optional filter: day | week | month"
    ),
    aggregation_rule_version: int = Query(AGGREGATION_RULE_VERSION),
    db: Session = Depends(get_db),
) -> OeeSnapshotResponse:
    st = _parse_scope_type(scope_type)
    pt = _parse_period_type(period_type) if period_type is not None else None
    row = svc.get_oee_summary(
        db,
        scope_type=st,
        scope_id=scope_id,
        period_type=pt,
        aggregation_rule_version=aggregation_rule_version,
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=_safe_detail("OEE snapshot not found for scope"),
        )
    return _to_snapshot_response(row)


@router.get(
    "/oee/trend",
    response_model=OeeSnapshotListResponse,
    dependencies=[Depends(require_permission("dashboard", "READ"))],
    summary="Chronological OEE snapshots for a range",
    description=(
        "Development/internal — authentication not yet implemented. "
        "Inclusive period_start_from / period_start_to; ascending order."
    ),
    responses={422: {"description": "Invalid scope_type or period_type"}},
)
def get_dashboard_oee_trend(
    scope_type: str = Query(..., description="machine | line | plant"),
    scope_id: UUID = Query(...),
    period_type: str = Query(..., description="day | week | month"),
    period_start_from: date = Query(...),
    period_start_to: date = Query(...),
    aggregation_rule_version: int = Query(AGGREGATION_RULE_VERSION),
    db: Session = Depends(get_db),
) -> OeeSnapshotListResponse:
    st = _parse_scope_type(scope_type)
    pt = _parse_period_type(period_type)
    if period_start_from > period_start_to:
        raise HTTPException(
            status_code=422,
            detail=_safe_detail(
                "period_start_from must be on or before period_start_to"
            ),
        )
    rows = svc.list_oee_trend(
        db,
        scope_type=st,
        scope_id=scope_id,
        period_type=pt,
        period_start_from=period_start_from,
        period_start_to=period_start_to,
        aggregation_rule_version=aggregation_rule_version,
    )
    items = [_to_snapshot_response(r) for r in rows]
    return OeeSnapshotListResponse(items=items, count=len(items))


@router.get(
    "/oee/breakdown",
    response_model=OeeBreakdownResponse,
    dependencies=[Depends(require_permission("dashboard", "READ"))],
    summary="A/P/Q/OEE breakdown for scope × period",
    description=(
        "Development/internal — authentication not yet implemented. "
        "Returns stored ratios and component sums from oee_snapshots. "
        "machine_utilisation is always null (not on snapshot table)."
    ),
    responses={
        404: {"description": "Snapshot not found"},
        422: {"description": "Invalid scope_type or period_type"},
    },
)
def get_dashboard_oee_breakdown(
    scope_type: str = Query(..., description="machine | line | plant"),
    scope_id: UUID = Query(...),
    period_type: str = Query(..., description="day | week | month"),
    period_start: date = Query(...),
    aggregation_rule_version: int = Query(AGGREGATION_RULE_VERSION),
    db: Session = Depends(get_db),
) -> OeeBreakdownResponse:
    st = _parse_scope_type(scope_type)
    pt = _parse_period_type(period_type)
    row = svc.get_oee_snapshot(
        db,
        scope_type=st,
        scope_id=scope_id,
        period_type=pt,
        period_start=period_start,
        aggregation_rule_version=aggregation_rule_version,
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=_safe_detail("OEE snapshot not found"),
        )
    return _to_breakdown_response(row)


@router.get(
    "/oee/machines",
    response_model=OeeSnapshotListResponse,
    dependencies=[Depends(require_permission("dashboard", "READ"))],
    summary="Machine-level OEE snapshots for a plant × period",
    description=(
        "Development/internal — authentication not yet implemented. "
        "Filters scope_type=machine where machines.plant_id matches."
    ),
    responses={422: {"description": "Invalid period_type"}},
)
def get_dashboard_oee_machines(
    plant_id: UUID = Query(...),
    period_type: str = Query(..., description="day | week | month"),
    period_start: date = Query(...),
    aggregation_rule_version: int = Query(AGGREGATION_RULE_VERSION),
    db: Session = Depends(get_db),
) -> OeeSnapshotListResponse:
    pt = _parse_period_type(period_type)
    rows = svc.list_machine_oee_for_plant(
        db,
        plant_id=plant_id,
        period_type=pt,
        period_start=period_start,
        aggregation_rule_version=aggregation_rule_version,
    )
    items = [_to_snapshot_response(r) for r in rows]
    return OeeSnapshotListResponse(items=items, count=len(items))


@router.get(
    "/oee/lines",
    response_model=OeeSnapshotListResponse,
    dependencies=[Depends(require_permission("dashboard", "READ"))],
    summary="Line-level OEE snapshots for a plant × period",
    description=(
        "Development/internal — authentication not yet implemented. "
        "Filters scope_type=line where lines.plant_id matches."
    ),
    responses={422: {"description": "Invalid period_type"}},
)
def get_dashboard_oee_lines(
    plant_id: UUID = Query(...),
    period_type: str = Query(..., description="day | week | month"),
    period_start: date = Query(...),
    aggregation_rule_version: int = Query(AGGREGATION_RULE_VERSION),
    db: Session = Depends(get_db),
) -> OeeSnapshotListResponse:
    pt = _parse_period_type(period_type)
    rows = svc.list_line_oee_for_plant(
        db,
        plant_id=plant_id,
        period_type=pt,
        period_start=period_start,
        aggregation_rule_version=aggregation_rule_version,
    )
    items = [_to_snapshot_response(r) for r in rows]
    return OeeSnapshotListResponse(items=items, count=len(items))


@router.get(
    "/oee/plants",
    response_model=OeeSnapshotListResponse,
    dependencies=[Depends(require_permission("dashboard", "READ"))],
    summary="Plant-level OEE snapshots for a period",
    description=(
        "Development/internal — authentication not yet implemented. "
        "Optional plant_id filter; otherwise all plant-scope snapshots."
    ),
    responses={422: {"description": "Invalid period_type"}},
)
def get_dashboard_oee_plants(
    period_type: str = Query(..., description="day | week | month"),
    period_start: date = Query(...),
    plant_id: UUID | None = Query(None),
    aggregation_rule_version: int = Query(AGGREGATION_RULE_VERSION),
    db: Session = Depends(get_db),
) -> OeeSnapshotListResponse:
    pt = _parse_period_type(period_type)
    rows = svc.list_plant_oee(
        db,
        period_type=pt,
        period_start=period_start,
        plant_id=plant_id,
        aggregation_rule_version=aggregation_rule_version,
    )
    items = [_to_snapshot_response(r) for r in rows]
    return OeeSnapshotListResponse(items=items, count=len(items))
