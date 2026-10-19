from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.routes.line_tracker import check_line_tracker_access
from app.main import app
from app.services import line_tracker_service as service

HEADERS = [
    "Date",
    "Line",
    "Shift",
    "Stage",
    "Machine",
    "Downtime Category",
    "Downtime Type (raw)",
    "Downtime Mins",
]


def _mock_sheet_payload(rows: list[list[object]], formulas: list[list[object]] | None = None):
    return {
        "worksheet": "Downtime Log",
        "worksheet_id": 1490231673,
        "grid_row_count": 20000,
        "grid_column_count": 26,
        "response_range": "'Downtime Log'!A1:ZZ20000",
        "headers": HEADERS,
        "rows": rows,
        "formula_rows": formulas or [],
    }


@pytest.fixture
def client():
    app.dependency_overrides[check_line_tracker_access] = lambda: object()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def clear_downtime_cache():
    with service._DOWNTIME_LOG_LOCK:
        service._DOWNTIME_LOG_CACHE.clear()
    yield
    with service._DOWNTIME_LOG_LOCK:
        service._DOWNTIME_LOG_CACHE.clear()


def test_parse_preserves_source_columns_and_counts_only_dynamic_nonempty_rows():
    rows = [
        HEADERS,
        ["2026-09-01", "ERC", "A", "Press", "P-1", "Breakdown", "Electrical", 45],
        ["2026-09-01", "ERC", "A", "Press", "P-1", "Breakdown", "Electrical", 45],
        ["bad-date", "ERC", "A", "Press", "P-2", "Breakdown", "Mechanical", "N/A"],
        ["", "", "", "", "", "", "", ""],
    ]
    formulas = [row.copy() for row in rows]
    formulas[1][7] = "=45"

    parsed = service._parse_downtime_sheet_rows(HEADERS, rows, formulas)

    assert len(parsed["historical_downtime_records"]) == 3
    assert parsed["historical_downtime_records"][0]["downtime_minutes"] == 45
    assert parsed["historical_downtime_records"][0]["source_values"]["Downtime Mins"] == 45
    assert parsed["historical_downtime_records"][2]["date"] is None
    assert parsed["historical_downtime_records"][2]["downtime_minutes"] is None
    assert parsed["records_summary"]["blank_rows_skipped"] == 1
    assert parsed["records_summary"]["invalid_dates"] == 1
    assert parsed["records_summary"]["missing_durations"] == 0
    assert parsed["records_summary"]["invalid_durations"] == 1
    assert parsed["records_summary"]["formula_cells"] == 1
    assert parsed["records_summary"]["formula_rows"] == 1
    assert parsed["records_summary"]["exact_duplicate_rows_retained"] == 1


def test_duration_unit_is_read_from_header_and_unknown_unit_is_not_guessed():
    hour_headers = [*HEADERS[:-1], "Downtime Hours"]
    hourly = service._parse_downtime_sheet_rows(
        hour_headers,
        [hour_headers, ["2026-09-01", "ERC", "A", "Press", "P-1", "Breakdown", "Electrical", 1.5]],
    )
    assert hourly["historical_downtime_records"][0]["downtime_minutes"] == 90
    assert hourly["duration_unit"] == "hours"

    unknown_headers = [*HEADERS[:-1], "Duration"]
    unknown = service._parse_downtime_sheet_rows(
        unknown_headers,
        [
            unknown_headers,
            ["2026-09-01", "ERC", "A", "Press", "P-1", "Breakdown", "Electrical", 90],
        ],
    )
    assert unknown["historical_downtime_records"][0]["downtime_minutes"] is None
    assert unknown["duration_unit"] is None
    assert any(
        warning["code"] == "DURATION_UNIT_UNKNOWN" for warning in unknown["data_quality_warnings"]
    )


def test_empty_sheet_and_missing_headers_are_safe():
    parsed = service._parse_downtime_sheet_rows(HEADERS, [HEADERS])
    assert parsed["historical_downtime_records"] == []
    assert parsed["records_summary"]["historical_downtime_accepted"] == 0

    with pytest.raises(ValueError, match="header row"):
        service._parse_downtime_sheet_rows([], [])


