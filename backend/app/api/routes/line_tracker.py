"""FastAPI endpoints for ERC Mk-V Line Tracker data and status."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.rbac import require_permission
from app.services.line_tracker_dashboard_service import (
    get_capacity_dashboard,
    get_dashboard_summary,
    get_production_dashboard,
)
from app.services.line_tracker_machine_assets_service import (
    get_capacity_change_analytics,
    get_machine_consumables_analytics,
    get_machine_master_analytics,
    get_planned_shutdown_analytics,
)
from app.services.line_tracker_order_analytics_service import (
    get_monthly_order_plan,
    get_production_order_analytics,
)
from app.services.line_tracker_rm_heat_service import (
    get_heat_lot_reference_analytics,
    get_rm_heat_plan_analytics,
)
from app.services.line_tracker_service import (
    compute_oee_slice_metrics,
    get_line_tracker_dataset,
    get_line_tracker_downtime_log_dataset,
    get_line_tracker_historical_records,
    get_line_tracker_monthly_plan,
    get_line_tracker_oee_breakdown,
    get_line_tracker_ppc_orders,
    get_line_tracker_reliability_analysis,
    get_line_tracker_status,
    get_line_tracker_traceability,
)
from app.services.line_tracker_shift_manpower_service import (
    get_manpower_summary_analytics,
    get_shift_entries_analytics,
)
from app.services.line_tracker_worksheet_service import (
    WorksheetNotFoundError,
    WorksheetReadError,
    get_line_tracker_worksheet_catalog,
    get_line_tracker_worksheet_data,
)

router = APIRouter(prefix="/line-tracker", tags=["line-tracker"])

check_line_tracker_access = require_permission("dashboard", "READ")


@router.get(
    "/dashboards/production",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_production_dashboard(
    date_from: str = Query(default="", max_length=10),
    date_to: str = Query(default="", max_length=10),
    stage: str = Query(default="", max_length=120),
    machine: str = Query(default="", max_length=120),
    refresh: bool = Query(default=False, description="Refresh dashboard source worksheets"),
) -> dict[str, Any]:
    """Return production dashboard trends recalculated from historical downtime source rows."""
    try:
        return get_production_dashboard(
            date_from=date_from,
            date_to=date_to,
            stage=stage,
            machine=machine,
            refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/dashboards/capacity",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_capacity_dashboard(
    refresh: bool = Query(default=False, description="Refresh dashboard source worksheets"),
) -> dict[str, Any]:
    """Return source-verified rated capacity and Entries performance by work center."""
    try:
        return get_capacity_dashboard(refresh=refresh)
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/dashboards/summary",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_dashboard_summary(
    date_from: str = Query(default="", max_length=10),
    date_to: str = Query(default="", max_length=10),
    refresh: bool = Query(default=False, description="Refresh dashboard source worksheets"),
) -> dict[str, Any]:
    """Return month/year summary aggregates reconciled to Downtime Log records."""
    try:
        return get_dashboard_summary(
            date_from=date_from,
            date_to=date_to,
            refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/status",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_status(
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return Line Tracker source status, record counts, and data-quality warnings."""
    if refresh:
        get_line_tracker_dataset(refresh=True)
    return get_line_tracker_status()


