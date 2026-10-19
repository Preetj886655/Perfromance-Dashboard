"""Tests for the read-only ERC Mk-V worksheet catalog and data API."""

from __future__ import annotations

from collections.abc import Iterator
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.api.routes import line_tracker as line_tracker_routes
from app.api.routes.line_tracker import check_line_tracker_access
from app.main import app
from app.models.user import User
from app.services import line_tracker_worksheet_service as worksheet_service


@pytest.fixture(autouse=True)
def clear_worksheet_cache() -> Iterator[None]:
    worksheet_service.clear_line_tracker_worksheet_cache()
    yield
    worksheet_service.clear_line_tracker_worksheet_cache()


@pytest.fixture
def authenticated_client() -> Iterator[TestClient]:
    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[check_line_tracker_access] = lambda: User(
        email="worksheet_tester@patilgroup.com",
        employee_code="EMP-MkV",
        is_active=True,
    )
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


@pytest.fixture
def worksheet_rows() -> list[list[object]]:
    return [
        ["Order", "Order", "Customer", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "", ""],
        ["PO-001", "PO-001", "Alpha", 1, 2, 3, 4, 5, 6, 7, 8, "extra"],
        ["PO-002", "PO-002", "Beta", 2, 3, 4, 5, 6, 7, 8, 9, "extra"],
    ]


def test_catalog_reports_allowlisted_live_availability_and_caches_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    metadata_reader = Mock(
        return_value=[
            {
                "worksheet": "Production Order",
                "worksheet_id": 123,
                "grid_row_count": 20,
                "grid_column_count": 11,
            }
        ]
    )
    monkeypatch.setattr(worksheet_service, "_spreadsheet_id", lambda: "test-spreadsheet")
    monkeypatch.setattr(
        worksheet_service, "fetch_google_sheet_worksheet_metadata", metadata_reader
    )

    catalog = worksheet_service.get_line_tracker_worksheet_catalog()
    cached_catalog = worksheet_service.get_line_tracker_worksheet_catalog()
    refreshed_catalog = worksheet_service.get_line_tracker_worksheet_catalog(refresh=True)

    assert len(catalog["worksheets"]) == 17
    assert catalog["worksheets"][0] == {
        "key": "production-order",
        "name": "Production Order",
        "group": "Production",
        "layout": "table",
        "header_row": 1,
        "status": "available",
        "worksheet_id": 123,
        "grid_row_count": 20,
        "grid_column_count": 11,
    }
    assert catalog["worksheets"][1]["status"] == "missing"
    assert catalog["worksheets"][11]["layout"] == "grid"
    assert catalog["worksheets"][12]["layout"] == "grid"
    assert catalog["worksheets"][13]["layout"] == "grid"
    assert catalog["worksheets"][15]["layout"] == "grid"
    assert catalog["cache_hit"] is False
    assert cached_catalog["cache_hit"] is True
    assert refreshed_catalog["cache_hit"] is False
    assert metadata_reader.call_count == 2
    metadata_reader.assert_called_with("test-spreadsheet")


def test_data_search_pagination_and_duplicate_headers(
    monkeypatch: pytest.MonkeyPatch,
    worksheet_rows: list[list[object]],
) -> None:
    values_reader = Mock(
        return_value={
            "worksheet": "Production Order",
            "worksheet_id": 123,
            "rows": worksheet_rows,
            "grid_row_count": 3,
            "grid_column_count": 11,
        }
    )
    monkeypatch.setattr(worksheet_service, "_spreadsheet_id", lambda: "test-spreadsheet")
    monkeypatch.setattr(
        worksheet_service, "_fetch_sheet_values_with_metadata", values_reader
    )

    page = worksheet_service.get_line_tracker_worksheet_data(
        "production-order", page=1, page_size=1, search="beta"
    )

    assert page["record_count"] == 2
    assert page["filtered_record_count"] == 1
    assert page["page_count"] == 1
    assert len(page["headers"]) == 12
    assert page["headers"][-1] == "Column L"
    assert page["records"] == [
        {"row_number": 3, "values": worksheet_rows[2]}
    ]
    assert any("Duplicate source headers" in warning for warning in page["validation_warnings"])
    assert any("source headers are blank" in warning for warning in page["validation_warnings"])
    cached_page = worksheet_service.get_line_tracker_worksheet_data(
        "production-order", page=1, page_size=1, search="beta"
    )
    assert cached_page["cache_hit"] is True
    values_reader.assert_called_once()


