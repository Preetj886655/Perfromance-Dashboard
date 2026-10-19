"""Tests for Phase 2 production orders and monthly planning."""

from __future__ import annotations

from collections.abc import Iterator
from copy import deepcopy
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.routes import line_tracker as line_tracker_routes
from app.api.routes.line_tracker import check_line_tracker_access
from app.main import app
from app.models.user import User
from app.services import line_tracker_order_analytics_service as order_service
from app.services.line_tracker_worksheet_service import WorksheetReadError

ORDER_HEADERS = [
    "PO Date ",
    "Order Nr",
    "Customer",
    "Order Qty",
    "Part",
    "DP Date",
    "Assigned RM Heat Nr",
    "Subsequent Lot Nr",
    "Status",
    "Notes",
    "RM Requirment in MT ",
]
MONTH_HEADERS = [
    "Part",
    "Customer",
    "PO No",
    "PO Date",
    "PO Qty",
    "DP Date",
    "FY25-26 Carryover",
    "Balance",
    "Type",
    "Apr-26",
    "May-26",
    "Jun-26",
    "Jul-26",
    "Aug-26",
    "Sep-26",
    "Oct-26",
    "Nov-26",
    "Dec-26",
    "Jan-27",
    "Feb-26",
    "Mar-26",
    "Grand Total",
]


def _order_row(
    order_number: str,
    customer: str,
    quantity: int,
    *,
    status: str = "Open",
    notes: str = "",
    rm_mt: float | None = None,
) -> list[Any]:
    return [
        "2026-01-01",
        order_number,
        customer,
        quantity,
        "MK-V",
        "",
        "",
        "",
        status,
        notes,
        rm_mt,
    ]


def _plan_row(
    po_number: int | str | None,
    source_type: str,
    *,
    customer: str = "",
    po_quantity: int | None = None,
    april: int | None = None,
    may: int | None = None,
    grand_total: int | None = None,
) -> list[Any]:
    return [
        "MK-V" if customer else "",
        customer,
        po_number or "",
        "",
        po_quantity if po_quantity is not None else "",
        "",
        "",
        "",
        source_type,
        april if april is not None else "",
        may if may is not None else "",
        *("" for _ in range(10)),
        grand_total if grand_total is not None else "",
    ]


@pytest.fixture
def mock_sources(monkeypatch: pytest.MonkeyPatch) -> dict[str, dict[str, Any]]:
    primary_records = [
        {
            "row_number": 2,
            "values": _order_row(
                "PO-PLACEHOLDER",
                "Western Railway",
                100,
                notes="Real PO No. 26265489205106 — Order Nr is a placeholder ID",
                rm_mt=0.118,
            ),
        },
        {"row_number": 3, "values": _order_row("10001", "Central", 200)},
        {"row_number": 4, "values": _order_row("TP-001", "Eastern", 300, status="Closed?")},
        {"row_number": 203, "values": ["", "How to use this tab:"]},
    ]
    monthly_records = [
        {
            "row_number": 5,
            "values": _plan_row(
                10001,
                "Production",
                customer="Central",
                po_quantity=200,
                april=100,
                may=50,
                grand_total=150,
            ),
        },
        {
            "row_number": 6,
            "values": _plan_row(None, "Dispatch", april=40),
        },
        {
            "row_number": 7,
            "values": _plan_row(
                26265489205106,
                "Production",
                customer="Western Railway",
                po_quantity=100,
                april=100,
                grand_total=100,
            ),
        },
        {
            "row_number": 8,
            "values": _plan_row(None, "Dispatch"),
        },
        {
            "row_number": 18,
            "values": ["Total order qty.", "", "", "", 300],
        },
    ]

    sources = {
        "production-order": {
            "worksheet": {
                "key": "production-order",
                "name": "Production Order",
                "worksheet_id": 1832059257,
            },
            "spreadsheet_id": "test-sheet",
            "headers": ORDER_HEADERS,
            "records": deepcopy(primary_records),
            "record_count": len(primary_records),
            "page_count": 1,
            "page": 1,
            "page_size": 200,
            "fetched_at": "2026-10-17T10:00:00+00:00",
            "cache_hit": False,
            "is_stale": False,
            "refresh_error": None,
            "source_context_rows": [],
        },
        "copy-of-production-order": {
            "worksheet": {
                "key": "copy-of-production-order",
                "name": "Copy of Production Order",
                "worksheet_id": 827106177,
            },
            "spreadsheet_id": "test-sheet",
            "headers": ORDER_HEADERS,
            "records": deepcopy(primary_records),
            "record_count": len(primary_records),
            "page_count": 1,
            "page": 1,
            "page_size": 200,
            "fetched_at": "2026-10-17T10:00:00+00:00",
            "cache_hit": True,
            "is_stale": False,
            "refresh_error": None,
            "source_context_rows": [],
        },
        "order-plan-monthly": {
            "worksheet": {
                "key": "order-plan-monthly",
                "name": "Order Plan (Monthly)",
                "worksheet_id": 443868223,
            },
            "spreadsheet_id": "test-sheet",
            "headers": MONTH_HEADERS,
            "records": monthly_records,
            "record_count": len(monthly_records),
            "page_count": 1,
            "page": 1,
            "page_size": 200,
            "fetched_at": "2026-10-17T10:00:00+00:00",
            "cache_hit": True,
            "is_stale": False,
            "refresh_error": None,
            "source_context_rows": [
                {
                    "row_number": 1,
                    "values": [
                        "Order Plan — Monthly Production & Dispatch (FY 2026-27) — INFORMATION ONLY"
                    ],
                }
            ],
        },
    }

    def read_source(key: str, **kwargs: Any) -> dict[str, Any]:
        result = dict(sources[key])
        if kwargs["page"] > 1:
            result["records"] = []
        return result

    monkeypatch.setattr(order_service, "get_line_tracker_worksheet_data", read_source)
    return sources


