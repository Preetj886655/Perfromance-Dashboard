from app.services import google_sheets_service as svc
from app.services.google_sheets_service import (
    build_google_sheet_status,
    fetch_google_sheet_dataset,
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


# ============================================================
# Live dataset fetch: cache bypass + date diagnostics
# (Google Sheets API is mocked — the real sheet is never touched.)
# ============================================================

_SHEET_HEADERS = [
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
    "Prod Target NOS",
    "Total PROD NOS",
    "Rejection",
]


def _patch_fetch(monkeypatch, dates: list[str]) -> list[int]:
    """Patch the raw Google API fetch; returns a call-count list."""

    def fake_fetch(spreadsheet_id: str, worksheet_name: str | None = None):
        calls.append(1)
        return _sheet_payload(dates)

    calls: list[int] = []
    monkeypatch.setattr(svc, "_fetch_sheet_values", fake_fetch)
    return calls


def _sheet_payload(dates: list[str]) -> tuple[str, list[list[object]], list[str]]:
    return "Sheet1", _sheet_rows(dates), [str(h) for h in _SHEET_HEADERS]


def _sheet_payload_rows(rows: list[list[object]]) -> tuple[str, list[list[object]], list[str]]:
    return "Sheet1", rows, [str(h) for h in _SHEET_HEADERS]


def _record_row(i: int, date: str) -> list[object]:
    return [
        str(i + 1), date, "ERC", "A", "MK3", "Cut Bar", "Bar corpper 1",
        "B/D Mech", "10", "5", "100", "90", "1",
    ]


def _sheet_rows(dates: list[str]) -> list[list[object]]:
    return [_SHEET_HEADERS, *(_record_row(i, d) for i, d in enumerate(dates))]


def _clear_cache():
    with svc._CACHE_LOCK:
        svc._CACHE.clear()


def _fetch(key: str, refresh: bool = False):
    return fetch_google_sheet_dataset(spreadsheet_id=key, worksheet_name="Sheet1", refresh=refresh)


def test_dataset_reports_min_and_max_date(monkeypatch):
    _clear_cache()
    _patch_fetch(monkeypatch, ["2026-08-31", "2026-09-01", "2026-09-03"])
    payload = fetch_google_sheet_dataset(spreadsheet_id="sheet-x", worksheet_name="Sheet1")
    assert payload["connectionStatus"] == "connected"
    assert payload["recordCount"] == 3
    assert payload["minDate"] == "2026-08-31"
    assert payload["maxDate"] == "2026-09-03"


def test_indian_style_date_parsing(monkeypatch):
    """DD/MM/YYYY must parse as day/month/year — 12/09/2026 → 2026-09-12."""
    rows = [
        _SHEET_HEADERS,
        ["1", "12/09/2026", "ERC", "A", "MK3", "Cut Bar", "M1", "B/D", "10", "5", "100", "90", "1"],
        ["2", "03-09-2026", "ERC", "A", "MK3", "Cut Bar", "M1", "B/D", "10", "5", "100", "90", "1"],
        ["3", "31/08/2024", "ERC", "A", "MK3", "Cut Bar", "M1", "B/D", "10", "5", "100", "90", "1"],
    ]
    normalized = normalize_google_sheet_rows(rows)
    assert normalized[0]["date"] == "2026-09-12"
    assert normalized[1]["date"] == "2026-09-03"
    assert normalized[2]["date"] == "2024-08-31"


def test_stage_column_is_preserved_for_frontend_filter(monkeypatch):
    """The Stage column must survive normalization end-to-end."""
    _clear_cache()
    _patch_fetch(monkeypatch, ["2026-09-03"])
    payload = fetch_google_sheet_dataset(spreadsheet_id="sheet-stage", worksheet_name="Sheet1")
    assert payload["data"][0]["stage"] == "Cut Bar"


def test_max_date_follows_appended_rows(monkeypatch):
    """Sheet grows 03-09 → 12-09 → 13-09: maxDate must follow each time."""
    _clear_cache()
    _patch_fetch(monkeypatch, ["2026-09-01", "2026-09-03"])

    first = _fetch("sheet-grow", refresh=True)
    assert first["recordCount"] == 2
    assert first["maxDate"] == "2026-09-03"

    # Simulate the sheet being extended through 2026-09-12.
    dates_12 = ["2026-09-01", "2026-09-03", "2026-09-12"]
    monkeypatch.setattr(svc, "_fetch_sheet_values", lambda sid, ws=None: _sheet_payload(dates_12))
    second = _fetch("sheet-grow", refresh=True)
    assert second["recordCount"] == 3
    assert second["maxDate"] == "2026-09-12"

    # Simulate 2026-09-13.
    dates_13 = ["2026-09-01", "2026-09-03", "2026-09-12", "2026-09-13"]
    monkeypatch.setattr(svc, "_fetch_sheet_values", lambda sid, ws=None: _sheet_payload(dates_13))
    third = _fetch("sheet-grow", refresh=True)
    assert third["recordCount"] == 4
    assert third["maxDate"] == "2026-09-13"


def test_record_count_is_dynamic_not_capped(monkeypatch):
    """Row count must reflect the sheet — no hard-coded 14,004-style cap."""
    _clear_cache()
    many_dates = [f"2026-09-{(i % 12) + 1:02d}" for i in range(14100)]
    monkeypatch.setattr(svc, "_fetch_sheet_values", lambda sid, ws=None: _sheet_payload(many_dates))
    payload = _fetch("sheet-cap")
    assert payload["recordCount"] == 14100


def test_refresh_true_bypasses_cache(monkeypatch):
    _clear_cache()
    calls = _patch_fetch(monkeypatch, ["2026-09-03"])

    first = _fetch("sheet-cache")
    assert len(calls) == 1
    assert first["cacheHit"] is False

    # Within the TTL a normal call is served from cache…
    cached = _fetch("sheet-cache")
    assert len(calls) == 1
    assert cached["cacheHit"] is True

    # …but refresh=True must bypass it and hit the API again.
    refreshed = _fetch("sheet-cache", refresh=True)
    assert len(calls) == 2
    assert refreshed["cacheHit"] is False


def test_refresh_true_picks_up_rows_added_inside_ttl(monkeypatch):
    """New rows appended moments ago must appear with refresh=True even though
    the 45s TTL cache has not expired."""
    _clear_cache()
    calls = _patch_fetch(monkeypatch, ["2026-09-03"])
    stale = _fetch("sheet-ttl")
    assert stale["maxDate"] == "2026-09-03"
    assert len(calls) == 1

    grown = ["2026-09-03", "2026-09-12"]
    monkeypatch.setattr(svc, "_fetch_sheet_values", lambda sid, ws=None: _sheet_payload(grown))
    fresh = _fetch("sheet-ttl", refresh=True)
    assert fresh["recordCount"] == 2
    assert fresh["maxDate"] == "2026-09-12"
    assert fresh["cacheHit"] is False
    # The forced refresh replaced the cached payload, so subsequent normal
    # calls within the TTL now serve the fresh data.
    still_cached = _fetch("sheet-ttl")
    assert still_cached["maxDate"] == "2026-09-12"
    assert still_cached["cacheHit"] is True


def test_max_date_ignores_invalid_dates(monkeypatch):
    rows = [
        _SHEET_HEADERS,
        _record_row(0, "2026-09-03"),
        _record_row(1, "not-a-date"),
        _record_row(2, ""),
    ]
    _clear_cache()
    monkeypatch.setattr(svc, "_fetch_sheet_values", lambda sid, ws=None: _sheet_payload_rows(rows))
    payload = _fetch("sheet-invalid")
    assert payload["minDate"] == "2026-09-03"
    assert payload["maxDate"] == "2026-09-03"


def test_coerce_date_formats():
    """Verify DD-MM-YYYY, DD/MM/YYYY, ISO, and other Indian manufacturing date formats."""
    assert svc._coerce_date("22-09-2026") == "2026-09-22"
    assert svc._coerce_date("23-09-2026") == "2026-09-23"
    assert svc._coerce_date("03-09-2026") == "2026-09-03"
    assert svc._coerce_date("31-08-2024") == "2024-08-31"
    assert svc._coerce_date("22/09/2026") == "2026-09-22"
    assert svc._coerce_date("2026-09-22") == "2026-09-22"
    assert svc._coerce_date("") is None
    assert svc._coerce_date(None) is None


def test_dynamic_latest_date_advancement_to_22nd_and_23rd(monkeypatch):
    """Verify maxDate advances dynamically when records for 22-09-2026 and 23-09-2026 arrive."""
    _clear_cache()
    # Step 1: Baseline ending at 03-09-2026
    payload1 = _sheet_payload(["2024-08-31", "2026-09-03"])
    monkeypatch.setattr(svc, "_fetch_sheet_values", lambda sid, ws=None: payload1)
    p1 = _fetch("sheet-dyn", refresh=True)
    assert p1["minDate"] == "2024-08-31"
    assert p1["maxDate"] == "2026-09-03"

    # Step 2: New records added with 22-09-2026
    payload2 = _sheet_payload(["2024-08-31", "2026-09-03", "2026-09-22"])
    monkeypatch.setattr(svc, "_fetch_sheet_values", lambda sid, ws=None: payload2)
    p2 = _fetch("sheet-dyn", refresh=True)
    assert p2["minDate"] == "2024-08-31"
    assert p2["maxDate"] == "2026-09-22"
    assert p2["recordCount"] == 3

    # Step 3: Later records added with 23-09-2026
    payload3 = _sheet_payload(["2024-08-31", "2026-09-03", "2026-09-22", "2026-09-23"])
    monkeypatch.setattr(svc, "_fetch_sheet_values", lambda sid, ws=None: payload3)
    p3 = _fetch("sheet-dyn", refresh=True)
    assert p3["minDate"] == "2024-08-31"
    assert p3["maxDate"] == "2026-09-23"
    assert p3["recordCount"] == 4

