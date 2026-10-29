"""Maintenance / Breakdown Google Sheets integration.

Provides normalized maintenance analytics data from the Medchal Breakdown Report
Google Spreadsheet (or fallback reference during offline testing).
"""

from __future__ import annotations

import os
import re
import time
from datetime import UTC, datetime
from threading import Lock
from typing import Any

from app.core.config import settings
from app.services.google_sheets_service import (
    _coerce_date,
    _coerce_number,
    _coerce_value,
    _fetch_sheet_values,
    _get_credentials_info,
)

_MAINTENANCE_ALIAS_MAP: dict[str, str] = {
    # Plant
    "plantcode": "plantCode",
    "plant": "plantCode",
    # Machine
    "machine": "machine",
    "machinename": "machine",
    "mcname": "machine",
    # Machine Owner
    "machineowner": "machineOwner",
    "owner": "machineOwner",
    # Date
    "date": "date",
    # Shift
    "shift": "shift",
    # Downtime
    "downtimemins": "downtimeMinutes",
    "downtimeminutes": "downtimeMinutes",
    "downtime": "downtimeMinutes",
    # Breakdown type / category
    "machinebreakdown": "breakdownType",
    "machinebreakdowntype": "breakdownType",
    "bdtype": "breakdownType",
    "breakdowntype": "breakdownType",
    # Description
    "bddescription": "breakdownDescription",
    "breakdowndescription": "breakdownDescription",
    "description": "breakdownDescription",
    # Containment / Counter Measure
    "countermeasure": "counterMeasure",
    # Root Cause
    "rootcause": "rootCause",
    # Corrective Action
    "correctiveaction": "correctiveAction",
    # Spare Parts
    "spareparts": "spareParts",
    "spares": "spareParts",
    # Target Date
    "targetdate": "targetDate",
    # Attended By
    "bdattendedby": "attendedBy",
    "attendedby": "attendedBy",
    # Machine Available Time
    "mcavailabletime": "availableTime",
    "availabletime": "availableTime",
    # Production Loss
    "productionloss": "productionLoss",
    "prodloss": "productionLoss",
    # Remarks
    "remarks": "remarks",
    "remark": "remarks",
}

_MAINTENANCE_CACHE: dict[str, dict[str, Any]] = {}
_MAINTENANCE_CACHE_LOCK = Lock()
_CACHE_TTL_SECONDS = max(30, int(os.getenv("GOOGLE_SHEETS_CACHE_TTL_SECONDS", "45")))


def _clean_header_key(header: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "", (header or "").strip().lower())
    return _MAINTENANCE_ALIAS_MAP.get(cleaned, cleaned or "col")


def normalize_breakdown_rows(rows: list[list[Any]]) -> list[dict[str, Any]]:
    """Normalize raw 2D sheet rows into strongly typed breakdown records."""
    if not rows:
        return []

    # First row is headers
    raw_headers = rows[0]
    col_mapping: list[str] = [_clean_header_key(str(h or "")) for h in raw_headers]

    normalized: list[dict[str, Any]] = []

    for row_idx, row in enumerate(rows[1:], start=1):
        if not any(c is not None and str(c).strip() != "" for c in row):
            continue

        raw_record: dict[str, Any] = {}
        for col_idx, col_name in enumerate(col_mapping):
            if col_idx < len(row):
                raw_record[col_name] = row[col_idx]

        machine_raw = _coerce_value(raw_record.get("machine"))
        if not machine_raw:
            # Skip rows without a machine name
            continue

        date_val = _coerce_date(raw_record.get("date"))
        downtime_val = _coerce_number(raw_record.get("downtimeMinutes")) or 0.0

        # Normalizing breakdown type (Mechanical, Electrical, etc.)
        raw_bd_type = _coerce_value(raw_record.get("breakdownType"))
        if raw_bd_type:
            bd_clean = str(raw_bd_type).strip()
            # Standardize common casings
            if bd_clean.lower() == "mechanical":
                bd_type = "Mechanical"
            elif bd_clean.lower() == "electrical":
                bd_type = "Electrical"
            elif "mech" in bd_clean.lower() and "elec" in bd_clean.lower():
                bd_type = "Electrical+Mechanical"
            else:
                bd_type = bd_clean.capitalize()
        else:
            bd_type = "Uncategorized"

        record: dict[str, Any] = {
            "id": f"bd-{row_idx}",
            "plantCode": _coerce_value(raw_record.get("plantCode")) or "MED- Forge",
            "machine": str(machine_raw).strip(),
            "machineOwner": _coerce_value(raw_record.get("machineOwner")),
            "date": date_val,
            "shift": (str(_coerce_value(raw_record.get("shift")) or "").strip().upper()) or None,
            "downtimeMinutes": round(downtime_val, 2),
            "breakdownType": bd_type,
            "breakdownDescription": _coerce_value(raw_record.get("breakdownDescription")),
            "counterMeasure": _coerce_value(raw_record.get("counterMeasure")),
            "rootCause": _coerce_value(raw_record.get("rootCause")),
            "correctiveAction": _coerce_value(raw_record.get("correctiveAction")),
            "spareParts": _coerce_value(raw_record.get("spareParts")),
            "targetDate": _coerce_date(raw_record.get("targetDate")) or _coerce_value(raw_record.get("targetDate")),
            "attendedBy": _coerce_value(raw_record.get("attendedBy")),
            "availableTime": _coerce_value(raw_record.get("availableTime")),
            "productionLoss": _coerce_number(raw_record.get("productionLoss")) or _coerce_value(raw_record.get("productionLoss")),
            "remarks": _coerce_value(raw_record.get("remarks")),
        }
        normalized.append(record)

    return normalized


