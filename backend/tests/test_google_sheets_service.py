from app.services.google_sheets_service import (
    build_google_sheet_status,
    normalize_google_sheet_rows,
)


def test_normalizes_google_sheet_rows_and_keeps_custom_columns():
    rows = [
        [
            "SL No",
            "Date",
            "Line",
            "Shift",
            "Part",
            "Stage",
            "Machine",
            "Downtime Type",
            "Downtime Mints",
            "Prod Loss NOS",
            "Custom Field",
        ],
        [
            "1",
            "2026-09-01",
            "Line 1",
            "A",
            "Wheel",
            "Machining",
            "M-01",
            "Tool change",
            "15",
            "12",
            "Alpha",
        ],
    ]

    normalized = normalize_google_sheet_rows(rows)

    assert len(normalized) == 1
    assert normalized[0]["slNo"] == 1
    assert normalized[0]["date"] == "2026-09-01"
    assert normalized[0]["line"] == "Line 1"
    assert normalized[0]["shift"] == "A"
    assert normalized[0]["part"] == "Wheel"
    assert normalized[0]["stage"] == "Machining"
    assert normalized[0]["machine"] == "M-01"
    assert normalized[0]["downtimeType"] == "Tool change"
    assert normalized[0]["downtimeMinutes"] == 15
    assert normalized[0]["productionLoss"] == 12
    assert normalized[0]["customField"] == "Alpha"


def test_status_reports_offline_when_google_credentials_are_missing():
    status = build_google_sheet_status(
        spreadsheet_id="example-sheet",
        worksheet_name="Sheet1",
        error_message="Google Sheets credentials were not configured.",
        record_count=0,
        last_successful_sync=None,
    )

    assert status["connectionStatus"] == "offline"
    assert status["worksheet"] == "Sheet1"
    assert status["error"] == "Google Sheets credentials were not configured."
    assert status["recordCount"] == 0
