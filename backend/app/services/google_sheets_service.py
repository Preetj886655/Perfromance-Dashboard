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
from datetime import datetime, timezone
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
    "target": "productionTarget",
    "productiontarget": "productionTarget",
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
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    return value


def _coerce_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
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
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.date().isoformat()
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(stripped, fmt).date().isoformat()
            except ValueError:
                continue
        try:
            parsed = datetime.fromisoformat(stripped)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.date().isoformat()
        except ValueError:
            return stripped
    return None


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

        if normalized_key in {"slNo", "date", "line", "shift", "part", "stage", "machine", "downtimeType", "downtimeMinutes", "productionLoss", "productionTarget", "totalProduction", "rejection", "description", "quality", "availability", "performance", "oee", "goodQuantity"}:
            if normalized_key == "date":
                parsed = _coerce_date(cleaned_value)
                record[normalized_key] = parsed
            elif normalized_key in {"downtimeMinutes", "productionLoss", "productionTarget", "totalProduction", "rejection", "goodQuantity", "quality", "availability", "performance", "oee"}:
                record[normalized_key] = _coerce_number(cleaned_value)
            else:
                record[normalized_key] = cleaned_value
            if normalized_key not in field_orders:
                field_orders.append(normalized_key)
        else:
            key_name = key if key else f"column_{index + 1}"
            custom_key = re.sub(r"[^0-9a-zA-Z]+", " ", key_name).strip()
            custom_key = re.sub(r"\s+", " ", custom_key)
            custom_key = custom_key[0].lower() + custom_key[1:] if custom_key else f"column_{index + 1}"
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
    raw = (
        os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
        or os.getenv("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS")
        or os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON")
        or os.getenv("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON")
        or ""
    ).strip()

    if not raw:
        return None

    if os.path.exists(raw):
        try:
            with open(raw, "r", encoding="utf-8") as handle:
                return json.load(handle)
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive guard
            raise ValueError(f"Google service account JSON is invalid: {exc}") from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _get_default_spreadsheet_id() -> str:
    for env_var in _SPREADSHEET_ID_ENV_VARS:
        value = (os.getenv(env_var) or "").strip()
        if value:
            return value
    return settings.google_sheets_spreadsheet_id.strip()


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


def _fetch_sheet_values(spreadsheet_id: str, worksheet_name: str | None = None) -> tuple[str, list[list[Any]], list[str]]:
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
    response = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=worksheet_range,
        majorDimension="ROWS",
    ).execute()
    rows = response.get("values", [])
    headers = rows[0] if rows else []
    return resolved_worksheet_name, rows, [str(header).strip() for header in headers]


def get_google_sheet_status(spreadsheet_id: str | None = None, worksheet_name: str | None = None) -> dict[str, Any]:
    resolved_id = (spreadsheet_id or _get_default_spreadsheet_id()).strip()
    resolved_worksheet = worksheet_name or settings.google_sheets_default_worksheet.strip()

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
        last_successful_sync = datetime.now(timezone.utc).isoformat()
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


def fetch_google_sheet_dataset(
    spreadsheet_id: str | None = None,
    worksheet_name: str | None = None,
) -> dict[str, Any]:
    resolved_id = (spreadsheet_id or _get_default_spreadsheet_id()).strip()
    resolved_worksheet = worksheet_name or settings.google_sheets_default_worksheet.strip() or "Sheet1"

    cache_key = f"{resolved_id}:{resolved_worksheet}"
    now = time.monotonic()

    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
        if cached and (now - cached["fetched_at"]) < _GOOGLE_SHEETS_CACHE_TTL_SECONDS:
            return cached["payload"]

    if not resolved_id:
        payload = {
            "source": "google-sheets",
            "spreadsheetId": "",
            "worksheet": resolved_worksheet,
            "recordCount": 0,
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
        mismatches = []
        if headers:
            for required in sorted(_REQUIRED_FIELDS):
                if not any(_normalize_header(header) in {required, *_ALIAS_MAP.get(required, [required])} for header in headers):
                    mismatches.append(f"Missing expected column: {required}")

        payload = {
            "source": "google-sheets",
            "spreadsheetId": resolved_id,
            "worksheet": worksheet,
            "recordCount": len(normalized),
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
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
        with _CACHE_LOCK:
            stale = _CACHE.get(cache_key)

        payload = {
            "source": "google-sheets",
            "spreadsheetId": resolved_id,
            "worksheet": resolved_worksheet,
            "recordCount": (stale["payload"].get("recordCount", 0) if stale else 0),
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