@pytest.fixture
def authenticated_client() -> Iterator[TestClient]:
    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[check_line_tracker_access] = lambda: User(
        email="phase2_tester@patilgroup.com",
        employee_code="EMP-PHASE2",
        is_active=True,
    )
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def test_production_orders_parse_live_style_rows_and_do_not_count_instructions(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    data = order_service.get_production_order_analytics("production-order")

    assert data["summary"]["order_count"] == 3
    assert data["summary"]["status_counts"] == {"Open": 2, "Closed?": 1}
    assert data["summary"]["known_rm_requirement_total_mt"] == pytest.approx(0.118)
    assert all(order["order_number"] != "How to use this tab:" for order in data["orders"])
    assert data["duplicate_comparison"]["status"] == "identical_live_values"
    assert data["duplicate_comparison"]["combined_into_metrics"] is False
    assert data["plan_overlap"] == {
        "plan_order_count": 2,
        "exact_match_count": 1,
        "note_alias_match_count": 1,
        "unmatched_count": 0,
        "ambiguous_count": 0,
        "unmatched_po_numbers": [],
        "ambiguous_po_numbers": [],
    }
    assert mock_sources["production-order"]["worksheet"]["worksheet_id"] == 1832059257


def test_copy_is_reported_as_distinct_when_live_values_differ(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    mock_sources["copy-of-production-order"]["records"][2]["values"] = _order_row(
        "TP-001", "Changed Customer", 300, status="Closed?"
    )

    data = order_service.get_production_order_analytics("copy-of-production-order")

    assert data["duplicate_comparison"]["status"] == "distinct_snapshot"
    assert data["duplicate_comparison"]["cell_values_equal"] is False
    assert data["summary"]["order_count"] == 3


def test_orders_apply_search_filters_sorting_and_pagination(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    data = order_service.get_production_order_analytics(
        "production-order",
        search="TP-001",
        status="Closed?",
        sort_by="order_quantity",
        sort_order="desc",
        page_size=1,
    )

    assert data["filtered_record_count"] == 1
    assert data["orders"][0]["order_number"] == "TP-001"
    assert data["orders"][0]["order_quantity"] == 300
    assert data["page"] == 1
    assert data["page_count"] == 1


def test_order_matching_reports_unmatched_and_ambiguous_identifiers(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    mock_sources["order-plan-monthly"]["records"].insert(
        4,
        {
            "row_number": 9,
            "values": _plan_row("UNMATCHED-PO", "Production", customer="No match", po_quantity=10),
        },
    )
    mock_sources["production-order"]["records"].append(
        {
            "row_number": 5,
            "values": _order_row("10001", "Duplicate identifier", 50),
        }
    )
    mock_sources["production-order"]["record_count"] += 1

    data = order_service.get_production_order_analytics("production-order")

    assert data["plan_overlap"]["ambiguous_count"] == 1
    assert data["plan_overlap"]["ambiguous_po_numbers"] == ["10001"]
    assert data["plan_overlap"]["unmatched_count"] == 1
    assert data["plan_overlap"]["unmatched_po_numbers"] == ["UNMATCHED-PO"]


def test_month_plan_preserves_source_months_and_reconciles_formula_total(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    data = order_service.get_monthly_order_plan()

    assert data["fiscal_period"] == "FY 2026-27"
    assert data["month_headers"][-2:] == ["Feb-26", "Mar-26"]
    assert data["formula_summary"]["source_total_order_qty"] == 300
    assert data["formula_summary"]["calculated_production_po_qty"] == 300
    assert data["formula_summary"]["formula_total_matches"] is True
    assert data["plans"][0]["month_total"] == 150
    assert data["plans"][1]["month_total"] == 40
    assert data["plans"][1]["parent_po_number"] == "10001"
    assert data["plans"][1]["match_method"] == "exact"
    assert data["plans"][2]["match_method"] == "note_alias"
    assert data["plan_overlap"]["exact_match_count"] == 1
    assert data["plan_overlap"]["note_alias_match_count"] == 1


def test_order_analytics_preserves_stale_source_provenance(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    mock_sources["production-order"]["is_stale"] = True
    mock_sources["production-order"]["refresh_error"] = "Google refresh failed."

    data = order_service.get_production_order_analytics("production-order")

    assert data["is_stale"] is True
    assert "Google refresh failed." in data["refresh_error"]
    assert data["sources"]["orders"]["is_stale"] is True


def test_month_plan_filters_sorting_and_keeps_blank_amounts_as_none(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    data = order_service.get_monthly_order_plan(
        source_type="Dispatch",
        month="Apr-26",
        sort_by="month_total",
        sort_order="desc",
        page_size=1,
    )

    assert data["filtered_record_count"] == 1
    assert data["plans"][0]["month_total"] == 40
    assert data["plans"][0]["month_values"]["May-26"] is None

    unphased = order_service.get_monthly_order_plan(
        source_type="Production",
        customer="Western Railway",
    )
    assert unphased["plans"][0]["month_total"] == 100

    no_month_data = order_service.get_monthly_order_plan(
        source_type="Dispatch",
        customer="Central",
        month="May-26",
    )
    assert no_month_data["filtered_record_count"] == 0


def test_month_filter_rejects_non_source_month_label(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    with pytest.raises(ValueError, match="exact source month header"):
        order_service.get_monthly_order_plan(month="March 2027")


def test_month_plan_reports_formula_reconciliation_mismatch(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    mock_sources["order-plan-monthly"]["records"][-1]["values"][4] = 301

    data = order_service.get_monthly_order_plan()

    assert data["formula_summary"]["source_total_order_qty"] == 301
    assert data["formula_summary"]["calculated_production_po_qty"] == 300
    assert data["formula_summary"]["formula_total_matches"] is False


def test_order_analytics_api_filters_and_uses_existing_rbac(
    authenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    monkeypatch.setattr(
        line_tracker_routes,
        "get_production_order_analytics",
        order_service.get_production_order_analytics,
    )
    monkeypatch.setattr(
        line_tracker_routes, "get_monthly_order_plan", order_service.get_monthly_order_plan
    )

    orders = authenticated_client.get(
        "/api/v1/line-tracker/orders/analytics?worksheet_key=production-order&search=Central&page_size=1"
    )
    plan = authenticated_client.get(
        "/api/v1/line-tracker/orders/monthly-plan?source_type=Dispatch&month=Apr-26&page_size=1"
    )

    assert orders.status_code == 200
    assert orders.json()["orders"][0]["customer"] == "Central"
    assert plan.status_code == 200
    assert plan.json()["plans"][0]["source_type"] == "Dispatch"


def test_monthly_plan_api_reports_bad_month_and_upstream_read_errors(
    authenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    bad_month = authenticated_client.get(
        "/api/v1/line-tracker/orders/monthly-plan?month=March%202027"
    )
    assert bad_month.status_code == 400

    def fail_read(**kwargs: Any) -> dict[str, Any]:
        raise WorksheetReadError("test upstream failure")

    monkeypatch.setattr(line_tracker_routes, "get_monthly_order_plan", fail_read)
    upstream_error = authenticated_client.get("/api/v1/line-tracker/orders/monthly-plan")
    assert upstream_error.status_code == 502
    assert upstream_error.json()["detail"] == "test upstream failure"


def test_order_analytics_api_rejects_unauthenticated_requests() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/line-tracker/orders/analytics")

    assert response.status_code == 401


def test_order_analytics_api_only_accepts_allowlisted_worksheet_keys(
    authenticated_client: TestClient,
) -> None:
    response = authenticated_client.get(
        "/api/v1/line-tracker/orders/analytics?worksheet_key=arbitrary-spreadsheet-id"
    )

    assert response.status_code == 422