def test_grid_layout_preserves_cell_coordinates_and_omits_blank_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(worksheet_service, "_spreadsheet_id", lambda: "test-spreadsheet")
    monkeypatch.setattr(
        worksheet_service,
        "_fetch_sheet_values_with_metadata",
        lambda *_: {
            "worksheet": "Manpower Summary",
            "worksheet_id": 321,
            "rows": [["", ""], ["Work Center", "Headcount"], ["Assembly", 12], []],
            "grid_row_count": 4,
            "grid_column_count": 2,
        },
    )

    data = worksheet_service.get_line_tracker_worksheet_data("manpower-summary")

    assert data["headers"] == ["Row", "A", "B"]
    assert data["records"] == [
        {"row_number": 2, "values": [2, "Work Center", "Headcount"]},
        {"row_number": 3, "values": [3, "Assembly", 12]},
    ]
    assert data["record_count"] == 2


def test_refresh_failure_uses_last_good_data_and_marks_it_stale(
    monkeypatch: pytest.MonkeyPatch,
    worksheet_rows: list[list[object]],
) -> None:
    values_reader = Mock(
        return_value={
            "worksheet": "Production Order",
            "worksheet_id": 123,
            "rows": worksheet_rows,
            "grid_row_count": 3,
            "grid_column_count": 11,
        }
    )
    monkeypatch.setattr(worksheet_service, "_spreadsheet_id", lambda: "test-spreadsheet")
    monkeypatch.setattr(
        worksheet_service, "_fetch_sheet_values_with_metadata", values_reader
    )
    initial = worksheet_service.get_line_tracker_worksheet_data("production-order")
    values_reader.side_effect = RuntimeError("Google API unavailable")

    stale = worksheet_service.get_line_tracker_worksheet_data(
        "production-order", refresh=True
    )

    assert initial["is_stale"] is False
    assert stale["is_stale"] is True
    assert stale["records"] == initial["records"]
    assert "RuntimeError" in stale["refresh_error"]
    assert values_reader.call_count == 2


def test_worksheet_endpoints_keep_auth_and_return_paginated_rows(
    authenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        worksheet_service,
        "get_line_tracker_worksheet_catalog",
        lambda **_: {"worksheets": [], "source": "google-sheets"},
    )
    monkeypatch.setattr(
        worksheet_service,
        "get_line_tracker_worksheet_data",
        lambda key, **kwargs: {
            "worksheet": {"key": key},
            "page": kwargs["page"],
            "page_size": kwargs["page_size"],
            "records": [],
        },
    )

    catalog_response = authenticated_client.get("/api/v1/line-tracker/worksheets")
    data_response = authenticated_client.get(
        "/api/v1/line-tracker/worksheets/production-order?page=2&page_size=10&search=alpha"
    )

    assert catalog_response.status_code == 200
    assert data_response.status_code == 200
    assert data_response.json()["page"] == 2
    assert data_response.json()["page_size"] == 10


def test_worksheet_endpoints_return_explicit_not_found_and_upstream_errors(
    authenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def read_failure(worksheet_key: str, **_kwargs: object) -> None:
        if worksheet_key == "not-allowlisted":
            raise worksheet_service.WorksheetNotFoundError("Unknown worksheet.")
        raise worksheet_service.WorksheetReadError("Google Sheets unavailable.")

    monkeypatch.setattr(
        line_tracker_routes,
        "get_line_tracker_worksheet_data",
        read_failure,
    )

    missing = authenticated_client.get(
        "/api/v1/line-tracker/worksheets/not-allowlisted"
    )
    upstream_error = authenticated_client.get(
        "/api/v1/line-tracker/worksheets/production-order"
    )

    assert missing.status_code == 404
    assert upstream_error.status_code == 502
    assert upstream_error.json()["detail"] == "Google Sheets unavailable."


def test_worksheet_catalog_rejects_unauthenticated_requests() -> None:
    with TestClient(app) as unauthenticated_client:
        response = unauthenticated_client.get("/api/v1/line-tracker/worksheets")

    assert response.status_code == 401
