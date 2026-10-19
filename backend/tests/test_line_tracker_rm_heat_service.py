"""Tests for Phase 3 heat/lot planning and traceability analytics."""

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
from app.services import line_tracker_rm_heat_service as rm_service
from app.services.line_tracker_worksheet_service import WorksheetReadError

PLAN_HEADERS = [
    "Customer",
    "Supplier",
    "Heat No.",
    "Lot No.",
    "RM Qty (MT)",
    "Plan: Cut Bar (Nos)",
    "Actual: Bar Cropper OK",
    "Actual: Endbit Scrap",
    "Actual: ACM/Turning OK",
    "Actual: ACM/Turning REJ",
    "Plan: Clip Prod (Nos)",
    "Actual: Forming OK",
    "Actual: Forming REJ",
    "Plan: Final Supply (Nos)",
    "Yield vs Plan %",
    "Balance / Reconciliation",
    "Source Batch",
]
REFERENCE_HEADERS = [
    "Heat No.",
    "Lot No.",
    "Customer",
    "Supplier",
    "RM Qty (MT)",
    "Source Batch",
]


def _plan_row(
    heat: str,
    lot: str,
    *,
    customer: str = "Customer A",
    supplier: str = "Supplier A",
    rm_qty: float | None = 10,
    plan_cut: int | float | None = 100,
    actual_cropper: int | None = 110,
    actual_scrap: int | None = 2,
    actual_acm: int | None = 95,
    actual_acm_rej: int | None = 1,
    plan_clip: int | float | None = 90,
    actual_forming: int | None = 81,
    actual_forming_rej: int | None = 2,
    plan_final: int | float | None = 85,
    yield_fraction: float | None = 0.9,
    balance: int | float | None = -3,
    batch: str = "BATCH-1",
) -> list[Any]:
    return [
        customer,
        supplier,
        heat,
        lot,
        rm_qty,
        plan_cut,
        actual_cropper,
        actual_scrap,
        actual_acm,
        actual_acm_rej,
        plan_clip,
        actual_forming,
        actual_forming_rej,
        plan_final,
        yield_fraction,
        balance,
        batch,
    ]


def _reference_row(
    heat: str,
    lot: str,
    *,
    customer: str = "Customer A",
    supplier: str = "Supplier A",
    rm_qty: float | None = 10,
    batch: str = "BATCH-1",
) -> list[Any]:
    return [heat, lot, customer, supplier, rm_qty, batch]