@router.get(
    "/worksheets",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_worksheet_catalog(
    refresh: bool = Query(default=False, description="Refresh live worksheet metadata"),
) -> dict[str, Any]:
    """List the allowlisted ERC Mk-V worksheets and their live Google sheet IDs."""
    try:
        return get_line_tracker_worksheet_catalog(refresh=refresh)
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/worksheets/{worksheet_key}",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_worksheet(
    worksheet_key: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: str = Query(default="", max_length=120),
    refresh: bool = Query(default=False, description="Bypass the worksheet cache"),
) -> dict[str, Any]:
    """Return paginated source rows for one allowlisted ERC Mk-V worksheet."""
    try:
        return get_line_tracker_worksheet_data(
            worksheet_key,
            page=page,
            page_size=page_size,
            search=search,
            refresh=refresh,
        )
    except WorksheetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/orders/analytics",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_production_order_analytics(
    worksheet_key: Literal["production-order", "copy-of-production-order"] = Query(
        default="production-order"
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=120),
    customer: str = Query(default="", max_length=120),
    part: str = Query(default="", max_length=120),
    order_status: str = Query(default="", max_length=80),
    sort_by: Literal[
        "order_number",
        "customer",
        "part",
        "order_date",
        "order_quantity",
        "status",
        "dispatch_date",
        "rm_requirement_mt",
        "plan_production_total",
        "plan_dispatch_total",
    ] = Query(default="order_number"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
    refresh: bool = Query(default=False, description="Refresh the source worksheets"),
) -> dict[str, Any]:
    """Return validated order rows and non-additive monthly-plan comparison data."""
    try:
        return get_production_order_analytics(
            worksheet_key,
            page=page,
            page_size=page_size,
            search=search,
            customer=customer,
            part=part,
            status=order_status,
            sort_by=sort_by,
            sort_order=sort_order,
            refresh=refresh,
        )
    except WorksheetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/orders/monthly-plan",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_monthly_order_plan(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=120),
    customer: str = Query(default="", max_length=120),
    part: str = Query(default="", max_length=120),
    source_type: str = Query(default="", max_length=40),
    month: str = Query(default="", max_length=30),
    sort_by: Literal[
        "row_number",
        "po_number",
        "customer",
        "part",
        "type",
        "po_quantity",
        "balance",
        "month_total",
    ] = Query(default="row_number"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
    refresh: bool = Query(default=False, description="Refresh the source worksheet"),
) -> dict[str, Any]:
    """Return the source's Production/Dispatch monthly rows and exact month labels."""
    try:
        return get_monthly_order_plan(
            page=page,
            page_size=page_size,
            search=search,
            customer=customer,
            part=part,
            source_type=source_type,
            month=month,
            sort_by=sort_by,
            sort_order=sort_order,
            refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/raw-material/plan-actual",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_rm_heat_plan_analytics(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=120),
    customer: str = Query(default="", max_length=160),
    supplier: str = Query(default="", max_length=160),
    source_batch: str = Query(default="", max_length=120),
    heat_no: str = Query(default="", max_length=100),
    lot_no: str = Query(default="", max_length=100),
    sort_by: Literal[
        "source_row",
        "heat_no",
        "lot_no",
        "customer",
        "supplier",
        "rm_qty_mt",
        "yield_vs_plan_fraction",
        "balance_reconciliation",
        "source_batch",
        "reference_status",
    ] = Query(default="source_row"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
    refresh: bool = Query(default=False, description="Refresh both raw-material worksheets"),
) -> dict[str, Any]:
    """Return the material plan, source actuals, and composite-key reference matches."""
    try:
        return get_rm_heat_plan_analytics(
            page=page,
            page_size=page_size,
            search=search,
            customer=customer,
            supplier=supplier,
            source_batch=source_batch,
            heat_no=heat_no,
            lot_no=lot_no,
            sort_by=sort_by,
            sort_order=sort_order,
            refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/raw-material/heat-lot-reference",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_heat_lot_reference_analytics(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=120),
    customer: str = Query(default="", max_length=160),
    supplier: str = Query(default="", max_length=160),
    source_batch: str = Query(default="", max_length=120),
    heat_no: str = Query(default="", max_length=100),
    lot_no: str = Query(default="", max_length=100),
    sort_by: Literal[
        "source_row",
        "heat_no",
        "lot_no",
        "customer",
        "supplier",
        "rm_qty_mt",
        "source_batch",
        "plan_usage",
    ] = Query(default="source_row"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
    refresh: bool = Query(default=False, description="Refresh both raw-material worksheets"),
) -> dict[str, Any]:
    """Return the heat/lot reference master and current plan-use indicators."""
    try:
        return get_heat_lot_reference_analytics(
            page=page,
            page_size=page_size,
            search=search,
            customer=customer,
            supplier=supplier,
            source_batch=source_batch,
            heat_no=heat_no,
            lot_no=lot_no,
            sort_by=sort_by,
            sort_order=sort_order,
            refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/assets/machine-master",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_machine_master_analytics(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=120),
    work_center: str = Query(default="", max_length=120),
    machine_status: str = Query(default="", max_length=80),
    sort_by: Literal[
        "source_row", "work_center", "machine", "rated_ct_sec", "status",
        "commissioning_date", "manpower_per_shift", "decommissioned_date",
        "output_per_minute", "hourly_capacity", "shift_capacity",
        "day_capacity", "capacity_at_85_percent",
    ] = Query(default="source_row"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
    refresh: bool = Query(default=False),
) -> dict[str, Any]:
    try:
        return get_machine_master_analytics(
            page=page, page_size=page_size, search=search,
            work_center=work_center, status=machine_status,
            sort_by=sort_by, sort_order=sort_order, refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/assets/machine-consumables",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_machine_consumables_analytics(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=120),
    work_center: str = Query(default="", max_length=120),
    category: str = Query(default="", max_length=120),
    due_status: str = Query(default="", max_length=40),
    machine: str = Query(default="", max_length=120),
    sort_by: Literal[
        "source_row", "work_center", "machine", "consumable", "category",
        "change_frequency", "last_changed_date", "next_due_date", "due_status",
        "machine_match",
    ] = Query(default="source_row"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
    refresh: bool = Query(default=False),
) -> dict[str, Any]:
    try:
        return get_machine_consumables_analytics(
            page=page, page_size=page_size, search=search,
            work_center=work_center, category=category, due_status=due_status,
            machine=machine, sort_by=sort_by, sort_order=sort_order,
            refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/assets/capacity-change-log",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_capacity_change_analytics(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=120),
    classification: str = Query(default="", max_length=40),
    work_center: str = Query(default="", max_length=120),
    machine: str = Query(default="", max_length=120),
    sort_by: Literal[
        "source_row", "date_changed", "work_center", "machine",
        "old_rated_ct_sec", "new_rated_ct_sec", "percentage_change",
        "classification", "machine_match",
    ] = Query(default="source_row"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
    refresh: bool = Query(default=False),
) -> dict[str, Any]:
    try:
        return get_capacity_change_analytics(
            page=page, page_size=page_size, search=search,
            classification=classification, work_center=work_center,
            machine=machine, sort_by=sort_by, sort_order=sort_order,
            refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/assets/planned-shutdowns",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_planned_shutdown_analytics(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=120),
    classification: str = Query(default="", max_length=40),
    scope: str = Query(default="", max_length=80),
    sort_by: Literal[
        "source_row", "start_date", "end_date", "scope", "scope_detail",
        "hours_affected_per_day", "duration_days", "estimated_hours",
        "classification", "date_range_valid",
    ] = Query(default="source_row"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
    refresh: bool = Query(default=False),
) -> dict[str, Any]:
    try:
        return get_planned_shutdown_analytics(
            page=page, page_size=page_size, search=search,
            classification=classification, scope=scope, sort_by=sort_by,
            sort_order=sort_order, refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/summary",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_summary(
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return high-level summary KPIs, OEE aggregate, and PPC fulfillment summary for the dashboard."""
    data = get_line_tracker_dataset(refresh=refresh)
    return {
        "source_type": data.get("source_type"),
        "source_notice": data.get("source_notice"),
        "is_live_google_sheets": data.get("is_live_google_sheets", False),
        "file_name": data.get("file_name"),
        "last_modified": data.get("last_modified"),
        "google_sheet_id": data.get("google_sheet_id"),
        "coverage_dates": data.get("coverage_dates"),
        "records_summary": data.get("records_summary"),
        "oee_aggregate": data.get("oee_aggregate"),
        "ppc_summary": data.get("ppc_summary"),
        "data_quality_warnings": data.get("data_quality_warnings", []),
        "top_historical_downtime_categories": data.get("top_historical_downtime_categories", []),
    }


@router.get(
    "/entries",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_entries(
    work_center: str | None = Query(default=None, description="Optional filter by work center"),
    machine: str | None = Query(default=None, description="Optional filter by machine name"),
    shift: str | None = Query(default=None, description="Optional filter by shift name"),
    date_from: str | None = Query(default=None, description="Optional ISO start date"),
    date_to: str | None = Query(default=None, description="Optional ISO end date"),
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return accepted shift entries from the Entries tab with component-weighted OEE for the filtered slice."""
    data = get_line_tracker_dataset(refresh=refresh)
    entries = data.get("shift_entries", [])
    if work_center and work_center.lower() != "all":
        entries = [e for e in entries if e.get("work_center", "").lower() == work_center.lower()]
    if machine and machine.lower() != "all":
        entries = [e for e in entries if e.get("machine", "").lower() == machine.lower()]
    if shift and shift.lower() != "all":
        entries = [e for e in entries if e.get("shift", "").lower() == shift.lower()]
    if date_from:
        entries = [e for e in entries if e.get("date") and e["date"] >= date_from]
    if date_to:
        entries = [e for e in entries if e.get("date") and e["date"] <= date_to]

    slice_oee = compute_oee_slice_metrics(entries)

    return {
        "count": len(entries),
        "entries": entries,
        "oee_aggregate": slice_oee,
    }


@router.get(
    "/operations/entries",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_shift_entries_analytics(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=160),
    date_from: str = Query(default="", max_length=10),
    date_to: str = Query(default="", max_length=10),
    shift: str = Query(default="", max_length=80),
    work_center: str = Query(default="", max_length=120),
    machine: str = Query(default="", max_length=120),
    part: str = Query(default="", max_length=120),
    source: str = Query(default="", max_length=80),
    downtime_category: str = Query(default="", max_length=100),
    breakdown_type: str = Query(default="", max_length=100),
    status_vs_rated: str = Query(default="", max_length=80),
    sort_by: Literal[
        "source_row",
        "date",
        "shift",
        "work_center",
        "machine",
        "part",
        "output_qty",
        "downtime_min",
        "total_rejects",
        "availability_fraction",
        "performance_fraction",
        "quality_fraction",
        "oee_fraction",
        "planned_manpower",
        "actual_manpower",
        "manpower_shortfall",
    ] = Query(default="date"),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    refresh: bool = Query(default=False, description="Refresh the source worksheets"),
) -> dict[str, Any]:
    """Return paginated Entries records and formula/relation validation."""
    try:
        return get_shift_entries_analytics(
            page=page,
            page_size=page_size,
            search=search,
            date_from=date_from,
            date_to=date_to,
            shift=shift,
            work_center=work_center,
            machine=machine,
            part=part,
            source=source,
            downtime_category=downtime_category,
            breakdown_type=breakdown_type,
            status_vs_rated=status_vs_rated,
            sort_by=sort_by,
            sort_order=sort_order,
            refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/operations/manpower-summary",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_manpower_summary_analytics(
    level: Literal["machine", "work-center"] = Query(default="machine"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=120),
    sort_by: Literal[
        "source_row",
        "name",
        "rated_manpower_per_shift",
        "avg_planned",
        "avg_actual",
        "total_shortfall",
        "source_shifts_logged",
        "dated_entry_count",
    ] = Query(default="name"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
    refresh: bool = Query(default=False, description="Refresh the source worksheets"),
) -> dict[str, Any]:
    """Return separate work-center and machine manpower sections with reconciliations."""
    try:
        return get_manpower_summary_analytics(
            level=level,
            page=page,
            page_size=page_size,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
            refresh=refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorksheetReadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/oee/breakdown",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_oee_breakdown(
    work_center: str | None = Query(default=None, description="Optional filter by work center"),
    machine: str | None = Query(default=None, description="Optional filter by machine name"),
    shift: str | None = Query(default=None, description="Optional filter by shift name"),
    date_from: str | None = Query(default=None, description="Optional ISO start date"),
    date_to: str | None = Query(default=None, description="Optional ISO end date"),
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return machine-wise, work-center-wise, and shift-wise component-weighted OEE, cycle-time compliance, and speed loss Pareto."""
    return get_line_tracker_oee_breakdown(
        work_center=work_center,
        machine=machine,
        shift=shift,
        date_from=date_from,
        date_to=date_to,
        refresh=refresh,
    )


@router.get(
    "/orders",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_orders(
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return production orders with metallurgical reconciliation status."""
    data = get_line_tracker_dataset(refresh=refresh)
    return {
        "count": len(data.get("production_orders", [])),
        "orders": data.get("production_orders", []),
    }


@router.get(
    "/machines",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_machines(
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return machine master catalog with work centers and rated cycle times."""
    data = get_line_tracker_dataset(refresh=refresh)
    return {
        "count": len(data.get("machines", [])),
        "machines": data.get("machines", []),
    }


@router.get(
    "/heats",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_heats(
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return master metallurgical heats catalog and conversion yields."""
    data = get_line_tracker_dataset(refresh=refresh)
    return {
        "count": len(data.get("rm_heats_catalog", [])),
        "heats": data.get("rm_heats_catalog", []),
    }


@router.get(
    "/ppc/orders",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_ppc_orders(
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return production orders with produced quantities, outstanding balances, and delivery risk status."""
    return get_line_tracker_ppc_orders(refresh=refresh)


@router.get(
    "/ppc/monthly-plan",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_ppc_monthly_plan(
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return monthly production & dispatch plan vs actual, plan gap, and snapshot metadata."""
    return get_line_tracker_monthly_plan(refresh=refresh)


@router.get(
    "/ppc/traceability",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_ppc_traceability(
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return order-to-heat-to-lot traceability tree and metallurgical conversion yield funnel."""
    return get_line_tracker_traceability(refresh=refresh)


@router.get(
    "/reliability/pareto",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_reliability_pareto(
    category: str | None = Query(default=None, description="Optional filter by downtime category"),
    machine: str | None = Query(default=None, description="Optional filter by machine name"),
    stage: str | None = Query(default=None, description="Optional filter by process stage"),
    shift: str | None = Query(default=None, description="Optional filter by shift name"),
    date_from: str | None = Query(default=None, description="Optional ISO start date"),
    date_to: str | None = Query(default=None, description="Optional ISO end date"),
    source: Literal["local_excel", "google_sheets"] = Query(
        default="local_excel",
        description="Google Sheets reads only the Downtime Log worksheet.",
    ),
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return historical downtime Pareto and MTTR/MTBF analysis."""
    source_dataset = None
    if source == "google_sheets":
        try:
            source_dataset = get_line_tracker_downtime_log_dataset(refresh=refresh)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The configured Google Sheets Downtime Log is unavailable.",
            ) from exc
    return get_line_tracker_reliability_analysis(
        category=category,
        machine=machine,
        stage=stage,
        shift=shift,
        date_from=date_from,
        date_to=date_to,
        refresh=refresh,
        source_dataset=source_dataset,
    )


@router.get(
    "/reliability/records",
    dependencies=[Depends(check_line_tracker_access)],
)
def read_line_tracker_historical_records(
    category: str | None = Query(default=None, description="Optional filter by downtime category"),
    machine: str | None = Query(default=None, description="Optional filter by machine name"),
    stage: str | None = Query(default=None, description="Optional filter by process stage"),
    shift: str | None = Query(default=None, description="Optional filter by shift name"),
    date_from: str | None = Query(default=None, description="Optional ISO start date"),
    date_to: str | None = Query(default=None, description="Optional ISO end date"),
    search: str | None = Query(
        default=None,
        description="Search term for machine, category, type or description",
    ),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=500, description="Page size"),
    source: Literal["local_excel", "google_sheets"] = Query(
        default="local_excel",
        description="Google Sheets reads only the Downtime Log worksheet.",
    ),
    refresh: bool = Query(default=False, description="Bypass cache and re-parse file"),
) -> dict[str, Any]:
    """Return paginated, searchable historical downtime records with slice filters."""
    source_dataset = None
    if source == "google_sheets":
        try:
            source_dataset = get_line_tracker_downtime_log_dataset(refresh=refresh)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The configured Google Sheets Downtime Log is unavailable.",
            ) from exc
    return get_line_tracker_historical_records(
        category=category,
        machine=machine,
        stage=stage,
        shift=shift,
        date_from=date_from,
        date_to=date_to,
        search=search,
        page=page,
        page_size=page_size,
        refresh=refresh,
        source_dataset=source_dataset,
    )