def _dataset_date_bounds(records: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    valid_dates = [
        str(r["date"])
        for r in records
        if r.get("date") and re.match(r"^\d{4}-\d{2}-\d{2}$", str(r["date"]))
    ]
    if not valid_dates:
        return None, None
    valid_dates.sort()
    return valid_dates[0], valid_dates[-1]


def _read_local_reference_file() -> tuple[str, list[list[Any]], list[str]] | None:
    """Reads local reference excel file if present (for offline development/tests)."""
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "tmp", "medchal_breakdown.xlsx"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "Medchal b_d report.xlsx"),
    ]
    for path in candidates:
        norm_path = os.path.normpath(path)
        if os.path.exists(norm_path):
            try:
                import openpyxl

                wb = openpyxl.load_workbook(norm_path, data_only=True)
                # Primary sheet is 'Beakdown'
                target_sheet = "Beakdown" if "Beakdown" in wb.sheetnames else wb.sheetnames[0]
                sheet = wb[target_sheet]
                rows = [list(r) for r in sheet.iter_rows(values_only=True)]
                headers = [str(c or "") for c in (rows[0] if rows else [])]
                return target_sheet, rows, headers
            except Exception:
                continue
    return None


def get_maintenance_status(
    spreadsheet_id: str | None = None,
    worksheet_name: str | None = None,
) -> dict[str, Any]:
    """Inspect and report connection status for the Medchal breakdown sheet."""
    target_id = (
        spreadsheet_id
        or getattr(settings, "maintenance_spreadsheet_id", None)
        or os.getenv("MAINTENANCE_SPREADSHEET_ID")
        or "1u4ZaYcrJym_wbDpNEOiHdXBcGJ0R1kLww7G6XwOSrWs"
    )
    target_ws = (
        worksheet_name
        or getattr(settings, "maintenance_worksheet_name", None)
        or os.getenv("MAINTENANCE_WORKSHEET_NAME")
        or "Beakdown"
    )

    creds_info = _get_credentials_info()
    sa_email = creds_info.get("client_email") if creds_info else None

    # Try live connection
    try:
        ws_title, raw_rows, _ = _fetch_sheet_values(target_id, target_ws)
        records = normalize_breakdown_rows(raw_rows)
        min_date, max_date = _dataset_date_bounds(records)
        return {
            "source": "google-sheets",
            "connectionStatus": "connected",
            "status": "connected",
            "spreadsheetId": target_id,
            "worksheet": ws_title,
            "recordCount": len(records),
            "minDate": min_date,
            "maxDate": max_date,
            "cacheHit": False,
            "lastSuccessfulSync": datetime.now(UTC).isoformat(),
            "lastUpdated": datetime.now(UTC).isoformat(),
            "serviceAccount": sa_email,
            "error": None,
        }
    except Exception as exc:
        err_msg = str(exc)
        # Give helpful instructions if Google reports not found / forbidden
        if "404" in err_msg or "not found" in err_msg.lower():
            err_detail = (
                f"Google Sheet not found or access denied. Please grant Viewer access to service account "
                f"'{sa_email or 'manufacturing-dashboard@patil-manufacturing-dashboard.iam.gserviceaccount.com'}' "
                f"on spreadsheet ID '{target_id}'."
            )
        elif "403" in err_msg or "permission" in err_msg.lower():
            err_detail = (
                f"Permission denied. Ensure service account "
                f"'{sa_email or 'manufacturing-dashboard@patil-manufacturing-dashboard.iam.gserviceaccount.com'}' "
                f"has Viewer permission on spreadsheet ID '{target_id}'."
            )
        else:
            err_detail = err_msg

        # Check if local reference workbook exists to report record bounds
        local_ref = _read_local_reference_file()
        rec_count = 0
        min_d = None
        max_d = None
        if local_ref:
            _, local_rows, _ = local_ref
            local_recs = normalize_breakdown_rows(local_rows)
            rec_count = len(local_recs)
            min_d, max_d = _dataset_date_bounds(local_recs)

        return {
            "source": "google-sheets",
            "connectionStatus": "offline",
            "status": "offline",
            "spreadsheetId": target_id,
            "worksheet": target_ws,
            "recordCount": rec_count,
            "minDate": min_d,
            "maxDate": max_d,
            "cacheHit": False,
            "lastSuccessfulSync": None,
            "lastUpdated": datetime.now(UTC).isoformat(),
            "serviceAccount": sa_email,
            "error": err_detail,
        }