@pytest.fixture
def mock_sources(monkeypatch: pytest.MonkeyPatch) -> dict[str, dict[str, Any]]:
    plan_records = [
        {"row_number": 5, "values": _plan_row("H-001", "L-001")},
        {
            "row_number": 6,
            "values": _plan_row(
                "H-002",
                "",
                rm_qty=2,
                actual_cropper=None,
                actual_scrap=None,
                actual_acm=None,
                actual_acm_rej=None,
                plan_clip=2,
                actual_forming=None,
                actual_forming_rej=None,
                yield_fraction=None,
                plan_final=2,
            ),
        },
        {
            "row_number": 7,
            "values": _plan_row(
                "H-003",
                "L-003",
                customer="Customer B",
                supplier="Supplier B",
                rm_qty=5,
                plan_clip=4,
                actual_forming=3,
                yield_fraction=None,
                batch="BATCH-2",
            ),
        },
        {"row_number": 8, "values": ["TOTAL", "Supplier A", "BAR CROPPER", "", "", "ACM"]},
        {"row_number": 9, "values": ["Summary", "", 17]},
        {"row_number": 10, "values": ["Total RM Qty planned (MT)", 17]},
        {"row_number": 11, "values": ["Total planned final supply (Nos)", 172]},
        {"row_number": 12, "values": ["Total actual Forming OK (Nos)", 84]},
        {"row_number": 13, "values": ["Data quality notes"]},
    ]
    reference_records = [
        {"row_number": 6, "values": _reference_row("h-001", " L-001 ")},
        {"row_number": 7, "values": _reference_row("H-002", "")},
        {
            "row_number": 8,
            "values": _reference_row("H-004", "L-004", customer="Customer C", rm_qty=4),
        },
        {"row_number": 9, "values": ["BAR CROPPER", "", "TOTAL", "Supplier A", "", "BATCH-1"]},
        {"row_number": 10, "values": ["Distinct Lot Numbers"]},
        {"row_number": 11, "values": ["Lot No.", "Heats Assigned", "Total RM Qty (MT)"]},
        {"row_number": 12, "values": ["L-001", "H-001", 10]},
        {"row_number": 13, "values": ["(no lot assigned)", "H-002, H-004"]},
    ]
    sources = {
        "rm-heat-plan-vs-actual": {
            "worksheet": {
                "key": "rm-heat-plan-vs-actual",
                "name": "RM Heat Plan vs Actual",
                "worksheet_id": 217356585,
            },
            "spreadsheet_id": "test-sheet",
            "headers": PLAN_HEADERS,
            "records": deepcopy(plan_records),
            "record_count": len(plan_records),
            "page_count": 1,
            "page": 1,
            "page_size": 200,
            "fetched_at": "2026-10-17T10:00:00+00:00",
            "cache_hit": False,
            "is_stale": False,
            "refresh_error": None,
            "source_context_rows": [
                {"row_number": 1, "values": ["RM Heat-wise Plan vs Actual"]},
                {
                    "row_number": 2,
                    "values": [
                        "Yield vs Plan compares Actual: Forming OK against Plan: Clip Prod."
                    ],
                },
            ],
        },
        "heat-lot-number-reference": {
            "worksheet": {
                "key": "heat-lot-number-reference",
                "name": "Heat & Lot Number Reference",
                "worksheet_id": 1881319427,
            },
            "spreadsheet_id": "test-sheet",
            "headers": REFERENCE_HEADERS,
            "records": deepcopy(reference_records),
            "record_count": len(reference_records),
            "page_count": 1,
            "page": 1,
            "page_size": 200,
            "fetched_at": "2026-10-17T10:00:00+00:00",
            "cache_hit": True,
            "is_stale": False,
            "refresh_error": None,
            "source_context_rows": [{"row_number": 1, "values": ["Heat & Lot Number Reference"]}],
        },
    }

    def read_source(key: str, **kwargs: Any) -> dict[str, Any]:
        result = dict(sources[key])
        if kwargs["page"] > 1:
            result["records"] = []
        return result

    monkeypatch.setattr(rm_service, "get_line_tracker_worksheet_data", read_source)
    return sources


