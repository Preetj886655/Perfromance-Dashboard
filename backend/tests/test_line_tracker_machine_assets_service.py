"""Tests for Phase 4 machine assets and scheduled-event views."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.routes import line_tracker as route_module
from app.api.routes.line_tracker import check_line_tracker_access
from app.main import app
from app.models.user import User
from app.services import line_tracker_machine_assets_service as assets_service
from app.services.line_tracker_worksheet_service import WorksheetReadError

MASTER_HEADERS = [
    "Work Center",
    "Machine",
    "Current Rated CT (sec)",
    "Status",
    "Notes",
    "Commissioning Date",
    "Manpower Required (Rated) / Shift",
    "Decommissioned Date",
    "Output",
    "Hourly",
    "Shift",
    "Day",
    "85 %",
]
CONSUMABLE_HEADERS = [
    "Work Center",
    "Machine",
    "Consumable",
    "Category",
    "Typical Change Frequency",
    "Last Changed Date",
    "Next Due Date",
    "Notes",
]
CAPACITY_HEADERS = [
    "Date Changed",
    "Work Center",
    "Machine",
    "Old Rated CT (sec)",
    "New Rated CT (sec)",
    "Reason / Notes",
]
SHUTDOWN_HEADERS = [
    "Start Date",
    "End Date",
    "Scope",
    "Scope Detail (Work Center or Machine)",
    "Hours Affected / Day",
    "Reason",
    "Notes",
]


def _machine(
    work_center: str,
    machine: str,
    ct: float | None,
    status: str = "Active",
) -> list[Any]:
    if ct and ct > 0:
        output = 60 / ct
        hourly = output * 60
        shift = hourly * 11
        day = shift * 2
        adjusted = day * 0.85
    else:
        output = hourly = shift = day = adjusted = None
    return [
        work_center,
        machine,
        ct,
        status,
        None,
        None,
        1,
        None,
        output,
        hourly,
        shift,
        day,
        adjusted,
    ]


@pytest.fixture
def source_data(monkeypatch: pytest.MonkeyPatch) -> dict[str, dict[str, Any]]:
    sources = {
        "machine-master": {
            "worksheet": {
                "key": "machine-master",
                "name": "Machine Master",
                "worksheet_id": 1022871279,
            },
            "spreadsheet_id": "phase4-test-sheet",
            "headers": MASTER_HEADERS,
            "records": [
                {"row_number": 2, "values": _machine("Turning", "CNC 1", 10)},
                {"row_number": 3, "values": _machine("Forming", "SBL", 20, "De-Comissioned")},
                {"row_number": 4, "values": _machine("Clip", "Quench Tank", None)},
                {"row_number": 5, "values": ["How to use this tab:"]},
            ],
            "record_count": 4,
            "page_count": 1,
            "page": 1,
            "page_size": 200,
            "fetched_at": "2026-10-17T10:00:00+00:00",
            "cache_hit": False,
            "is_stale": False,
            "refresh_error": None,
            "source_context_rows": [],
        },
        "machine-consumables": {
            "worksheet": {
                "key": "machine-consumables",
                "name": "Machine Consumables",
                "worksheet_id": 1208025434,
            },
            "spreadsheet_id": "phase4-test-sheet",
            "headers": CONSUMABLE_HEADERS,
            "records": [
                {
                    "row_number": 5,
                    "values": [
                        "Turning",
                        "CNC 1",
                        "Cutting Insert",
                        "Tooling",
                        "Per shift",
                        "",
                        "",
                        "Starting list",
                    ],
                },
                {
                    "row_number": 6,
                    "values": [
                        "Forming",
                        "SBL",
                        "Spring Forming Tool",
                        "Tooling",
                        "Wear-based",
                        "2000-01-01",
                        "2000-01-02",
                        "History row",
                    ],
                },
                {"row_number": 7, "values": ["How to use this tab:"]},
            ],
            "record_count": 3,
            "page_count": 1,
            "page": 1,
            "page_size": 200,
            "fetched_at": "2026-10-17T10:00:00+00:00",
            "cache_hit": True,
            "is_stale": False,
            "refresh_error": None,
            "source_context_rows": [],
        },
        "capacity-change-log": {
            "worksheet": {
                "key": "capacity-change-log",
                "name": "Capacity Change Log",
                "worksheet_id": 1408359762,
            },
            "spreadsheet_id": "phase4-test-sheet",
            "headers": CAPACITY_HEADERS,
            "records": [
                {
                    "row_number": 2,
                    "values": [
                        "2026-09-20",
                        "Turning",
                        "CNC 1",
                        10,
                        10,
                        "Example row; replace later",
                    ],
                },
                {
                    "row_number": 3,
                    "values": [
                        "2026-10-01",
                        "Turning",
                        "CNC 1",
                        20,
                        18,
                        "Confirmed machine cycle-time update",
                    ],
                },
                {
                    "row_number": 4,
                    "values": [
                        "2026-10-02",
                        "Turning",
                        "CNC 1",
                        0,
                        10,
                        "Confirmed but invalid zero cycle time",
                    ],
                },
            ],
            "record_count": 3,
            "page_count": 1,
            "page": 1,
            "page_size": 200,
            "fetched_at": "2026-10-17T10:00:00+00:00",
            "cache_hit": True,
            "is_stale": False,
            "refresh_error": None,
            "source_context_rows": [],
        },
        "planned-shutdowns": {
            "worksheet": {
                "key": "planned-shutdowns",
                "name": "Planned Shutdowns",
                "worksheet_id": 1171824600,
            },
            "spreadsheet_id": "phase4-test-sheet",
            "headers": SHUTDOWN_HEADERS,
            "records": [
                {
                    "row_number": 2,
                    "values": [
                        "2026-01-26",
                        "2026-01-26",
                        "All Machines",
                        "",
                        24,
                        "Example holiday",
                        "Example; replace",
                    ],
                },
                {
                    "row_number": 3,
                    "values": [
                        "2026-10-20",
                        "2026-10-21",
                        "Work Center",
                        "Turning",
                        2,
                        "Confirmed maintenance",
                        "Confirmed schedule",
                    ],
                },
                {
                    "row_number": 4,
                    "values": [
                        "2026-10-21",
                        "2026-10-22",
                        "Work Center",
                        "Turning",
                        1,
                        "Confirmed work",
                        "Confirmed schedule",
                    ],
                },
            ],
            "record_count": 3,
            "page_count": 1,
            "page": 1,
            "page_size": 200,
            "fetched_at": "2026-10-17T10:00:00+00:00",
            "cache_hit": True,
            "is_stale": False,
            "refresh_error": None,
            "source_context_rows": [],
        },
    }

    def read_source(key: str, **kwargs: Any) -> dict[str, Any]:
        result = dict(sources[key])
        if kwargs["page"] > 1:
            result["records"] = []
        return result

    monkeypatch.setattr(assets_service, "get_line_tracker_worksheet_data", read_source)
    return sources


@pytest.fixture
def authorized_client() -> Iterator[TestClient]:
    overrides = app.dependency_overrides.copy()
    app.dependency_overrides[check_line_tracker_access] = lambda: User(
        email="phase4_tester@patilgroup.com",
        employee_code="EMP-PHASE4",
        is_active=True,
    )
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)


def test_machine_master_validates_capacity_formulas_and_filters(
    source_data: dict[str, Any],
) -> None:
    result = assets_service.get_machine_master_analytics(
        work_center="Turning",
        sort_by="hourly_capacity",
        sort_order="desc",
    )

    assert result["record_count"] == 3
    assert result["filtered_record_count"] == 1
    machine = result["records"][0]
    assert machine["machine"] == "CNC 1"
    assert machine["rated_ct_sec"] == 10
    assert machine["output_per_minute"] == 6
    assert machine["hourly_capacity"] == 360
    assert machine["shift_capacity"] == 3960
    assert machine["day_capacity"] == 7920
    assert machine["capacity_at_85_percent"] == 6732
    assert machine["capacity_validation"] == "verified"
    assert result["summary"]["status_counts"]["De-Comissioned"] == 1
    assert result["summary"]["capacity_validation_counts"]["incomplete"] == 1


def test_machine_schema_and_composite_key_uniqueness(source_data: dict[str, Any]) -> None:
    result = assets_service.get_machine_master_analytics(page_size=100)
    assert result["summary"]["machine_count"] == 3
    assert result["summary"]["unique_machine_key_count"] == 3
    assert result["summary"]["duplicate_key_count"] == 0
    assert result["worksheet"]["worksheet_id"] == 1022871279
    source_data["machine-master"]["worksheet"]["worksheet_id"] = 1
    with pytest.raises(WorksheetReadError, match="did not match"):
        assets_service.get_machine_master_analytics()
    source_data["machine-master"]["worksheet"]["worksheet_id"] = 1022871279

    source_data["machine-master"]["records"].append(
        {
            "row_number": 6,
            "values": _machine("Turning", "CNC 1", 10),
        }
    )
    duplicate = assets_service.get_machine_master_analytics(page_size=100)
    assert duplicate["summary"]["duplicate_key_count"] == 1
    joined = assets_service.get_machine_consumables_analytics(page_size=100)
    assert (
        next(row for row in joined["records"] if row["machine"] == "CNC 1")["machine_match"]
        == "ambiguous"
    )


def test_machine_registry_pagination_is_stable(source_data: dict[str, Any]) -> None:
    result = assets_service.get_machine_master_analytics(
        page=2,
        page_size=1,
        sort_by="source_row",
    )
    assert result["page"] == 2
    assert result["page_count"] == 3
    assert result["filtered_record_count"] == 3
    assert result["records"][0]["machine"] == "SBL"


def test_missing_or_expired_consumable_dates_do_not_become_stock_alerts(
    source_data: dict[str, Any],
) -> None:
    result = assets_service.get_machine_consumables_analytics(page_size=100)
    rows = {row["machine"]: row for row in result["records"]}
    assert rows["CNC 1"]["machine_match"] == "matched"
    assert rows["CNC 1"]["due_status"] == "missing"
    assert rows["SBL"]["due_status"] == "past date"
    assert result["summary"]["missing_next_due_date_count"] == 1
    assert result["summary"]["past_date_count"] == 1
    assert not any(
        "stock" in warning.casefold() or "reorder" in warning.casefold()
        for warning in result["validation_warnings"]
    )

    source_data["machine-consumables"]["records"].append(
        {
            "row_number": 8,
            "values": [
                "Turning",
                "CNC 1",
                "Invalid date test",
                "Tooling",
                "Per shift",
                "not-a-date",
                "also-not-a-date",
                "Invalid dates",
            ],
        }
    )
    invalid = assets_service.get_machine_consumables_analytics(page_size=100)
    invalid_record = next(row for row in invalid["records"] if row["source_row"] == 8)
    assert invalid_record["due_status"] == "invalid"
    assert invalid_record["last_changed_date"] == "not-a-date"
    assert invalid_record["next_due_date"] == "also-not-a-date"


def test_capacity_examples_are_not_reported_as_confirmed_changes(
    source_data: dict[str, Any],
) -> None:
    result = assets_service.get_capacity_change_analytics(page_size=100)
    rows = {row["source_row"]: row for row in result["records"]}
    assert rows[2]["classification"] == "example"
    assert rows[2]["percentage_change"] is None
    assert rows[2]["machine_match"] == "matched"
    assert rows[3]["classification"] == "confirmed"
    assert rows[3]["percentage_change"] == pytest.approx(-10)
    assert rows[4]["cycle_times_comparable"] is False
    assert rows[4]["percentage_change"] is None
    assert result["summary"] == {
        "example_count": 1,
        "confirmed_count": 2,
        "unverified_count": 0,
    }


def test_shutdown_date_validation_overlap_and_confirmed_hours(
    source_data: dict[str, Any],
) -> None:
    result = assets_service.get_planned_shutdown_analytics(page_size=100)
    rows = {row["source_row"]: row for row in result["records"]}
    assert rows[2]["classification"] == "example"
    assert rows[2]["estimated_hours"] is None
    assert rows[3]["duration_days"] == 2
    assert rows[3]["estimated_hours"] == 4
    assert rows[3]["overlaps_source_rows"] == [4]
    assert rows[4]["overlaps_source_rows"] == [3]
    assert len(rows[3]["linked_machine_keys"]) == 1
    assert result["summary"]["overlap_count"] == 2
    assert result["summary"]["estimated_confirmed_hours"] is None

    source_data["planned-shutdowns"]["records"][1]["values"][1] = "2026-10-19"
    invalid = assets_service.get_planned_shutdown_analytics(page_size=100)
    row = next(item for item in invalid["records"] if item["source_row"] == 3)
    assert row["date_range_valid"] is False
    assert row["estimated_hours"] is None
    assert invalid["record_count"] == 3


def test_instruction_rows_are_not_parsed_as_machine_events(source_data: dict[str, Any]) -> None:
    source_data["planned-shutdowns"]["records"].append(
        {
            "row_number": 5,
            "values": [
                "Add a row per planned shutdown with its date range.",
            ],
        }
    )
    result = assets_service.get_planned_shutdown_analytics(page_size=100)
    assert result["record_count"] == 3
    assert all(row["source_row"] != 5 for row in result["records"])


def test_search_sort_pagination_and_invalid_schema(source_data: dict[str, Any]) -> None:
    result = assets_service.get_machine_consumables_analytics(
        search="Cutting Insert",
        page=1,
        page_size=1,
        sort_by="machine",
        sort_order="desc",
    )
    assert result["filtered_record_count"] == 1
    assert result["page_count"] == 1
    assert result["records"][0]["machine"] == "CNC 1"

    with pytest.raises(ValueError, match="Unsupported sort field"):
        assets_service.get_machine_master_analytics(sort_by="spreadsheet_id")

    source_data["machine-consumables"]["headers"] = ["wrong"]
    with pytest.raises(WorksheetReadError, match="missing expected headers"):
        assets_service.get_machine_consumables_analytics()


def test_stale_source_state_and_empty_worksheets(source_data: dict[str, Any]) -> None:
    source_data["machine-master"]["is_stale"] = True
    source_data["machine-master"]["refresh_error"] = "Master refresh failed"
    result = assets_service.get_machine_consumables_analytics()
    assert result["is_stale"] is True
    assert "Master refresh failed" in result["refresh_error"]
    assert result["sources"]["machine_master"]["is_stale"] is True

    source_data["machine-master"]["records"] = []
    source_data["machine-consumables"]["records"] = []
    empty = assets_service.get_machine_consumables_analytics()
    assert empty["record_count"] == 0
    assert empty["records"] == []


def test_all_phase_four_api_endpoints_use_rbac_and_ignore_client_sheet_selection(
    authorized_client: TestClient,
    source_data: dict[str, Any],
) -> None:
    endpoints = [
        "/api/v1/line-tracker/assets/machine-master",
        "/api/v1/line-tracker/assets/machine-consumables",
        "/api/v1/line-tracker/assets/capacity-change-log",
        "/api/v1/line-tracker/assets/planned-shutdowns",
    ]
    for endpoint in endpoints:
        response = authorized_client.get(endpoint + "?spreadsheet_id=attacker-controlled")
        assert response.status_code == 200
        assert response.json()["spreadsheet_id"] == "phase4-test-sheet"

    previous = app.dependency_overrides.pop(check_line_tracker_access)
    try:
        with TestClient(app) as client:
            response = client.get(endpoints[0])
    finally:
        app.dependency_overrides[check_line_tracker_access] = previous
    assert response.status_code == 401


def test_api_reports_bad_queries_and_upstream_errors(
    authorized_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    source_data: dict[str, Any],
) -> None:
    invalid = authorized_client.get(
        "/api/v1/line-tracker/assets/machine-master?sort_by=spreadsheet_id"
    )
    assert invalid.status_code == 422

    def fail(**kwargs: Any) -> dict[str, Any]:
        raise WorksheetReadError("Phase 4 upstream test failure")

    monkeypatch.setattr(route_module, "get_machine_master_analytics", fail)
    upstream = authorized_client.get("/api/v1/line-tracker/assets/machine-master")
    assert upstream.status_code == 502
    assert upstream.json()["detail"] == "Phase 4 upstream test failure"