def fetch_maintenance_dataset(
    spreadsheet_id: str | None = None,
    worksheet_name: str | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    """Fetch breakdown records with caching and live Google Sheets integration."""
    target_id = (
        spreadsheet_id
        or getattr(settings, "maintenance_spreadsheet_id", None)
        or os.getenv("MAINTENANCE_SPREADSHEET_ID")
        or "1u4ZaYcrJym_wbDpNEOiHdXBcGJ0R1kLww7G6XwOSrWs"
    )
    target_ws = (
        worksheet_name
        or getattr(settings, "maintenance_worksheet_name", None)
        or os.getenv("MAINTENANCE_WORKSHEET_NAME")
        or "Beakdown"
    )
    cache_key = f"{target_id}:{target_ws}"

    if not refresh:
        with _MAINTENANCE_CACHE_LOCK:
            cached = _MAINTENANCE_CACHE.get(cache_key)
            if cached and (time.monotonic() - cached["cached_at"]) < _CACHE_TTL_SECONDS:
                payload = dict(cached["payload"])
                payload["cacheHit"] = True
                return payload

    creds_info = _get_credentials_info()
    sa_email = creds_info.get("client_email") if creds_info else None

    try:
        ws_title, raw_rows, _ = _fetch_sheet_values(target_id, target_ws)
        records = normalize_breakdown_rows(raw_rows)
        min_date, max_date = _dataset_date_bounds(records)

        payload = {
            "source": "google-sheets",
            "connectionStatus": "connected",
            "status": "connected",
            "spreadsheetId": target_id,
            "worksheet": ws_title,
            "recordCount": len(records),
            "minDate": min_date,
            "maxDate": max_date,
            "cacheHit": False,
            "lastSuccessfulSync": datetime.now(UTC).isoformat(),
            "lastUpdated": datetime.now(UTC).isoformat(),
            "serviceAccount": sa_email,
            "error": None,
            "data": records,
        }

        with _MAINTENANCE_CACHE_LOCK:
            _MAINTENANCE_CACHE[cache_key] = {
                "cached_at": time.monotonic(),
                "payload": payload,
            }

        return payload

    except Exception as exc:
        err_msg = str(exc)
        if "404" in err_msg or "not found" in err_msg.lower():
            err_detail = (
                f"Google Sheet access denied or not found. Please grant Viewer access to "
                f"'{sa_email or 'manufacturing-dashboard@patil-manufacturing-dashboard.iam.gserviceaccount.com'}' "
                f"on spreadsheet ID '{target_id}'."
            )
        elif "403" in err_msg or "permission" in err_msg.lower():
            err_detail = (
                f"Permission denied. Please grant Viewer access to "
                f"'{sa_email or 'manufacturing-dashboard@patil-manufacturing-dashboard.iam.gserviceaccount.com'}' "
                f"on spreadsheet ID '{target_id}'."
            )
        else:
            err_detail = err_msg

        # Check if local reference workbook exists
        local_ref = _read_local_reference_file()
        if local_ref:
            ws_title, local_rows, _ = local_ref
            records = normalize_breakdown_rows(local_rows)
            min_date, max_date = _dataset_date_bounds(records)
            return {
                "source": "local-reference",
                "connectionStatus": "offline",
                "status": "offline",
                "spreadsheetId": target_id,
                "worksheet": ws_title,
                "recordCount": len(records),
                "minDate": min_date,
                "maxDate": max_date,
                "cacheHit": False,
                "lastSuccessfulSync": None,
                "lastUpdated": datetime.now(UTC).isoformat(),
                "serviceAccount": sa_email,
                "error": err_detail,
                "data": records,
            }

        return {
            "source": "google-sheets",
            "connectionStatus": "offline",
            "status": "offline",
            "spreadsheetId": target_id,
            "worksheet": target_ws,
            "recordCount": 0,
            "minDate": None,
            "maxDate": None,
            "cacheHit": False,
            "lastSuccessfulSync": None,
            "lastUpdated": datetime.now(UTC).isoformat(),
            "serviceAccount": sa_email,
            "error": err_detail,
            "data": [],
        }