@pytest.fixture
def authenticated_client() -> Iterator[TestClient]:
    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[check_line_tracker_access] = lambda: User(
        email="phase3_tester@patilgroup.com",
        employee_code="EMP-PHASE3",
        is_active=True,
    )
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def test_parses_detail_records_and_preserves_raw_source_rows(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    data = rm_service.get_rm_heat_plan_analytics(page_size=100)

    assert data["record_count"] == 3
    assert data["source_record_count"] == 9
    assert data["source_context_rows"][0]["values"] == ["RM Heat-wise Plan vs Actual"]
    assert [record["source_row"] for record in data["records"]] == [5, 6, 7]
    assert data["metrics"]["metrics"]["rm_qty_mt"] == {"total": 17, "record_count": 3}
    assert data["records"][0]["rm_qty_mt"] == 10
    assert data["records"][0]["reference_status"] == "exact"
    assert mock_sources["rm-heat-plan-vs-actual"]["worksheet"]["worksheet_id"] == 217356585


def test_composite_join_never_falls_back_to_heat_only(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    data = rm_service.get_rm_heat_plan_analytics(page_size=100)
    relation = data["relationship"]

    assert relation["matched_pair_count"] == 1
    assert relation["unmatched_plan_key_count"] == 1
    assert relation["reference_only_key_count"] == 1
    assert relation["plan_incomplete_key_count"] == 1
    assert relation["reference_incomplete_key_count"] == 1
    incomplete = next(row for row in data["records"] if row["heat_no"] == "H-002")
    assert incomplete["reference_status"] == "incomplete_key"
    assert incomplete["reference_row_numbers"] == []
    assert relation["crosswalk_entry_count"] == 1
    assert relation["crosswalk_matched_key_count"] == 1
    assert relation["reference_is_additive_with_plan"] is False


def test_duplicate_composite_keys_are_reported_as_ambiguous(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    mock_sources["rm-heat-plan-vs-actual"]["records"].insert(
        4,
        {"row_number": 8.5, "values": _plan_row("H-001", "L-001", rm_qty=1)},
    )
    mock_sources["rm-heat-plan-vs-actual"]["record_count"] += 1

    data = rm_service.get_rm_heat_plan_analytics(page_size=100)

    assert data["relationship"]["duplicate_plan_key_count"] == 1
    assert data["relationship"]["ambiguous_plan_key_count"] == 1
    assert all(
        row["reference_status"] == "ambiguous"
        for row in data["records"]
        if row["heat_no"] == "H-001"
    )
    assert data["relationship"]["matched_pair_count"] == 0


def test_consistency_differences_are_explicit(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    mock_sources["heat-lot-number-reference"]["records"][0]["values"] = _reference_row(
        "H-001", "L-001", supplier="Other Supplier", rm_qty=11
    )

    data = rm_service.get_rm_heat_plan_analytics()

    assert data["relationship"]["consistency_difference_count"] == 2
    assert {item["field"] for item in data["relationship"]["consistency_differences"]} == {
        "supplier",
        "rm_qty_mt",
    }
    assert any("source attribute differences" in warning for warning in data["validation_warnings"])


def test_yield_formula_and_source_aggregate_values_reconcile(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    data = rm_service.get_rm_heat_plan_analytics(page_size=100)

    assert data["yield_validation"] == {
        "definition": "Actual: Forming OK / Plan: Clip Prod (Nos)",
        "source_formula_count": 1,
        "independently_recomputed_count": 1,
        "mismatch_count": 0,
        "mismatch_source_rows": [],
    }
    assert data["records"][0]["computed_yield_fraction"] == pytest.approx(0.9)
    assert data["source_formula_reconciliation"]["rm_qty_mt"]["matches"] is True
    assert data["source_formula_reconciliation"]["plan_final_supply_nos"]["matches"] is True
    assert data["source_formula_reconciliation"]["actual_forming_ok"]["matches"] is True


def test_missing_values_remain_missing_and_actuals_have_coverage_counts(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    data = rm_service.get_rm_heat_plan_analytics(page_size=100)

    metrics = data["metrics"]["metrics"]
    assert metrics["actual_forming_ok"] == {"total": 84, "record_count": 2}
    assert metrics["rm_qty_mt"] == {"total": 17, "record_count": 3}
    assert data["metrics"]["has_actual_values_count"] == 2
    incomplete = next(row for row in data["records"] if row["heat_no"] == "H-002")
    assert incomplete["actual_forming_ok"] is None
    assert incomplete["actual_forming_rej"] is None


def test_search_filters_sorting_and_exact_pair_lookup(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    filtered = rm_service.get_rm_heat_plan_analytics(
        supplier="Supplier B",
        source_batch="BATCH-2",
        sort_by="rm_qty_mt",
        sort_order="desc",
        page_size=1,
    )
    exact = rm_service.get_rm_heat_plan_analytics(heat_no=" h-001 ", lot_no="l-001")

    assert filtered["filtered_record_count"] == 1
    assert filtered["records"][0]["heat_no"] == "H-003"
    assert exact["filtered_record_count"] == 1
    assert exact["records"][0]["lot_no"] == "L-001"
    with pytest.raises(ValueError, match="requires both"):
        rm_service.get_rm_heat_plan_analytics(heat_no="H-001")


def test_pagination_and_invalid_sort_are_validated(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    data = rm_service.get_rm_heat_plan_analytics(page=2, page_size=1)
    assert data["page_count"] == 3
    assert len(data["records"]) == 1

    with pytest.raises(ValueError, match="Unsupported sort field"):
        rm_service.get_rm_heat_plan_analytics(sort_by="arbitrary")


def test_reference_lookup_marks_plan_usage_and_does_not_sum_reference_qty(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    data = rm_service.get_heat_lot_reference_analytics(
        heat_no="H-001",
        lot_no="L-001",
    )

    assert data["record_count"] == 3
    assert data["filtered_record_count"] == 1
    assert data["records"][0]["plan_usage"] == "exact"
    assert data["records"][0]["plan_row_numbers"] == [5]
    assert "metrics" not in data
    assert data["relationship"]["reference_is_additive_with_plan"] is False


def test_empty_sources_return_empty_analytics(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    mock_sources["rm-heat-plan-vs-actual"]["records"] = []
    mock_sources["rm-heat-plan-vs-actual"]["record_count"] = 0
    mock_sources["heat-lot-number-reference"]["records"] = []
    mock_sources["heat-lot-number-reference"]["record_count"] = 0

    data = rm_service.get_rm_heat_plan_analytics()

    assert data["record_count"] == 0
    assert data["records"] == []
    assert data["filter_options"] == {"customers": [], "suppliers": [], "source_batches": []}


def test_stale_source_state_is_preserved_for_both_worksheets(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    mock_sources["rm-heat-plan-vs-actual"]["is_stale"] = True
    mock_sources["rm-heat-plan-vs-actual"]["refresh_error"] = "Plan refresh failed"
    mock_sources["heat-lot-number-reference"]["is_stale"] = True
    mock_sources["heat-lot-number-reference"]["refresh_error"] = "Reference refresh failed"

    data = rm_service.get_rm_heat_plan_analytics()

    assert data["is_stale"] is True
    assert data["refresh_error"] == "Plan refresh failed; Reference refresh failed"
    assert data["sources"]["plan"]["is_stale"] is True
    assert data["sources"]["reference"]["is_stale"] is True


def test_api_endpoints_use_existing_rbac_and_filters(
    authenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    monkeypatch.setattr(
        line_tracker_routes,
        "get_rm_heat_plan_analytics",
        rm_service.get_rm_heat_plan_analytics,
    )
    monkeypatch.setattr(
        line_tracker_routes,
        "get_heat_lot_reference_analytics",
        rm_service.get_heat_lot_reference_analytics,
    )
    plan = authenticated_client.get(
        "/api/v1/line-tracker/raw-material/plan-actual?supplier=Supplier%20B"
    )
    reference = authenticated_client.get(
        "/api/v1/line-tracker/raw-material/heat-lot-reference?heat_no=H-001&lot_no=L-001"
    )

    assert plan.status_code == 200
    assert plan.json()["records"][0]["supplier"] == "Supplier B"
    assert reference.status_code == 200
    assert reference.json()["records"][0]["plan_usage"] == "exact"


def test_api_reports_validation_authentication_and_upstream_errors(
    authenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    incomplete_lookup = authenticated_client.get(
        "/api/v1/line-tracker/raw-material/plan-actual?heat_no=H-001"
    )
    assert incomplete_lookup.status_code == 400

    def fail_read(**kwargs: Any) -> dict[str, Any]:
        raise WorksheetReadError("test upstream failure")

    monkeypatch.setattr(line_tracker_routes, "get_rm_heat_plan_analytics", fail_read)
    upstream = authenticated_client.get("/api/v1/line-tracker/raw-material/plan-actual")
    assert upstream.status_code == 502
    assert upstream.json()["detail"] == "test upstream failure"

    authenticated_override = app.dependency_overrides.pop(check_line_tracker_access)
    try:
        with TestClient(app) as unauthenticated_client:
            unauthenticated = unauthenticated_client.get(
                "/api/v1/line-tracker/raw-material/heat-lot-reference"
            )
    finally:
        app.dependency_overrides[check_line_tracker_access] = authenticated_override
    assert unauthenticated.status_code == 401


def test_unexpected_source_sheet_id_is_rejected_as_upstream_data_error(
    mock_sources: dict[str, dict[str, Any]],
) -> None:
    mock_sources["rm-heat-plan-vs-actual"]["worksheet"]["worksheet_id"] = 7

    with pytest.raises(WorksheetReadError, match="did not match"):
        rm_service.get_rm_heat_plan_analytics()
