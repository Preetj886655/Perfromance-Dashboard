"""Google Sheets integration for manufacturing data sources.

This service reads a configured Google Sheet from the server side and normalizes
rows into a shared manufacturing data contract. The dashboard can consume the
same record shape regardless of whether the source is Excel, CSV, or Google
Sheets, which avoids duplicating analytics logic.
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import UTC, datetime
from threading import Lock
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build

from app.core.config import settings

_SPREADSHEET_ID_ENV_VARS = (
    "GOOGLE_SHEETS_SPREADSHEET_ID",
    "GOOGLE_SHEETS_SPREADSHEET",
    "GOOGLE_SPREADSHEET_ID",
)

_GOOGLE_SHEETS_CACHE_TTL_SECONDS = max(30, int(os.getenv("GOOGLE_SHEETS_CACHE_TTL_SECONDS", "45")))

_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_LOCK = Lock()

_ALIAS_MAP = {
    "slno": "slNo",
    "serialno": "slNo",
    "date": "date",
    "line": "line",
    "shift": "shift",
    "part": "part",
    "stage": "stage",
    "machine": "machine",
    "machinename": "machine",
    "machineno": "machine",
    "downtimetype": "downtimeType",
    "downtimereason": "downtimeType",
    "downtimemints": "downtimeMinutes",
    "downtimeminutes": "downtimeMinutes",
    "downtime": "downtimeMinutes",
    "prodlossnos": "productionLoss",
    "productionloss": "productionLoss",
    "prodloss": "productionLoss",
    "rejection": "rejection",
    "rejectedqty": "rejection",
    "totalrejection": "rejection",
    "prodtargetnos": "productionTarget",
    "productiontargetnos": "productionTarget",
    "target": "productionTarget",
    "productiontarget": "productionTarget",
    "totalprodnos": "totalProduction",
    "totalsproduction": "totalProduction",
    "production": "totalProduction",
    "actualproductionqty": "totalProduction",
    "actualproduction": "totalProduction",
    "producedqty": "totalProduction",
    "goodqty": "goodQuantity",
    "goodquantity": "goodQuantity",
    "quality": "quality",
    "availability": "availability",
    "performance": "performance",
    "oee": "oee",
    "remarks": "description",
    "description": "description",
}

_REQUIRED_FIELDS = {"date", "line", "machine", "part"}


def _normalize_header(label: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "", (label or "").strip().lower())
    return cleaned or "column"


def _coerce_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if stripped == "":
            return None
        if stripped.lower() in {"null", "n/a", "na", "none"}:
            return None
        return stripped
    if isinstance(value, int | float) and not isinstance(value, bool):
        return value
    return value


def _coerce_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(",", "").replace("%", "")
        if cleaned == "":
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _coerce_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.date().isoformat()
    if isinstance(value, int | float) and not isinstance(value, bool):
        # Excel serial date: 1 = 1899-12-31 (with Excel leap year bug, 25569 = 1970-01-01)
        try:
            from datetime import timedelta
            excel_epoch = datetime(1899, 12, 30, tzinfo=UTC)
            dt = excel_epoch + timedelta(days=float(value))
            return dt.date().isoformat()
        except Exception:
            return None
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        # Fast path for already-normalized ISO date: YYYY-MM-DD
        if re.match(r"^\d{4}-\d{2}-\d{2}$", stripped):
            return stripped
        # Indian business format first: DD/MM/YYYY (e.g. 12/09/2026 is
        # 12 September, NOT 9 December). %d/%m/%Y must be tried before %m/%d/%Y.
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(stripped, fmt).date().isoformat()
            except ValueError:
                continue
        try:
            parsed = datetime.fromisoformat(stripped)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return parsed.date().isoformat()
        except ValueError:
            return stripped
    return None


def _coerce_int_or_float(value: Any) -> int | float | None:
    num = _coerce_number(value)
    if num is None:
        return None
    return int(num) if num.is_integer() else num


def _normalize_key(raw_key: str) -> str:
    canonical = _normalize_header(raw_key)
    return _ALIAS_MAP.get(canonical, canonical)


def _empty_row(row: list[Any]) -> bool:
    return not any((cell is not None and str(cell).strip() != "") for cell in row)


def _build_clean_record(row_values: list[Any], headers: list[str]) -> dict[str, Any]:
    record: dict[str, Any] = {}
    legacy: dict[str, Any] = {}
    field_orders: list[str] = []

    for index, header in enumerate(headers):
        key = (header or f"column_{index + 1}").strip()
        value = row_values[index] if index < len(row_values) else None
        cleaned_value = _coerce_value(value)
        normalized_key = _normalize_key(key)

        if normalized_key in {
            "slNo",
            "date",
            "line",
            "shift",
            "part",
            "stage",
            "machine",
            "downtimeType",
            "downtimeMinutes",
            "productionLoss",
            "productionTarget",
            "totalProduction",
            "rejection",
            "description",
            "quality",
            "availability",
            "performance",
            "oee",
            "goodQuantity",
        }:
            if normalized_key == "date":
                parsed = _coerce_date(cleaned_value)
                record[normalized_key] = parsed
            elif normalized_key in {
                "slNo",
                "downtimeMinutes",
                "productionLoss",
                "productionTarget",
                "totalProduction",
                "rejection",
                "goodQuantity",
            }:
                record[normalized_key] = _coerce_int_or_float(cleaned_value)
            elif normalized_key in {"quality", "availability", "performance", "oee"}:
                record[normalized_key] = _coerce_number(cleaned_value)
            else:
                record[normalized_key] = cleaned_value
            if normalized_key not in field_orders:
                field_orders.append(normalized_key)
        else:
            key_name = key if key else f"column_{index + 1}"
            custom_key = re.sub(r"[^0-9a-zA-Z]+", " ", key_name).strip()
            custom_key = re.sub(r"\s+", " ", custom_key)
            custom_key = (
                custom_key[0].lower() + custom_key[1:] if custom_key else f"column_{index + 1}"
            )
            legacy[custom_key.replace(" ", "")] = cleaned_value

    for key in field_orders:
        if key in record and record[key] is not None:
            legacy[key] = record[key]

    record.update(legacy)
    return record


def normalize_google_sheet_rows(rows: list[list[Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []

    header_row = [str(cell).strip() for cell in rows[0]]
    if not any(header_row):
        return []

    data_rows = rows[1:]
    normalized: list[dict[str, Any]] = []
    for row in data_rows:
        if not row or _empty_row(row):
            continue
        record = _build_clean_record(row, header_row)
        normalized.append(record)
    return normalized


def build_google_sheet_status(
    spreadsheet_id: str,
    worksheet_name: str,
    error_message: str | None = None,
    record_count: int = 0,
    last_successful_sync: str | None = None,
) -> dict[str, Any]:
    if error_message:
        return {
            "source": "google-sheets",
            "connectionStatus": "offline",
            "status": "offline",
            "spreadsheetId": spreadsheet_id,
            "worksheet": worksheet_name,
            "recordCount": record_count,
            "lastSuccessfulSync": last_successful_sync,
            "lastUpdated": last_successful_sync,
            "error": error_message,
            "data": [],
        }

    return {
        "source": "google-sheets",
        "connectionStatus": "connected",
        "status": "connected",
        "spreadsheetId": spreadsheet_id,
        "worksheet": worksheet_name,
        "recordCount": record_count,
        "lastSuccessfulSync": last_successful_sync,
        "lastUpdated": last_successful_sync,
        "error": None,
        "data": [],
    }


def _get_credentials_info() -> dict[str, Any] | None:
    """Resolve Google Sheets service-account credentials.

    Checks both OS environment variables and Pydantic settings (.env file).
    OS environment variables take precedence for runtime overrides.

    Priority order:
      1. GOOGLE_SERVICE_ACCOUNT_JSON env var / setting (inline JSON string or file path)
      2. GOOGLE_SERVICE_ACCOUNT_FILE env var / setting (file path)
      3. GOOGLE_SERVICE_ACCOUNT_CREDENTIALS env var / setting
      4. GOOGLE_SHEETS_CREDENTIALS_JSON env var / setting
      5. GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON env var / setting

    Returns parsed JSON dict or None if no credentials found.
    """
    # Check sources in priority order: OS env var first, then settings (.env)
    sources = [
        ("GOOGLE_SERVICE_ACCOUNT_JSON", settings.google_service_account_json),
        ("GOOGLE_SERVICE_ACCOUNT_FILE", settings.google_service_account_file),
        ("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS", settings.google_service_account_credentials),
        ("GOOGLE_SHEETS_CREDENTIALS_JSON", settings.google_sheets_credentials_json),
        ("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON", settings.google_sheets_service_account_json),
    ]

    raw = ""
    for env_var, settings_val in sources:
        # Check OS environment first (allows runtime override)
        env_val = (os.getenv(env_var) or "").strip()
        if env_val:
            raw = env_val
            break
        # Fall back to settings (.env file)
        if settings_val and settings_val.strip():
            raw = settings_val.strip()
            break

    if not raw:
        return None

    # 1. Resolve as existing file path
    if os.path.exists(raw):
        try:
            with open(raw, encoding="utf-8") as handle:
                return json.load(handle)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Google service account JSON file is invalid: {exc}") from exc

    # 2. Resolve as inline JSON string
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass

    # 3. Resolve as Base64-encoded JSON string (useful for multi-line env var in Render)
    try:
        import base64

        decoded = base64.b64decode(raw.strip()).decode("utf-8")
        parsed = json.loads(decoded)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    return None


_WORKSHEET_NAME_ENV_VARS = (
    "GOOGLE_SHEETS_WORKSHEET_NAME",
    "GOOGLE_SHEETS_WORKSHEET",
    "GOOGLE_SHEETS_DEFAULT_WORKSHEET",
)


def _get_default_spreadsheet_id() -> str:
    for env_var in _SPREADSHEET_ID_ENV_VARS:
        value = (os.getenv(env_var) or "").strip()
        if value:
            return value
    return settings.google_sheets_spreadsheet_id.strip()


def _get_default_worksheet() -> str:
    """Resolve the default worksheet name from env vars or settings.

    Priority:
      1. GOOGLE_SHEETS_WORKSHEET_NAME env var
      2. settings.google_sheets_worksheet_name
      3. GOOGLE_SHEETS_DEFAULT_WORKSHEET / settings.google_sheets_default_worksheet
      4. \"Sheet1\" (Google Sheets default)
    """
    for env_var in _WORKSHEET_NAME_ENV_VARS:
        value = (os.getenv(env_var) or "").strip()
        if value:
            return value
    if settings.google_sheets_worksheet_name:
        return settings.google_sheets_worksheet_name.strip()
    if settings.google_sheets_default_worksheet:
        return settings.google_sheets_default_worksheet.strip()
    return "Sheet1"


def _resolve_worksheet_title(spreadsheet: dict[str, Any], requested_name: str | None) -> str:
    if requested_name:
        return requested_name
    sheet_list = spreadsheet.get("sheets") or []
    for sheet in sheet_list:
        props = sheet.get("properties") or {}
        sheet_id = props.get("sheetId")
        if sheet_id == 0:
            return props.get("title") or "Sheet1"
    if sheet_list:
        props = sheet_list[0].get("properties") or {}
        return props.get("title") or "Sheet1"
    return "Sheet1"


def _fetch_sheet_values(
    spreadsheet_id: str, worksheet_name: str | None = None
) -> tuple[str, list[list[Any]], list[str]]:
    service_account_info = _get_credentials_info()
    if not service_account_info:
        raise RuntimeError("Google Sheets credentials were not configured.")

    credentials = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    service = build("sheets", "v4", credentials=credentials, cache_discovery=False)

    spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    resolved_worksheet_name = _resolve_worksheet_title(spreadsheet, worksheet_name)
    worksheet_range = f"{resolved_worksheet_name}!A:ZZ"
    response = (
        service.spreadsheets()
        .values()
        .get(
            spreadsheetId=spreadsheet_id,
            range=worksheet_range,
            majorDimension="ROWS",
            valueRenderOption="UNFORMATTED_VALUE",
            dateTimeRenderOption="FORMATTED_STRING",
        )
        .execute()
    )
    rows = response.get("values", [])
    headers = rows[0] if rows else []
    return resolved_worksheet_name, rows, [str(header).strip() for header in headers]


def get_google_sheet_status(
    spreadsheet_id: str | None = None, worksheet_name: str | None = None
) -> dict[str, Any]:
    resolved_id = (spreadsheet_id or _get_default_spreadsheet_id()).strip()
    resolved_worksheet = worksheet_name or _get_default_worksheet()

    if not resolved_id:
        return build_google_sheet_status(
            spreadsheet_id="",
            worksheet_name=resolved_worksheet or "Sheet1",
            error_message="Google Sheets spreadsheet ID is not configured.",
            record_count=0,
            last_successful_sync=None,
        )

    try:
        worksheet, rows, _ = _fetch_sheet_values(resolved_id, resolved_worksheet)
        record_count = len(normalize_google_sheet_rows(rows))
        last_successful_sync = datetime.now(UTC).isoformat()
        return build_google_sheet_status(
            spreadsheet_id=resolved_id,
            worksheet_name=worksheet,
            error_message=None,
            record_count=record_count,
            last_successful_sync=last_successful_sync,
        )
    except Exception as exc:  # pragma: no cover - network bound condition
        return build_google_sheet_status(
            spreadsheet_id=resolved_id,
            worksheet_name=resolved_worksheet or "Sheet1",
            error_message=str(exc),
            record_count=0,
            last_successful_sync=None,
        )


def _dataset_date_bounds(records: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    """Return (minDate, maxDate) ISO dates across all normalized records.

    Dates are already normalized to ISO yyyy-mm-dd by ``_coerce_date``; invalid
    values are skipped so they never distort the bounds.
    """
    valid = sorted(
        record["date"]
        for record in records
        if isinstance(record.get("date"), str) and re.match(r"^\d{4}-\d{2}-\d{2}$", record["date"])
    )
    if not valid:
        return None, None
    return valid[0], valid[-1]


def fetch_google_sheet_dataset(
    spreadsheet_id: str | None = None,
    worksheet_name: str | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    """Fetch the live Google Sheet dataset.

    ``refresh=True`` bypasses the in-memory TTL cache and performs a fresh
    Google Sheets API fetch so newly appended rows are returned immediately.
    """
    resolved_id = (spreadsheet_id or _get_default_spreadsheet_id()).strip()
    resolved_worksheet = worksheet_name or _get_default_worksheet()

    cache_key = f"{resolved_id}:{resolved_worksheet}"
    now = time.monotonic()

    if not refresh:
        with _CACHE_LOCK:
            cached = _CACHE.get(cache_key)
            if cached and (now - cached["fetched_at"]) < _GOOGLE_SHEETS_CACHE_TTL_SECONDS:
                payload = cached["payload"]
                # Annotate a copy so the cached payload itself stays cacheHit-free.
                annotated = dict(payload)
                annotated["cacheHit"] = True
                return annotated

    if not resolved_id:
        payload = {
            "source": "google-sheets",
            "spreadsheetId": "",
            "worksheet": resolved_worksheet,
            "recordCount": 0,
            "minDate": None,
            "maxDate": None,
            "cacheHit": False,
            "lastUpdated": None,
            "columnMismatches": [],
            "error": "Google Sheets spreadsheet ID is not configured.",
            "status": "offline",
            "connectionStatus": "offline",
            "data": [],
        }
        with _CACHE_LOCK:
            _CACHE[cache_key] = {"fetched_at": now, "payload": payload}
        return payload

    try:
        worksheet, rows, headers = _fetch_sheet_values(resolved_id, resolved_worksheet)
        normalized = normalize_google_sheet_rows(rows)
        min_date, max_date = _dataset_date_bounds(normalized)
        mismatches = []
        if headers:
            for required in sorted(_REQUIRED_FIELDS):
                if not any(
                    _normalize_header(header) in {required, *_ALIAS_MAP.get(required, [required])}
                    for header in headers
                ):
                    mismatches.append(f"Missing expected column: {required}")

        payload = {
            "source": "google-sheets",
            "spreadsheetId": resolved_id,
            "worksheet": worksheet,
            "recordCount": len(normalized),
            "minDate": min_date,
            "maxDate": max_date,
            "cacheHit": False,
            "lastUpdated": datetime.now(UTC).isoformat(),
            "columnMismatches": mismatches,
            "error": None,
            "status": "connected",
            "connectionStatus": "connected",
            "data": normalized,
        }
        with _CACHE_LOCK:
            _CACHE[cache_key] = {"fetched_at": now, "payload": payload}
        return payload
    except Exception as exc:
        stale = None
        if not refresh:
            with _CACHE_LOCK:
                stale = _CACHE.get(cache_key)

        payload = {
            "source": "google-sheets",
            "spreadsheetId": resolved_id,
            "worksheet": resolved_worksheet,
            "recordCount": (stale["payload"].get("recordCount", 0) if stale else 0),
            "minDate": (stale["payload"].get("minDate") if stale else None),
            "maxDate": (stale["payload"].get("maxDate") if stale else None),
            "cacheHit": False,
            "lastUpdated": (stale["payload"].get("lastUpdated") if stale else None),
            "columnMismatches": [],
            "error": str(exc),
            "status": "offline",
            "connectionStatus": "offline",
            "data": (stale["payload"].get("data", []) if stale else []),
        }
        with _CACHE_LOCK:
            _CACHE[cache_key] = {"fetched_at": now, "payload": payload}
        return payload
