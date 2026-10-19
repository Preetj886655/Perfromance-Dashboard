"""Tests for Phase 5 shift-entry and manpower analytics."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.routes import line_tracker as route_module
from app.api.routes.line_tracker import check_line_tracker_access
from app.main import app
from app.models.user import User
from app.services import line_tracker_shift_manpower_service as shift_service
from app.services.line_tracker_worksheet_service import WorksheetReadError

ENTRY_HEADERS = [
    "Date",
    "Shift",
    "Shift Duration (min)",
    "Source",
    "Work Center",
    "Machine",
    "Rated CT (sec)",
    "Output Qty",
    "Downtime (min)",
    "Rejects (Other Ops)",
    "Actual CT (sec)",
    "Efficiency %",
    "Status vs Rated",
    "Downtime Category",
    "Breakdown Type",
    "Downtime Description",
    "Planned Shutdown (min)",
    "Availability %",
    "Performance %",
    "Quality %",
    "OEE %",
    "Planned Manpower",
    "Actual Manpower",
    "Manpower Shortfall",
    "RM Heat Nr",
    "Bundle Nr",
    "Lot Number",
    "Part",
    "OP10 Rejects (Forming)",
    "OP20 Rejects (Forming)",
    "OP30 Rejects (Forming)",
    "Total Rejects",
]


def _entry(
    *,
    date: str | None,
    machine: str,
    work_center: str = "Turning",
    output_qty: int | None = 300,
    actual_manpower: int | None = 2,
    heat: str | None = "H-1",
    lot: str | None = "L-1",
) -> list[Any]:
    downtime = 0 if output_qty is not None else None
    planned_shutdown = 0
    actual_ct = 132 if output_qty else None
    efficiency = 10 / actual_ct if actual_ct else None
    availability = 1 if output_qty else 1
    performance = output_qty * 10 / 39600 if output_qty else 0
    quality = 0.99 if output_qty else None
    oee = availability * performance * quality if quality is not None else None
    actual = actual_manpower
    return [
        date,
        "Shift 1 (Day)" if date else None,
        660,
        "Live",
        work_center,
        machine,
        10,
        output_qty,
        downtime,
        3 if output_qty is not None else None,
        actual_ct,
        efficiency,
        "Slower than rated" if actual_ct else None,
        None,
        None,
        None,
        planned_shutdown,
        availability,
        performance,
        quality,
        oee,
        1,
        actual,
        1 - actual if actual is not None else None,
        heat,
        None,
        lot,
        "Test part",
        1 if work_center == "Forming" and output_qty is not None else None,
        2 if work_center == "Forming" and output_qty is not None else None,
        None,
        3 if output_qty is not None else None,
    ]


def _source(
    key: str,
    name: str,
    worksheet_id: int,
    headers: list[str],
    records: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "source": "google-sheets",
        "spreadsheet_id": "phase5-test-sheet",
        "worksheet": {
            "key": key,
            "name": name,
            "group": "Operations",
            "layout": "grid" if key == "manpower-summary" else "table",
            "header_row": 1,
            "worksheet_id": worksheet_id,
            "grid_row_count": 1000,
            "grid_column_count": len(headers),
        },
        "headers": headers,
        "records": records,
        "record_count": len(records),
        "page_count": 1,
        "page": 1,
        "page_size": 200,
        "fetched_at": "2026-10-17T10:00:00+00:00",
        "cache_hit": False,
        "is_stale": False,
        "refresh_error": None,
        "validation_warnings": [],
    }


@pytest.fixture
def phase5_sources(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    entries = _source(
        "entries",
        "Entries",
        1019432778,
        ENTRY_HEADERS,
        [
            {"row_number": 2, "values": _entry(date="2026-09-20", machine="CNC 1")},
            {
                "row_number": 3,
                "values": _entry(
                    date=None,
                    machine="CNC 1",
                    output_qty=None,
                    actual_manpower=None,
                    heat=None,
                    lot=None,
                ),
            },
            {
                "row_number": 4,
                "values": _entry(
                    date="2026-09-19",
                    machine="Press 1",
                    work_center="Forming",
                    actual_manpower=3,
                    heat="H-2",
                    lot="L-2",
                ),
            },
        ],
    )
    grid_headers = ["Row", "A", "B", "C", "D", "E", "F"]
    manpower = _source(
        "manpower-summary",
        "Manpower Summary",
        1841059416,
        grid_headers,
        [
            {
                "row_number": 5,
                "values": [
                    5,
                    "Work Center",
                    "Avg Planned",
                    "Avg Actual",
                    "Total Shortfall",
                    "Shifts Logged",
                ],
            },
            {"row_number": 6, "values": [6, "Turning", 1, 2, -1, 1]},
            {"row_number": 7, "values": [7, "Forming", 1, 3, -2, 1]},
            {
                "row_number": 18,
                "values": [
                    18,
                    "Machine",
                    "Rated Manpower / Shift",
                    "Avg Planned",
                    "Avg Actual",
                    "Total Shortfall",
                    "Shifts Logged",
                ],
            },
            {"row_number": 19, "values": [19, "CNC 1", 1, 1, 2, -1, 1]},
            {"row_number": 20, "values": [20, "Press 1", 1, 1, 3, -2, 1]},
        ],
    )
    sources = {"entries": entries, "manpower-summary": manpower}

    def read_source(key: str, **kwargs: Any) -> dict[str, Any]:
        result = dict(sources[key])
        if kwargs["page"] > 1:
            result["records"] = []
        return result

    machine_data = {
        "source": "google-sheets",
        "spreadsheet_id": "phase5-test-sheet",
        "worksheet": {"name": "Machine Master", "worksheet_id": 1022871279},
        "fetched_at": "2026-10-17T10:00:00+00:00",
        "cache_hit": False,
        "is_stale": False,
        "refresh_error": None,
        "records": [
            {
                "source_row": 2,
                "work_center": "Turning",
                "machine": "CNC 1",
                "rated_ct_sec": 10,
                "manpower_per_shift": 1,
            },
            {
                "source_row": 3,
                "work_center": "Forming",
                "machine": "Press 1",
                "rated_ct_sec": 10,
                "manpower_per_shift": 1,
            },
        ],
    }
    heat_data = {
        "source": "google-sheets",
        "spreadsheet_id": "phase5-test-sheet",
        "worksheet": {"name": "Heat & Lot Number Reference", "worksheet_id": 1881319427},
        "fetched_at": "2026-10-17T10:00:00+00:00",
        "cache_hit": False,
        "is_stale": False,
        "refresh_error": None,
        "sources": {
            "reference": {
                "worksheet": "Heat & Lot Number Reference",
                "worksheet_id": 1881319427,
                "fetched_at": "2026-10-17T10:00:00+00:00",
                "cache_hit": False,
                "is_stale": False,
                "refresh_error": None,
            }
        },
        "records": [
            {"source_row": 5, "heat_no": "H-1", "lot_no": "L-1"},
            {"source_row": 6, "heat_no": "H-2", "lot_no": "L-2"},
        ],
    }
    monkeypatch.setattr(shift_service, "get_line_tracker_worksheet_data", read_source)
    monkeypatch.setattr(
        shift_service, "get_machine_master_analytics", lambda **kwargs: machine_data
    )
    monkeypatch.setattr(
        shift_service, "get_heat_lot_reference_analytics", lambda **kwargs: heat_data
    )
    return {"sources": sources, "machine_data": machine_data, "heat_data": heat_data}


def test_entries_preserve_missing_values_and_validate_formulas_and_joins(
    phase5_sources: dict[str, Any],
) -> None:
    result = shift_service.get_shift_entries_analytics(page_size=100)
    assert result["worksheet"]["worksheet_id"] == 1019432778
    assert result["record_count"] == 3
    assert result["summary"]["dated_entry_count"] == 2
    assert result["summary"]["incomplete_entry_count"] == 1
    assert result["summary"]["machine_match_counts"] == {"matched": 3}
    assert result["summary"]["heat_lot_match_counts"] == {
        "matched": 2,
        "incomplete_key": 1,
    }
    first = next(row for row in result["records"] if row["source_row"] == 2)
    assert first["actual_ct_sec"] == pytest.approx(132)
    assert first["formula_validations"]["Actual CT (sec)"] == "match"
    assert first["formula_validations"]["OEE %"] == "match"
    incomplete = next(row for row in result["records"] if row["source_row"] == 3)
    assert incomplete["date"] is None
    assert incomplete["output_qty"] is None
    assert incomplete["record_status"] == "incomplete"
    assert incomplete["machine_match"] == "matched"
    assert result["summary"]["output_qty"] == {
        "known_total": 600,
        "known_value_count": 2,
        "missing_value_count": 1,
    }


def test_entries_filters_sorting_pagination_and_date_validation(
    phase5_sources: dict[str, Any],
) -> None:
    filtered = shift_service.get_shift_entries_analytics(
        date_from="2026-09-20",
        work_center="turning",
        page=1,
        page_size=1,
        sort_by="source_row",
    )
    assert filtered["filtered_record_count"] == 1
    assert filtered["records"][0]["machine"] == "CNC 1"
    second_page = shift_service.get_shift_entries_analytics(
        page=2,
        page_size=1,
        sort_by="source_row",
        sort_order="asc",
    )
    assert second_page["page_count"] == 3
    assert second_page["records"][0]["source_row"] == 3
    with pytest.raises(ValueError, match="date_from must be on or before"):
        shift_service.get_shift_entries_analytics(date_from="2026-09-21", date_to="2026-09-20")
    with pytest.raises(ValueError, match="Unsupported sort field"):
        shift_service.get_shift_entries_analytics(sort_by="spreadsheet_id")


def test_manpower_summary_recomputes_distinct_sections(
    phase5_sources: dict[str, Any],
) -> None:
    machine_result = shift_service.get_manpower_summary_analytics(page_size=100)
    assert machine_result["summary"]["machine_count"] == 2
    assert machine_result["summary"]["machine_reconciliation"] == {
        "matched": 2,
        "mismatched": 0,
        "unverifiable": 0,
    }
    assert machine_result["summary"]["rated_manpower_mismatch_count"] == 0
    assert all(row["formula_reconciliation"] == "matched" for row in machine_result["records"])

    work_center_result = shift_service.get_manpower_summary_analytics(
        level="work-center", page_size=100
    )
    assert work_center_result["summary"]["work_center_count"] == 2
    assert work_center_result["summary"]["work_center_reconciliation"] == {
        "matched": 2,
        "mismatched": 0,
        "unverifiable": 0,
    }
    assert (
        next(row for row in work_center_result["records"] if row["name"] == "Turning")[
            "dated_entry_count"
        ]
        == 1
    )
    phase5_sources["sources"]["manpower-summary"]["records"][1]["values"][2] = 123
    discrepancy = shift_service.get_manpower_summary_analytics(
        level="work-center",
        page_size=100,
    )
    turning = next(row for row in discrepancy["records"] if row["name"] == "Turning")
    assert turning["avg_planned"] == 123
    assert turning["formula_reconciliation"] == "mismatched"


def test_manpower_summary_rejects_missing_section_headers(
    phase5_sources: dict[str, Any],
) -> None:
    phase5_sources["sources"]["manpower-summary"]["records"][0]["values"][2] = "Planned Avg"
    with pytest.raises(WorksheetReadError, match="missing expected work-center or machine"):
        shift_service.get_manpower_summary_analytics()


def test_bad_schema_and_source_ids_are_rejected(
    phase5_sources: dict[str, Any],
) -> None:
    phase5_sources["sources"]["entries"]["worksheet"]["worksheet_id"] = 1
    with pytest.raises(WorksheetReadError, match="did not match"):
        shift_service.get_shift_entries_analytics()


def test_duplicate_composite_references_are_explicit(
    phase5_sources: dict[str, Any],
) -> None:
    phase5_sources["machine_data"]["records"].append(
        dict(phase5_sources["machine_data"]["records"][0])
    )
    phase5_sources["heat_data"]["records"].append(
        {"source_row": 7, "heat_no": "H-1", "lot_no": "L-1"}
    )
    result = shift_service.get_shift_entries_analytics(page_size=100)
    first = next(row for row in result["records"] if row["source_row"] == 2)
    assert first["machine_match"] == "ambiguous"
    assert first["heat_lot_match"] == "ambiguous"
    assert first["record_status"] == "incomplete"
    assert first["heat_reference_row_numbers"] == [5, 7]


def test_formula_mismatch_and_stale_or_empty_source_states_are_explicit(
    phase5_sources: dict[str, Any],
) -> None:
    first_values = phase5_sources["sources"]["entries"]["records"][0]["values"]
    first_values[10] = 99
    mismatch = shift_service.get_shift_entries_analytics(page_size=100)
    first = next(row for row in mismatch["records"] if row["source_row"] == 2)
    assert first["formula_validations"]["Actual CT (sec)"] == "mismatch"
    assert first["formula_validations"]["Efficiency %"] == "mismatch"

    phase5_sources["sources"]["entries"]["is_stale"] = True
    phase5_sources["sources"]["entries"]["refresh_error"] = "Read timeout"
    stale = shift_service.get_shift_entries_analytics()
    assert stale["is_stale"] is True
    assert stale["refresh_error"] == "Read timeout"

    phase5_sources["sources"]["entries"]["records"] = []
    empty = shift_service.get_shift_entries_analytics()
    assert empty["record_count"] == 0
    assert empty["records"] == []
    assert empty["summary"]["output_qty"]["known_total"] == 0


@pytest.fixture
def authorized_client() -> Iterator[TestClient]:
    overrides = app.dependency_overrides.copy()
    app.dependency_overrides[check_line_tracker_access] = lambda: User(
        email="phase5_tester@patilgroup.com",
        employee_code="EMP-PHASE5",
        is_active=True,
    )
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)


def test_phase_five_routes_require_rbac_and_validate_parameters(
    authorized_client: TestClient,
    phase5_sources: dict[str, Any],
) -> None:
    entries = authorized_client.get("/api/v1/line-tracker/operations/entries")
    manpower = authorized_client.get(
        "/api/v1/line-tracker/operations/manpower-summary?level=work-center"
    )
    assert entries.status_code == 200
    assert entries.json()["spreadsheet_id"] == "phase5-test-sheet"
    assert manpower.status_code == 200
    assert manpower.json()["level"] == "work-center"
    assert (
        authorized_client.get("/api/v1/line-tracker/operations/entries?date_from=bad").status_code
        == 400
    )
    assert (
        authorized_client.get(
            "/api/v1/line-tracker/operations/manpower-summary?level=arbitrary"
        ).status_code
        == 422
    )

    previous = app.dependency_overrides.pop(check_line_tracker_access)
    try:
        with TestClient(app) as client:
            unauthorized = client.get("/api/v1/line-tracker/operations/entries")
    finally:
        app.dependency_overrides[check_line_tracker_access] = previous
    assert unauthorized.status_code == 401


def test_phase_five_routes_report_source_errors(
    authorized_client: TestClient,
    phase5_sources: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(**kwargs: Any) -> dict[str, Any]:
        raise WorksheetReadError("Phase 5 source failure")

    monkeypatch.setattr(route_module, "get_shift_entries_analytics", fail)
    response = authorized_client.get("/api/v1/line-tracker/operations/entries")
    assert response.status_code == 502
    assert response.json()["detail"] == "Phase 5 source failure"