def test_downtime_source_uses_exact_configured_spreadsheet_and_tab(monkeypatch):
    calls = []

    def fetch(spreadsheet_id, worksheet_name, include_formulas=False):
        calls.append((spreadsheet_id, worksheet_name, include_formulas))
        return _mock_sheet_payload(
            [HEADERS, ["2026-09-01", "ERC", "A", "Press", "P-1", "Breakdown", "Electrical", 45]]
        )

    monkeypatch.setattr(
        "app.services.google_sheets_service._fetch_sheet_values_with_metadata",
        fetch,
    )

    data = service.get_line_tracker_downtime_log_dataset(refresh=True)

    assert data["source_type"] == "google_sheets"
    assert data["worksheet"] == "Downtime Log"
    assert data["worksheet_id"] == 1490231673
    assert data["used_range"] == "A1:H2"
    assert data["records_summary"]["historical_downtime_accepted"] == 1
    assert calls == [("1axzlqa-0nga1nnLSOZ1HQpjFZzx1kUlQ-KrqJgblw-s", "Downtime Log", True)]
    service.get_line_tracker_downtime_log_dataset()
    assert len(calls) == 1
    service.get_line_tracker_downtime_log_dataset(refresh=True)
    assert len(calls) == 2


def test_analysis_aggregates_valid_durations_and_keeps_missing_values_distinct():
    source = {
        "source_type": "google_sheets",
        "source_notice": "Live sheet",
        "is_live_google_sheets": True,
        "last_modified": "2026-10-17T00:00:00+00:00",
        "historical_downtime_records": [
            {
                "row_number": 2,
                "date": "2026-09-01",
                "category": "Breakdown",
                "machine": "P-1",
                "stage": "Press",
                "shift": "A",
                "downtime_minutes": 60,
                "is_planned": False,
            },
            {
                "row_number": 3,
                "date": "2026-09-02",
                "category": "Breakdown",
                "machine": "P-1",
                "stage": "Press",
                "shift": "A",
                "downtime_minutes": None,
                "is_planned": False,
            },
        ],
        "records_summary": {"historical_downtime_accepted": 2, "mirrored_downtime_skipped": 0},
        "planned_classification_supported": False,
        "data_quality_warnings": [],
    }

    result = service.get_line_tracker_reliability_analysis(source_dataset=source)

    assert result["summary"]["total_records"] == 2
    assert result["summary"]["records_with_valid_duration"] == 1
    assert result["summary"]["records_without_valid_duration"] == 1
    assert result["summary"]["total_downtime_minutes"] == 60
    assert result["summary"]["breakdown_events_count"] == 2
    assert result["summary"]["breakdown_events_with_valid_duration"] == 1
    assert result["summary"]["overall_mttr_hours"] == 1.0
    assert result["category_pareto"][0]["event_count"] == 2
    assert result["category_pareto"][0]["average_duration_minutes"] == 60.0
    assert result["summary"]["planned_downtime_hours"] is None
    assert result["summary"]["coverage_dates"]["coverage_days"] == 1

    date_slice = service.get_line_tracker_reliability_analysis(
        date_from="2026-09-02", source_dataset=source
    )
    assert date_slice["summary"]["total_records"] == 1
    assert date_slice["summary"]["records_without_valid_duration"] == 1


def test_api_returns_google_source_metadata_and_sanitized_unavailable_error(client, monkeypatch):
    rows = [
        HEADERS,
        ["2026-09-01", "ERC", "A", "Press", "P-1", "Breakdown", "Electrical", 45],
    ]
    monkeypatch.setattr(
        "app.api.routes.line_tracker.get_line_tracker_downtime_log_dataset",
        lambda refresh=False: {
            **service._parse_downtime_sheet_rows(HEADERS, rows),
            "source_type": "google_sheets",
            "source_notice": "Live sheet",
            "is_live_google_sheets": True,
            "last_modified": "2026-10-17T00:00:00+00:00",
            "worksheet": "Downtime Log",
            "worksheet_id": 1490231673,
            "source_headers": HEADERS,
            "used_range": "A1:H2",
            "records_summary": {"historical_downtime_accepted": 1, "mirrored_downtime_skipped": 0},
        },
    )

    response = client.get("/api/v1/line-tracker/reliability/pareto?source=google_sheets")
    assert response.status_code == 200
    body = response.json()
    assert body["source_type"] == "google_sheets"
    assert body["worksheet"] == "Downtime Log"
    assert body["worksheet_id"] == 1490231673
    assert body["summary"]["total_records"] == 1

    monkeypatch.setattr(
        "app.api.routes.line_tracker.get_line_tracker_downtime_log_dataset",
        lambda refresh=False: (_ for _ in ()).throw(
            PermissionError("private internal failure details")
        ),
    )
    failed = client.get("/api/v1/line-tracker/reliability/records?source=google_sheets")
    assert failed.status_code == 503
    assert "private internal failure details" not in failed.text
