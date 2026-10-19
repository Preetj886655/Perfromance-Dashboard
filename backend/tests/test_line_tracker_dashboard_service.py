"""Tests for live-source Phase 6 dashboard calculations."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.routes import line_tracker as route_module
from app.api.routes.line_tracker import check_line_tracker_access
from app.main import app
from app.models.user import User
from app.services import line_tracker_dashboard_service as dashboard_service
from app.services.line_tracker_worksheet_service import WorksheetReadError


def _grid_source(key: str, name: str, sheet_id: int, rows: dict[int, list[Any]]) -> dict[str, Any]:
    return {
        "source": "google-sheets",
        "spreadsheet_id": "phase6-test-sheet",
        "worksheet": {
            "key": key,
            "name": name,
            "group": "Dashboards",
            "layout": "grid",
            "header_row": None,
            "worksheet_id": sheet_id,
            "grid_row_count": 100,
            "grid_column_count": 10,
        },
        "headers": ["Row", "A", "B", "C", "D", "E", "F", "G"],
        "records": [
            {"row_number": row_number, "values": [row_number, *values]}
            for row_number, values in rows.items()
        ],
        "record_count": len(rows),
        "page_count": 1,
        "page": 1,
        "page_size": 200,
        "fetched_at": "2026-10-17T10:00:00+00:00",
        "cache_hit": False,
        "is_stale": False,
        "refresh_error": None,
        "validation_warnings": [],
    }


def _downtime_record(
    source_row: int,
    day: str,
    *,
    stage: str = "Clip",
    machine: str = "Line 1",
    category: str = "Breakdown",
    downtime: float | None = 60,
    target: float | None = 100,
    actual: float | None = 80,
) -> dict[str, Any]:
    return {
        "source_row": source_row,
        "date": day,
        "line": "ERC",
        "shift": "A",
        "part": "MK5",
        "stage": stage,
        "machine": machine,
        "category": category,
        "breakdown_type": "Mechanical" if category == "Breakdown" else None,
        "downtime_min": downtime,
        "production_loss": 1,
        "target_nos": target,
        "actual_nos": actual,
    }


def _source_meta(name: str, sheet_id: int, key: str) -> dict[str, Any]:
    return {
        "spreadsheet_id": "phase6-test-sheet",
        "worksheet": {"name": name, "worksheet_id": sheet_id},
        "fetched_at": "2026-10-17T10:00:00+00:00",
        "cache_hit": False,
        "is_stale": False,
        "refresh_error": None,
        "sources": {
            key: {
                "worksheet": name,
                "worksheet_id": sheet_id,
                "fetched_at": "2026-10-17T10:00:00+00:00",
                "cache_hit": False,
                "is_stale": False,
                "refresh_error": None,
            }
        },
        "validation_warnings": [],
    }


def test_downtime_parser_excludes_mirrored_range_and_invalid_dates() -> None:
    source = _grid_source(
        "downtime-log",
        "Downtime Log",
        1490231673,
        {
            2: [
                "2026-09-18",
                "ERC",
                "A",
                "MK5",
                "Clip",
                "Line 1",
                "Breakdown",
                "Breakdown",
                "Mechanical",
                60,
                1,
                100,
                80,
            ],
            3: [
                "bad-date",
                "ERC",
                "A",
                "MK5",
                "Clip",
                "Line 1",
                "Breakdown",
                "Breakdown",
                "Mechanical",
                60,
                1,
                100,
                80,
            ],
            14569: [
                "2026-09-20",
                "ERC",
                "A",
                "MK5",
                "Clip",
                "Line 1",
                "Entry Mirror",
                "Breakdown",
                "Mechanical",
                60,
                1,
                100,
                80,
            ],
        },
    )
    source["headers"] = [
        "Row",
        "Date",
        "Line",
        "Shift",
        "Part",
        "Stage",
        "Machine",
        "Downtime Type (raw)",
        "Downtime Category",
        "Breakdown Type",
        "Downtime Mins",
        "Prod Loss NOS",
        "Prod Target NOS",
        "Total PROD NOS",
        "Rejection",
        "Description",
    ]
    records, quality = dashboard_service._downtime_records(source)
    assert [row["source_row"] for row in records] == [2]
    assert quality == {
        "mirror_formula_range_rows_excluded": 0,
        "nonempty_mirror_source_rows_excluded": 1,
        "invalid_dates": 1,
    }


def test_google_sheet_serial_dates_parse_as_calendar_dates() -> None:
    assert dashboard_service._date_value(46283).isoformat() == "2026-09-18"


def test_period_calculations_use_explicit_units_and_breakdown_category() -> None:
    rows = [
        _downtime_record(2, "2026-01-01", downtime=90, target=100, actual=80),
        _downtime_record(
            3, "2026-01-01", category="Tooling", downtime=30, target=None, actual=None
        ),
    ]
    result = dashboard_service._period_aggregate(rows, period="2026-01", days=31)
    assert result["downtime_hours"] == 2
    assert result["breakdown_hours"] == 1.5
    assert result["target_nos"] == 100
    assert result["target_missing_count"] == 1
    assert result["actual_nos"] == 80
    assert result["fill_fraction"] == 0.8
    assert result["approx_availability_fraction"] == pytest.approx(1 - 2 / (31 * 24 * 27))


@pytest.mark.parametrize(
    ("duration", "expected_hours"),
    [
        (None, None),
        (0, 0),
        (30, 0.5),
    ],
)
def test_period_keeps_missing_zero_and_nonzero_downtime_distinct(
    duration: float | None,
    expected_hours: float | None,
) -> None:
    result = dashboard_service._period_aggregate(
        [_downtime_record(2, "2026-01-01", downtime=duration)],
        period="2026-01",
        days=31,
    )
    assert result["downtime_hours"] == expected_hours
    assert result["downtime_missing_count"] == (1 if duration is None else 0)
    if duration is None:
        assert result["approx_availability_fraction"] is None
    else:
        assert result["approx_availability_fraction"] == pytest.approx(
            1 - (duration / 60) / (31 * 24 * 27)
        )


def test_production_dashboard_date_and_stage_filters_and_source_reconciliation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _grid_source(
        "production-dashboard",
        "Production Dashboard",
        1905823832,
        {
            4: ["View range (days):", 1, "", "Latest date in log:", "2026-09-18"],
            7: ["Day#", "Date", "Output", "Target", "Downtime (hrs)", "Fill %"],
            37: [30, 46283, 80, 100, 1, 0.8],
        },
    )
    downtime_source = _grid_source("downtime-log", "Downtime Log", 1490231673, {})
    monkeypatch.setattr(
        dashboard_service,
        "_grid_source",
        lambda key, **_: source if key == "production-dashboard" else downtime_source,
    )
    monkeypatch.setattr(
        dashboard_service,
        "_downtime_records",
        lambda _: (
            [
                _downtime_record(2, "2026-09-18"),
                _downtime_record(3, "2026-09-18", stage="Turned Bar", machine="CNC 1"),
            ],
            {
                "mirror_formula_range_rows_excluded": 0,
                "nonempty_mirror_source_rows_excluded": 0,
                "invalid_dates": 0,
            },
        ),
    )
    result = dashboard_service.get_production_dashboard(stage="Clip")
    assert result["date_from"] == "2026-09-18"
    assert result["records"][0]["output_nos"] == 80
    assert result["records"][0]["downtime_hours"] == 1
    assert result["summary"]["source_record_count"] == 1
    assert result["reconciliation"] == {
        "source_daily_values_checked": 0,
        "mismatch_count": 0,
        "source_summary_values_checked": 0,
        "source_summary_mismatch_count": 0,
    }
    source["is_stale"] = True
    source["refresh_error"] = "Upstream timeout"
    stale_result = dashboard_service.get_production_dashboard(stage="Clip")
    assert stale_result["is_stale"] is True
    assert stale_result["refresh_error"] == "Upstream timeout"


def test_summary_reconciles_month_and_year_formulas_and_keeps_availability_approximate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monthly_approx = 1 - 1.5 / (31 * 24 * 27)
    yearly_approx = 1 - 1.5 / (365 * 24 * 27)
    source = _grid_source(
        "summary",
        "Summary",
        311599185,
        {
            5: [
                "Month",
                "Downtime Hours",
                "Breakdown Hours",
                "Target NOS",
                "Actual NOS",
                "Fill %",
                "Approx. Availability %",
            ],
            6: ["2026-01", 1.5, 1, 100, 80, 0.8, monthly_approx],
            7: ["2026-02", 0, 0, "", "", "", 1],
            34: [
                "Year",
                "Downtime Hours",
                "Breakdown Hours",
                "Target NOS",
                "Actual NOS",
                "Fill %",
                "Approx. Availability %",
            ],
            35: [2026, 1.5, 1, 100, 80, 0.8, yearly_approx],
        },
    )
    downtime = _grid_source(
        "downtime-log",
        "Downtime Log",
        1490231673,
        {
            2: [
                "2026-01-01",
                "ERC",
                "A",
                "MK5",
                "Clip",
                "Line 1",
                "Breakdown",
                "Breakdown",
                "Mechanical",
                60,
                1,
                100,
                80,
            ],
            3: [
                "2026-01-01",
                "ERC",
                "A",
                "MK5",
                "Clip",
                "Line 1",
                "Tooling",
                "Tooling",
                "",
                30,
                1,
                None,
                None,
            ],
            4: [
                "2026-02-03",
                "ERC",
                "A",
                "MK5",
                "Clip",
                "Line 1",
                "Tooling",
                "Tooling",
                "",
                None,
                1,
                None,
                None,
            ],
        },
    )
    downtime["headers"] = [
        "Row",
        "Date",
        "Line",
        "Shift",
        "Part",
        "Stage",
        "Machine",
        "Downtime Type (raw)",
        "Downtime Category",
        "Breakdown Type",
        "Downtime Mins",
        "Prod Loss NOS",
        "Prod Target NOS",
        "Total PROD NOS",
        "Rejection",
        "Description",
    ]
    monkeypatch.setattr(dashboard_service, "_grid_source", lambda *_args, **_kwargs: source)
    monkeypatch.setattr(dashboard_service, "_downtime_source", lambda **_: downtime)
    entries = _source_meta("Entries", 1019432778, "entries")
    entries["records"] = []
    monkeypatch.setattr(dashboard_service, "get_shift_entries_analytics", lambda **_: entries)

    result = dashboard_service.get_dashboard_summary(
        date_from="2026-01-01",
        date_to="2026-02-28",
    )
    assert result["months"][0]["fill_fraction"] == 0.8
    assert result["months"][0]["approx_availability_fraction"] == pytest.approx(monthly_approx)
    missing_month = result["months"][1]
    assert missing_month["period"] == "2026-02"
    assert missing_month["downtime_hours"] is None
    assert missing_month["downtime_missing_count"] == 1
    assert missing_month["approx_availability_fraction"] is None
    assert result["data_quality"]["formula_zero_missing_downtime_periods"] == ["2026-02"]
    assert result["reconciliation"]["monthly"]["mismatch_count"] == 1
    assert result["reconciliation"]["yearly"]["mismatch_count"] == 0
    assert result["data_quality"]["november_2024_source_records"] == 0
    assert result["missing_months"] == []


def test_capacity_dashboard_recomputes_harmonic_ct_and_bottleneck(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dashboard = _grid_source(
        "dashboard",
        "Dashboard",
        1047718776,
        {
            5: ["Work Center", "Machines", "Effective Rated CT (sec)", "Bottleneck?"],
            6: ["A", 2, 20 / 3, ""],
            7: ["B", 1, 10, "BOTTLENECK"],
            24: [
                "Work Center",
                "Avg Actual CT (sec)",
                "Total Output",
                "Total Rejects",
                "Avg Efficiency %",
            ],
            25: ["A", 100, 50, 5, 0.5],
            26: ["B", "", 0, 0, ""],
        },
    )
    monkeypatch.setattr(dashboard_service, "_grid_source", lambda *_args, **_kwargs: dashboard)
    machine_meta = _source_meta("Machine Master", 1022871279, "source")
    entries_meta = _source_meta("Entries", 1019432778, "entries")
    machine_data = {
        **machine_meta,
        "records": [
            {"work_center": "A", "machine": "A1", "rated_ct_sec": 10, "status": "Active"},
            {"work_center": "A", "machine": "A2", "rated_ct_sec": 20, "status": "Active"},
            {"work_center": "B", "machine": "B1", "rated_ct_sec": 10, "status": "Active"},
        ],
    }
    entry_data = {
        **entries_meta,
        "records": [
            {
                "work_center": "A",
                "actual_ct_sec": 100,
                "output_qty": 50,
                "total_rejects": 5,
                "efficiency_fraction": 0.5,
            }
        ],
    }
    monkeypatch.setattr(dashboard_service, "get_machine_master_analytics", lambda **_: machine_data)
    monkeypatch.setattr(dashboard_service, "get_shift_entries_analytics", lambda **_: entry_data)
    result = dashboard_service.get_capacity_dashboard()
    assert result["summary"]["registered_machines"] == 3
    assert result["summary"]["theoretical_bottleneck_ct_sec"] == 10
    assert result["summary"]["theoretical_output_pcs_per_hour"] == 360
    assert [row["work_center"] for row in result["records"] if row["is_bottleneck"]] == ["B"]
    assert result["reconciliation"]["mismatch_count"] == 0
    assert result["actual_performance_reconciliation"]["mismatch_count"] == 0


@pytest.fixture
def authorized_dashboard_client() -> Iterator[TestClient]:
    overrides = app.dependency_overrides.copy()
    app.dependency_overrides[check_line_tracker_access] = lambda: User(
        email="phase6_tester@patilgroup.com",
        employee_code="EMP-PHASE6",
        is_active=True,
    )
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)


def test_dashboard_routes_enforce_auth_validate_dates_and_surface_errors(
    authorized_dashboard_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(route_module, "get_production_dashboard", lambda **_: {"records": []})
    monkeypatch.setattr(route_module, "get_capacity_dashboard", lambda **_: {"records": []})

    def summary_stub(*, date_from: str = "", date_to: str = "", **_: Any) -> dict[str, Any]:
        if date_from and date_to and date_from > date_to:
            raise ValueError("date_from must be on or before date_to.")
        return {"months": []}

    monkeypatch.setattr(route_module, "get_dashboard_summary", summary_stub)
    assert (
        authorized_dashboard_client.get("/api/v1/line-tracker/dashboards/production").status_code
        == 200
    )
    assert (
        authorized_dashboard_client.get("/api/v1/line-tracker/dashboards/capacity").status_code
        == 200
    )
    assert (
        authorized_dashboard_client.get("/api/v1/line-tracker/dashboards/summary").status_code
        == 200
    )
    assert (
        authorized_dashboard_client.get(
            "/api/v1/line-tracker/dashboards/summary?date_from=2026-12-01&date_to=2026-01-01"
        ).status_code
        == 400
    )

    def fail_summary(**_: Any) -> dict[str, Any]:
        raise WorksheetReadError("Dashboard source failed")

    monkeypatch.setattr(route_module, "get_dashboard_summary", fail_summary)
    error = authorized_dashboard_client.get("/api/v1/line-tracker/dashboards/summary")
    assert error.status_code == 502
    assert error.json()["detail"] == "Dashboard source failed"

    previous = app.dependency_overrides.pop(check_line_tracker_access)
    try:
        with TestClient(app) as client:
            denied = client.get("/api/v1/line-tracker/dashboards/production")
    finally:
        app.dependency_overrides[check_line_tracker_access] = previous
    assert denied.status_code == 401
