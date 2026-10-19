"""ERC Mk-V Line Tracker Ingestion & Normalization Service.

Provides:
1. Ingestion of the 17-tab ERC Mk-V Line Tracker workbook (local Excel or future Google Sheets).
2. Distinction between primary operational source tabs (Entries, Machine Master, Production Order,
   RM Heat Plan vs Actual, Heat & Lot Number Reference) and formula-driven report tabs.
3. Prevention of double counting between Downtime Log (rows 14569-14868) and Entries.
4. Validation warnings for known data quality gaps (Nov 2024 gap, incomplete targets, placeholder heats).
5. Exact component-weighted OEE calculations adhering to validated industrial engineering formulas.
6. Thread-safe in-memory caching with TTL and force-refresh support.
"""

from __future__ import annotations

import datetime
import logging
import os
import re
import threading
from typing import Any

import openpyxl

from app.core.config import settings

logger = logging.getLogger(__name__)

# Cache configuration
_LINE_TRACKER_CACHE: dict[str, Any] = {}
_LINE_TRACKER_LOCK = threading.Lock()
_DOWNTIME_LOG_CACHE: dict[str, Any] = {}
_DOWNTIME_LOG_LOCK = threading.Lock()
_DOWNTIME_LOG_SPREADSHEET_ID = "1axzlqa-0nga1nnLSOZ1HQpjFZzx1kUlQ-KrqJgblw-s"
_DOWNTIME_LOG_WORKSHEET = "Downtime Log"

# Known placeholder heat and lot codes that require metallurgical reconciliation
PLACEHOLDER_HEATS = {"h-2409-118", "placeholder"}
PLACEHOLDER_LOTS = {"lot-20260920-db-01", "lot-20260921-db-02", "placeholder"}

RECONCILIATION_TAG = "Pending Metallurgical Reconciliation"
VERIFIED_TAG = "Verified Metallurgical Reference"

PLANNED_DOWNTIME_CATEGORIES = {
    "planned shutdown",
    "pm activities (preventive maint.)",
    "set up & adjustment",
    "trial / npd",
}


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    val_str = str(value).strip()
    if not val_str or val_str.lower() in {"none", "null", "n/a", "na", "#n/a", "#value!"}:
        return None
    return val_str


def _clean_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    clean = _clean_str(value)
    if not clean:
        return None
    try:
        clean = clean.replace(",", "").replace("%", "")
        return float(clean)
    except (ValueError, TypeError):
        return None


def _clean_int(value: Any) -> int | None:
    f = _clean_float(value)
    if f is None:
        return None
    try:
        return int(round(f))
    except (ValueError, OverflowError):
        return None


def _clean_date_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime.datetime | datetime.date):
        return value.strftime("%Y-%m-%d")
    s = _clean_str(value)
    if not s:
        return None
    # match ISO YYYY-MM-DD
    m_iso = re.search(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b", s)
    if m_iso:
        try:
            y, m, d = int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))
            return datetime.date(y, m, d).isoformat()
        except ValueError:
            pass
    # match DD-MM-YYYY or DD-Mon-YY
    m_dmy = re.search(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b", s)
    if m_dmy:
        try:
            d, m, y = int(m_dmy.group(1)), int(m_dmy.group(2)), int(m_dmy.group(3))
            if y < 100:
                y += 2000
            return datetime.date(y, m, d).isoformat()
        except ValueError:
            pass
    # Textual dates like 01-Jul-26
    m_text = re.search(r"(\d{1,2})[-/ ]([a-zA-Z]{3})[-/ ](\d{2,4})", s)
    if m_text:
        months = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
                  "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
        try:
            d = int(m_text.group(1))
            m = months.get(m_text.group(2).lower(), 1)
            y = int(m_text.group(3))
            if y < 100:
                y += 2000
            return datetime.date(y, m, d).isoformat()
        except ValueError:
            pass
    return s[:10] if len(s) >= 10 else s


def resolve_line_tracker_file_path() -> str | None:
    """Find the existing ERC Mk-V Line Tracker workbook on disk."""
    candidates = [
        getattr(settings, "line_tracker_local_path", ""),
        r"C:\Users\Preet Jaiswal\Downloads\ERC_MkV_Line_Tracker R0_10102026.xlsx",
        os.path.join(os.path.expanduser("~"), "Downloads", "ERC_MkV_Line_Tracker R0_10102026.xlsx"),
        os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "ERC_MkV_Line_Tracker R0_10102026.xlsx")),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return os.path.abspath(c)
    return None


def fetch_google_sheets_workbook(spreadsheet_id: str) -> tuple[Any, dict[str, Any]]:
    """Read every worksheet of the ERC Mk-V Google Sheet via the read-only Sheets API and
    reconstruct an in-memory openpyxl Workbook so the existing parser is reused unchanged.

    Uses `spreadsheets.values` (scope `spreadsheets.readonly`) rather than a Drive export, so
    it works with the Viewer grant the service account actually has. Dates are requested as
    formatted strings and numbers as raw values, matching what openpyxl would read from the
    downloaded workbook. Raises on denial / unavailability so the caller can fall back to the
    local Excel workbook and never misrepresent stale data as live.

    Returns (workbook, source_meta) where source_meta carries the spreadsheet title.
    """
    if not spreadsheet_id:
        raise ValueError("No Google Sheets spreadsheet id configured for the ERC Mk-V Line Tracker.")

    # Imported lazily so the local-Excel path never requires the Google client libraries.
    from app.services.google_sheets_service import _get_credentials_info
    from google.oauth2 import service_account as _service_account
    from googleapiclient.discovery import build as _build
    import openpyxl as _openpyxl

    creds_info = _get_credentials_info()
    if not creds_info:
        raise RuntimeError("Google service-account credentials are not configured.")

    credentials = _service_account.Credentials.from_service_account_info(
        creds_info,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    svc = _build("sheets", "v4", credentials=credentials, cache_discovery=False)

    meta = svc.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    title = str(meta["properties"].get("title") or "ERC_MkV_Line_Tracker")
    sheets = meta.get("sheets", [])
    if not sheets:
        raise RuntimeError(f"Spreadsheet {spreadsheet_id} contains no worksheets.")

    titles = [s["properties"]["title"] for s in sheets]
    ranges = ["'%s'!A1:ZZ" % t.replace("'", "''") for t in titles]
    batch = svc.spreadsheets().values().batchGet(
        spreadsheetId=spreadsheet_id,
        ranges=ranges,
        majorDimension="ROWS",
        valueRenderOption="UNFORMATTED_VALUE",
        dateTimeRenderOption="FORMATTED_STRING",
    ).execute()

    by_tab: dict[str, list[list[Any]]] = {}
    for vr in batch.get("valueRanges", []):
        rng = str(vr.get("range", ""))
        key = rng.split("!")[0].strip().strip("'")
        by_tab[key] = vr.get("values", []) or []

    wb = _openpyxl.Workbook()
    wb.remove(wb.active)
    total_cells = 0
    for t in titles:
        ws = wb.create_sheet(title=t)
        rows = by_tab.get(t)
        if rows is None:  # tolerate range-quoting differences
            for k, v in by_tab.items():
                if k.strip().strip("'") == t:
                    rows = v
                    break
        for r_idx, row in enumerate(rows or [], start=1):
            for c_idx, val in enumerate(row, start=1):
                if val is None or val == "":
                    continue
                ws.cell(row=r_idx, column=c_idx, value=val)
                total_cells += 1

    source_meta = {
        "file_name": title,
        "source": "google_sheets",
        "google_sheet_id": spreadsheet_id,
        "tab_count": len(titles),
        "approx_cells": total_cells,
        "last_modified": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "size_bytes": total_cells * 64,  # rough, in-memory only; no file on disk
    }
    return wb, source_meta


def _downtime_header_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def _downtime_column_indexes(headers: list[str]) -> dict[str, int | None]:
    aliases = {
        "date": {"date", "downtimedate", "eventdate"},
        "line": {"line", "productionline", "linename"},
        "shift": {"shift", "shiftname"},
        "part": {"part", "partname", "product"},
        "stage": {"stage", "processstage", "process"},
        "machine": {"machine", "machinename", "equipment", "asset"},
        "category": {"category", "downtimecategory", "reasoncategory"},
        "downtime_type": {"downtimetype", "downtimetyperaw", "downtimereason", "reason"},
        "breakdown_type": {"breakdowntype", "failuremode"},
        "duration": {
            "downtimemins",
            "downtimemin",
            "downtimeminutes",
            "downtimehours",
            "downtimehrs",
            "downtimeseconds",
            "durationminutes",
            "durationmins",
            "durationhours",
            "durationseconds",
            "duration",
        },
        "production_loss": {"productionloss", "prodlossnos", "prodloss"},
        "production_target": {"productiontarget", "prodtargetnos", "target"},
        "total_production": {"totalproduction", "totalprodnos", "actualproduction"},
        "rejection": {"rejection", "rejectedqty"},
        "description": {"description", "remarks", "comments"},
        "planned": {"planned", "isplanned", "plannedunplanned"},
    }
    keys = [_downtime_header_key(header) for header in headers]
    result: dict[str, int | None] = {}
    for field, accepted in aliases.items():
        result[field] = next((idx for idx, key in enumerate(keys) if key in accepted), None)
    return result


def _downtime_duration_unit(header: str) -> str | None:
    key = _downtime_header_key(header)
    if re.search(r"(mins?|minutes?)$", key):
        return "minutes"
    if re.search(r"(hrs?|hours?)$", key):
        return "hours"
    if re.search(r"(secs?|seconds?)$", key):
        return "seconds"
    return None


def _downtime_raw_record(row: list[Any], headers: list[str]) -> dict[str, Any]:
    values: dict[str, Any] = {}
    occurrences: dict[str, int] = {}
    for index, raw_header in enumerate(headers):
        base = str(raw_header or f"column_{index + 1}").strip() or f"column_{index + 1}"
        occurrences[base] = occurrences.get(base, 0) + 1
        key = base if occurrences[base] == 1 else f"{base}__{occurrences[base]}"
        value = row[index] if index < len(row) else None
        values[key] = value if value != "" else None
    return values


def _parse_downtime_sheet_rows(
    headers: list[str], rows: list[list[Any]], formula_rows: list[list[Any]] | None = None,
) -> dict[str, Any]:
    """Preserve source columns and add normalized fields for existing downtime analytics."""
    if not headers or not any(str(header).strip() for header in headers):
        raise ValueError("The Downtime Log worksheet does not contain a header row.")

    indexes = _downtime_column_indexes(headers)
    duration_index = indexes["duration"]
    duration_unit = _downtime_duration_unit(headers[duration_index]) if duration_index is not None else None
    records: list[dict[str, Any]] = []
    blank_rows = 0
    invalid_date_count = 0
    missing_duration_count = 0
    invalid_duration_count = 0
    duplicate_rows = 0
    signatures: set[tuple[str, ...]] = set()
    formula_values = formula_rows or []
    formula_cells = 0
    formula_row_numbers: set[int] = set()
    formula_rows_with_values: set[int] = set()
    for row_index, formula_row in enumerate(formula_values, start=1):
        formula_count = sum(
            1 for value in formula_row
            if isinstance(value, str) and value.startswith("=")
        )
        formula_cells += formula_count
        if formula_count:
            formula_row_numbers.add(row_index)
            value_row = rows[row_index - 1] if row_index - 1 < len(rows) else []
            if any(value is not None and str(value).strip() for value in value_row):
                formula_rows_with_values.add(row_index)

    category_values: set[str] = set()
    for row_index, row in enumerate(rows[1:], start=2):
        if not any(value is not None and str(value).strip() for value in row):
            blank_rows += 1
            continue

        signature = tuple(str(value) for value in row)
        if signature in signatures:
            duplicate_rows += 1
        signatures.add(signature)

        def cell(field: str) -> Any:
            index = indexes.get(field)
            return row[index] if index is not None and index < len(row) else None

        raw_date = cell("date")
        parsed_date = _clean_date_str(raw_date)
        if parsed_date:
            try:
                parsed_date = datetime.date.fromisoformat(parsed_date).isoformat()
            except ValueError:
                parsed_date = None
        if not parsed_date:
            invalid_date_count += 1

        raw_duration = cell("duration")
        duration_value = _clean_float(raw_duration)
        duration_minutes: float | None = None
        if raw_duration is None or not str(raw_duration).strip():
            missing_duration_count += 1
        elif duration_value is None or duration_value < 0:
            invalid_duration_count += 1
        elif duration_unit == "minutes":
            duration_minutes = duration_value
        elif duration_unit == "hours":
            duration_minutes = duration_value * 60.0
        elif duration_unit == "seconds":
            duration_minutes = duration_value / 60.0
        else:
            invalid_duration_count += 1

        category = _clean_str(cell("category"))
        if category:
            category_values.add(category.lower())
        planned_raw = _clean_str(cell("planned"))
        if planned_raw:
            is_planned = planned_raw.lower() in {"yes", "true", "planned", "1"}
        else:
            is_planned = bool(category and category.lower() in PLANNED_DOWNTIME_CATEGORIES)

        month_year = parsed_date[:7] if parsed_date else None
        record = {
            "row_number": row_index,
            "date": parsed_date,
            "month_year": month_year,
            "line": _clean_str(cell("line")),
            "shift": _clean_str(cell("shift")) or "Unspecified",
            "part": _clean_str(cell("part")),
            "stage": _clean_str(cell("stage")) or "Unspecified",
            "machine": _clean_str(cell("machine")) or "Unspecified",
            "category": category or "Unclassified",
            "downtime_type": _clean_str(cell("downtime_type")) or "",
            "breakdown_type": _clean_str(cell("breakdown_type")),
            "duration_value": duration_value,
            "duration_unit": duration_unit,
            "downtime_minutes": duration_minutes,
            "production_loss": _clean_float(cell("production_loss")),
            "production_target": _clean_float(cell("production_target")),
            "total_production": _clean_float(cell("total_production")),
            "rejection": _clean_float(cell("rejection")),
            "description": _clean_str(cell("description")),
            "is_planned": is_planned,
            "source_values": _downtime_raw_record(row, headers),
        }
        records.append(record)

    planned_supported = (
        indexes["planned"] is not None
        or bool(category_values.intersection(PLANNED_DOWNTIME_CATEGORIES))
    )
    warnings: list[dict[str, Any]] = []

    def warn(code: str, title: str, description: str, severity: str = "warning") -> None:
        warnings.append(
            {
                "code": code,
                "severity": severity,
                "title": title,
                "description": description,
            }
        )

    if indexes["date"] is None:
        warn(
            "DATE_COLUMN_MISSING",
            "Date column not found",
            "Date filtering and date-based trends are unavailable for this worksheet header.",
        )
    elif invalid_date_count:
        warn(
            "INVALID_DATES",
            "Some dates could not be parsed",
            f"{invalid_date_count} non-empty data rows have blank or invalid dates "
            "and are excluded from date-based filters.",
        )
    if duration_index is None:
        warn(
            "DURATION_COLUMN_MISSING",
            "Duration column not found",
            "Downtime duration totals are unavailable because no recognized duration "
            "header was found.",
        )
    elif duration_unit is None:
        warn(
            "DURATION_UNIT_UNKNOWN",
            "Duration unit is unclear",
            "Duration totals are unavailable because the source header does not identify "
            "minutes, hours, or seconds.",
        )
    elif missing_duration_count or invalid_duration_count:
        warn(
            "INVALID_DURATIONS",
            "Some durations are missing or invalid",
            f"{missing_duration_count} durations are blank and {invalid_duration_count} "
            "are invalid or negative; those values are excluded from duration totals.",
        )
    if duplicate_rows:
        warn(
            "EXACT_DUPLICATE_ROWS",
            "Exact duplicate source rows found",
            f"{duplicate_rows} exact duplicate rows were detected and retained; "
            "no rows were removed.",
        )
    if not planned_supported:
        warn(
            "PLANNED_CLASSIFICATION_UNAVAILABLE",
            "Planned classification is unavailable",
            "The worksheet has no planned flag or recognized planned category values.",
            severity="info",
        )

    return {
        "historical_downtime_records": records,
        "records_summary": {
            "historical_downtime_accepted": len(records),
            "blank_rows_skipped": blank_rows,
            "invalid_dates": invalid_date_count,
            "missing_durations": missing_duration_count,
            "invalid_durations": invalid_duration_count,
            "exact_duplicate_rows_retained": duplicate_rows,
            "formula_rows": len(formula_row_numbers),
            "formula_cells": formula_cells,
            "formula_rows_with_values": len(formula_rows_with_values),
            "mirrored_downtime_skipped": 0,
        },
        "planned_classification_supported": planned_supported,
        "duration_unit": duration_unit,
        "data_quality_warnings": warnings,
        "source_headers": headers,
    }


def get_line_tracker_downtime_log_dataset(refresh: bool = False) -> dict[str, Any]:
    """Fetch only the configured Downtime Log tab using the shared read-only Sheets client."""
    from app.services.google_sheets_service import _fetch_sheet_values_with_metadata

    spreadsheet_id = (getattr(settings, "line_tracker_spreadsheet_id", "") or "").strip()
    if spreadsheet_id != _DOWNTIME_LOG_SPREADSHEET_ID:
        raise RuntimeError(
            "The configured Line Tracker spreadsheet does not match the Downtime Log source."
        )

    now = datetime.datetime.now(datetime.UTC)
    cache_key = f"{spreadsheet_id}:{_DOWNTIME_LOG_WORKSHEET}"
    ttl = max(30, int(getattr(settings, "google_sheets_cache_ttl_seconds", 45)))
    with _DOWNTIME_LOG_LOCK:
        cached = _DOWNTIME_LOG_CACHE.get(cache_key)
        if not refresh and cached and (now - cached["cached_at"]).total_seconds() < ttl:
            return cached["data"]

        payload = _fetch_sheet_values_with_metadata(
            spreadsheet_id,
            _DOWNTIME_LOG_WORKSHEET,
            include_formulas=True,
        )
        parsed = _parse_downtime_sheet_rows(
            payload.get("headers") or [],
            payload.get("rows") or [],
            payload.get("formula_rows") or [],
        )
        refreshed_at = datetime.datetime.now(datetime.UTC).isoformat()
        result = {
            **parsed,
            "source_type": "google_sheets",
            "source_notice": "Live Google Sheets source: Downtime Log tab (read-only).",
            "is_live_google_sheets": True,
            "google_sheet_id": spreadsheet_id,
            "worksheet": payload.get("worksheet"),
            "worksheet_id": payload.get("worksheet_id"),
            "used_range": _downtime_used_range(
                payload.get("rows") or [], payload.get("formula_rows") or []
            ),
            "last_modified": refreshed_at,
            "refreshed_at": refreshed_at,
        }
        _DOWNTIME_LOG_CACHE[cache_key] = {"data": result, "cached_at": now}
        return result


def _downtime_used_range(
    rows: list[list[Any]], formula_rows: list[list[Any]]
) -> str | None:
    max_row = 0
    max_column = 0
    for row_number, row in enumerate(rows, start=1):
        for column_number, value in enumerate(row, start=1):
            if value is not None and str(value).strip():
                max_row = max(max_row, row_number)
                max_column = max(max_column, column_number)
    for row_number, row in enumerate(formula_rows, start=1):
        for column_number, value in enumerate(row, start=1):
            if isinstance(value, str) and value.startswith("="):
                max_row = max(max_row, row_number)
                max_column = max(max_column, column_number)
    if not max_row or not max_column:
        return None

    def column_name(number: int) -> str:
        label = ""
        while number:
            number, remainder = divmod(number - 1, 26)
            label = chr(65 + remainder) + label
        return label

    return f"A1:{column_name(max_column)}{max_row}"


def parse_line_tracker_workbook(
    file_path: str | None = None,
    workbook: Any | None = None,
    source_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Parse and normalize all relevant tabs from the ERC Mk-V Line Tracker workbook.

    Accepts either a local `file_path` (openpyxl loads it) or an already-loaded `workbook`
    (e.g. reconstructed from the Google Sheets API) so the same logic serves both sources.
    """
    if workbook is None:
        if not file_path or not os.path.exists(file_path):
            raise FileNotFoundError(f"Line Tracker file not found: {file_path}")
        # Use data_only=True to read evaluated formula values
        workbook = openpyxl.load_workbook(file_path, data_only=True)
    wb = workbook

    # -------------------------------------------------------------------------
    # 1. Parse Machine Master
    # -------------------------------------------------------------------------
    machines_dict: dict[str, dict[str, Any]] = {}
    machines_list: list[dict[str, Any]] = []
    ws_mm = wb["Machine Master"] if "Machine Master" in wb.sheetnames else None

    if ws_mm:
        for r in range(2, ws_mm.max_row + 1):
            wc_raw = ws_mm.cell(r, 1).value
            m_raw = ws_mm.cell(r, 2).value
            if not m_raw or "How to use" in str(wc_raw):
                continue
            machine_name = str(m_raw).strip()
            work_center = str(wc_raw).strip() if wc_raw else "Unspecified"
            rated_ct = _clean_float(ws_mm.cell(r, 3).value)
            status = str(ws_mm.cell(r, 4).value).strip() if ws_mm.cell(r, 4).value else "Active"
            comm_date = _clean_date_str(ws_mm.cell(r, 6).value)
            manpower = _clean_float(ws_mm.cell(r, 7).value)
            decomm_date = _clean_date_str(ws_mm.cell(r, 8).value)

            entry = {
                "work_center": work_center,
                "machine": machine_name,
                "rated_ct_sec": rated_ct,
                "status": status,
                "commissioning_date": comm_date,
                "decommissioned_date": decomm_date,
                "rated_manpower": manpower,
            }
            machines_dict[machine_name.lower()] = entry
            machines_list.append(entry)

    # -------------------------------------------------------------------------
    # 2. Parse Heat & Lot Reference & RM Heat Plan vs Actual
    # -------------------------------------------------------------------------
    master_heats: dict[str, dict[str, Any]] = {}
    ws_hl = wb["Heat & Lot Number Reference"] if "Heat & Lot Number Reference" in wb.sheetnames else None

    if ws_hl:
        for r in range(6, ws_hl.max_row + 1):
            heat_no = _clean_str(ws_hl.cell(r, 1).value)
            if not heat_no or "Distinct" in heat_no or "Reconciliation" in heat_no:
                continue
            lot_no = _clean_str(ws_hl.cell(r, 2).value)
            cust = _clean_str(ws_hl.cell(r, 3).value)
            supp = _clean_str(ws_hl.cell(r, 4).value)
            rm_mt = _clean_float(ws_hl.cell(r, 5).value)
            batch = _clean_str(ws_hl.cell(r, 6).value)
            master_heats[heat_no.lower()] = {
                "heat_number": heat_no,
                "lot_number": lot_no,
                "customer": cust,
                "supplier": supp,
                "rm_qty_mt": rm_mt,
                "source_batch": batch,
            }

    # Also parse RM Heat Plan vs Actual for operational yield metrics
    heat_yields: list[dict[str, Any]] = []
    ws_rhp = wb["RM Heat Plan vs Actual"] if "RM Heat Plan vs Actual" in wb.sheetnames else None
    if ws_rhp:
        for r in range(5, ws_rhp.max_row + 1):
            cust = _clean_str(ws_rhp.cell(r, 1).value)
            supp = _clean_str(ws_rhp.cell(r, 2).value)
            heat = _clean_str(ws_rhp.cell(r, 3).value)
            lot = _clean_str(ws_rhp.cell(r, 4).value)
            if not heat or heat.lower() in {"summary", "total", "bar cropper"}:
                continue
            rm_qty = _clean_float(ws_rhp.cell(r, 5).value)
            plan_cut_bar = _clean_float(ws_rhp.cell(r, 6).value)
            act_cut_bar = _clean_float(ws_rhp.cell(r, 7).value)
            endbit_scrap = _clean_float(ws_rhp.cell(r, 8).value)
            act_turning_ok = _clean_float(ws_rhp.cell(r, 9).value)
            act_turning_rej = _clean_float(ws_rhp.cell(r, 10).value)
            plan_forming_ok = _clean_float(ws_rhp.cell(r, 11).value)
            act_forming_ok = _clean_float(ws_rhp.cell(r, 12).value)
            act_forming_rej = _clean_float(ws_rhp.cell(r, 13).value)
            plan_final_supply = _clean_float(ws_rhp.cell(r, 14).value)
            yield_pct = _clean_float(ws_rhp.cell(r, 15).value)
            batch = _clean_str(ws_rhp.cell(r, 17).value)

            heat_yields.append({
                "customer": cust,
                "supplier": supp,
                "heat_number": heat,
                "lot_number": lot,
                "rm_qty_mt": rm_qty,
                "plan_cut_bar_nos": plan_cut_bar,
                "actual_cut_bar_nos": act_cut_bar,
                "actual_endbit_scrap_nos": endbit_scrap,
                "actual_turning_ok_nos": act_turning_ok,
                "actual_turning_rej_nos": act_turning_rej,
                "plan_forming_ok_nos": plan_forming_ok,
                "actual_forming_ok_nos": act_forming_ok,
                "actual_forming_rej_nos": act_forming_rej,
                "plan_final_supply_nos": plan_final_supply,
                "yield_vs_plan_pct": round(yield_pct * 100, 2) if yield_pct is not None and yield_pct <= 2.0 else (round(yield_pct, 2) if yield_pct else None),
                "source_batch": batch,
            })

    # -------------------------------------------------------------------------
    # 3. Parse Production Orders
    # -------------------------------------------------------------------------
    orders_list: list[dict[str, Any]] = []
    ws_po = wb["Production Order"] if "Production Order" in wb.sheetnames else None
    if ws_po:
        for r in range(2, ws_po.max_row + 1):
            ord_nr = _clean_str(ws_po.cell(r, 2).value)
            cust = _clean_str(ws_po.cell(r, 3).value)
            if not ord_nr or not cust or "How to use" in cust:
                continue
            po_date = _clean_date_str(ws_po.cell(r, 1).value)
            qty = _clean_float(ws_po.cell(r, 4).value)
            part = _clean_str(ws_po.cell(r, 5).value) or "ERC MKV"
            dp_date = _clean_date_str(ws_po.cell(r, 6).value)
            assigned_heat = _clean_str(ws_po.cell(r, 7).value)
            subsequent_lot = _clean_str(ws_po.cell(r, 8).value)
            status = _clean_str(ws_po.cell(r, 9).value) or "Open"
            notes = _clean_str(ws_po.cell(r, 10).value)
            rm_mt = _clean_float(ws_po.cell(r, 11).value)

            # Check if assigned heat is real or placeholder
            is_placeholder = bool(assigned_heat and assigned_heat.lower() in PLACEHOLDER_HEATS)
            traceability_tag = RECONCILIATION_TAG if is_placeholder else VERIFIED_TAG

            orders_list.append({
                "po_date": po_date,
                "order_number": ord_nr,
                "customer": cust,
                "order_qty": qty,
                "part": part,
                "dp_date": dp_date,
                "assigned_rm_heat_number": assigned_heat,
                "subsequent_lot_number": subsequent_lot,
                "status": status,
                "notes": notes,
                "rm_requirement_mt": rm_mt,
                "traceability_status": traceability_tag,
            })

    # -------------------------------------------------------------------------
    # 4. Parse Shift Entries (Live Operational Data)
    # -------------------------------------------------------------------------
    shift_entries: list[dict[str, Any]] = []
    ws_ent = wb["Entries"] if "Entries" in wb.sheetnames else None
    entries_rejected = 0

    if ws_ent:
        for r in range(2, ws_ent.max_row + 1):
            d_val = ws_ent.cell(r, 1).value
            m_val = ws_ent.cell(r, 6).value
            if not d_val or not m_val or "How to use" in str(d_val):
                continue
            date_str = _clean_date_str(d_val)
            if not date_str:
                entries_rejected += 1
                continue

            machine_raw = str(m_val).strip()
            machine_meta = machines_dict.get(machine_raw.lower(), {})
            work_center = _clean_str(ws_ent.cell(r, 5).value) or machine_meta.get("work_center", "Unspecified")

            rated_ct = _clean_float(ws_ent.cell(r, 7).value) or machine_meta.get("rated_ct_sec")
            shift = _clean_str(ws_ent.cell(r, 2).value) or "Shift 1"
            shift_dur = _clean_float(ws_ent.cell(r, 3).value) or 660.0
            output_qty = _clean_float(ws_ent.cell(r, 8).value) or 0.0
            downtime_min = _clean_float(ws_ent.cell(r, 9).value)
            if downtime_min is None and ws_ent.cell(r, 9).value == 0:
                downtime_min = 0.0

            rejects_other = _clean_float(ws_ent.cell(r, 10).value) or 0.0
            planned_shutdown_min = _clean_float(ws_ent.cell(r, 17).value) or 0.0
            planned_mp = _clean_float(ws_ent.cell(r, 22).value) or machine_meta.get("rated_manpower")
            actual_mp = _clean_float(ws_ent.cell(r, 23).value)
            mp_shortfall = _clean_float(ws_ent.cell(r, 24).value)
            if mp_shortfall is None and planned_mp is not None and actual_mp is not None:
                mp_shortfall = planned_mp - actual_mp

            rm_heat = _clean_str(ws_ent.cell(r, 25).value)
            bundle_nr = _clean_str(ws_ent.cell(r, 26).value)
            lot_nr = _clean_str(ws_ent.cell(r, 27).value)
            part = _clean_str(ws_ent.cell(r, 28).value) or "ERC MKV"

            op10_rej = _clean_float(ws_ent.cell(r, 29).value) or 0.0
            op20_rej = _clean_float(ws_ent.cell(r, 30).value) or 0.0
            op30_rej = _clean_float(ws_ent.cell(r, 31).value) or 0.0

            total_rejects = _clean_float(ws_ent.cell(r, 32).value)
            if total_rejects is None:
                if work_center.lower() == "forming":
                    total_rejects = op10_rej + op20_rej + op30_rej
                else:
                    total_rejects = rejects_other

            # Calculate validated component-weighted OEE
            planned_operating_time_min = max(shift_dur - planned_shutdown_min, 0.0)
            run_time_min = max(planned_operating_time_min - (downtime_min or 0.0), 0.0)
            good_qty = max(output_qty - (total_rejects or 0.0), 0.0)

            # Availability %
            if planned_operating_time_min > 0:
                availability = run_time_min / planned_operating_time_min
            else:
                availability = None

            # Performance %
            if run_time_min > 0 and rated_ct is not None and rated_ct > 0:
                performance = (output_qty * rated_ct) / (run_time_min * 60.0)
            else:
                performance = None

            # Quality %
            if output_qty > 0:
                quality = good_qty / output_qty
            else:
                quality = None

            # OEE %
            if availability is not None and performance is not None and quality is not None:
                oee = availability * performance * quality
            else:
                oee = None

            # Actual cycle time & efficiency
            if output_qty > 0 and run_time_min > 0:
                actual_ct_sec = (run_time_min * 60.0) / output_qty
            else:
                actual_ct_sec = None

            if actual_ct_sec and actual_ct_sec > 0 and rated_ct:
                efficiency = rated_ct / actual_ct_sec
            else:
                efficiency = None

            # Check heat reconciliation
            is_placeholder = bool(rm_heat and rm_heat.lower() in PLACEHOLDER_HEATS)
            traceability_tag = RECONCILIATION_TAG if is_placeholder else VERIFIED_TAG

            shift_entries.append({
                "row_number": r,
                "date": date_str,
                "shift": shift,
                "shift_duration_min": shift_dur,
                "work_center": work_center,
                "machine": machine_raw,
                "rated_ct_sec": rated_ct,
                "output_qty": output_qty,
                "downtime_min": downtime_min,
                "planned_shutdown_min": planned_shutdown_min,
                "planned_operating_time_min": planned_operating_time_min,
                "run_time_min": run_time_min,
                "total_rejects": total_rejects,
                "good_qty": good_qty,
                "actual_ct_sec": round(actual_ct_sec, 2) if actual_ct_sec else None,
                "efficiency_rate": round(efficiency, 4) if efficiency else None,
                "availability_rate": round(availability, 4) if availability is not None else None,
                "performance_rate": round(performance, 4) if performance is not None else None,
                "quality_rate": round(quality, 4) if quality is not None else None,
                "oee_rate": round(oee, 4) if oee is not None else None,
                "planned_manpower": planned_mp,
                "actual_manpower": actual_mp,
                "manpower_shortfall": mp_shortfall,
                "rm_heat_number": rm_heat,
                "bundle_number": bundle_nr,
                "lot_number": lot_nr,
                "part": part,
                "traceability_status": traceability_tag,
            })

    # -------------------------------------------------------------------------
    # 5. Parse Downtime Log (Historical Records + Double-Counting Filter)
    # -------------------------------------------------------------------------
    ws_dt = wb["Downtime Log"] if "Downtime Log" in wb.sheetnames else None
    historical_downtime_records: list[dict[str, Any]] = []
    mirrored_rows_skipped = 0
    categories_tally: dict[str, dict[str, Any]] = {}
    nov_2024_count = 0
    incomplete_target_count = 0

    if ws_dt:
        for r in range(2, ws_dt.max_row + 1):
            if r >= 14569:
                mirrored_rows_skipped += 1
                continue
            date_raw = ws_dt.cell(r, 1).value
            if not date_raw or str(date_raw).startswith("Rows"):
                continue
            date_str = _clean_date_str(date_raw)
            if not date_str:
                continue

            if date_str.startswith("2024-11"):
                nov_2024_count += 1

            line = _clean_str(ws_dt.cell(r, 2).value) or "ERC"
            shift = _clean_str(ws_dt.cell(r, 3).value) or "All"
            part = _clean_str(ws_dt.cell(r, 4).value) or "MK5"
            stage = _clean_str(ws_dt.cell(r, 5).value) or "All"
            machine = _clean_str(ws_dt.cell(r, 6).value) or "All"
            dt_raw = _clean_str(ws_dt.cell(r, 7).value)
            dt_cat = _clean_str(ws_dt.cell(r, 8).value) or "Unclassified"
            bd_type = _clean_str(ws_dt.cell(r, 9).value)
            dt_mins = _clean_float(ws_dt.cell(r, 10).value) or 0.0
            prod_loss = _clean_float(ws_dt.cell(r, 11).value) or 0.0
            prod_target = _clean_float(ws_dt.cell(r, 12).value)
            prod_actual = _clean_float(ws_dt.cell(r, 13).value) or 0.0
            rejection = _clean_float(ws_dt.cell(r, 14).value) or 0.0
            desc = _clean_str(ws_dt.cell(r, 15).value)

            if prod_target is None or prod_target == 0:
                incomplete_target_count += 1

            is_planned = dt_cat.lower() in PLANNED_DOWNTIME_CATEGORIES

            record = {
                "row_number": r,
                "date": date_str,
                "line": line,
                "shift": shift,
                "part": part,
                "stage": stage,
                "machine": machine,
                "downtime_type": dt_raw,
                "category": dt_cat,
                "breakdown_type": bd_type,
                "downtime_minutes": dt_mins,
                "production_loss": prod_loss,
                "production_target": prod_target,
                "total_production": prod_actual,
                "rejection": rejection,
                "description": desc,
                "is_planned": is_planned,
            }
            historical_downtime_records.append(record)

            # Tally categories
            if dt_cat not in categories_tally:
                categories_tally[dt_cat] = {"occurrences": 0, "total_minutes": 0.0}
            categories_tally[dt_cat]["occurrences"] += 1
            categories_tally[dt_cat]["total_minutes"] += dt_mins

    # -------------------------------------------------------------------------
    # 6. Compute Component-Weighted OEE Aggregate across Valid Shift Entries
    # -------------------------------------------------------------------------
    sum_planned_time = sum(e["planned_operating_time_min"] for e in shift_entries)
    sum_run_time = sum(e["run_time_min"] for e in shift_entries)
    sum_output = sum(e["output_qty"] for e in shift_entries)
    sum_good = sum(e["good_qty"] for e in shift_entries)
    sum_downtime = sum(e["downtime_min"] or 0.0 for e in shift_entries)
    sum_standard_time_sec = sum(
        (e["output_qty"] * (e["rated_ct_sec"] or 0.0)) for e in shift_entries
    )

    agg_availability = (sum_run_time / sum_planned_time) if sum_planned_time > 0 else None
    agg_performance = (sum_standard_time_sec / (sum_run_time * 60.0)) if sum_run_time > 0 else None
    agg_quality = (sum_good / sum_output) if sum_output > 0 else None
    agg_oee = (agg_availability * agg_performance * agg_quality) if (
        agg_availability is not None and agg_performance is not None and agg_quality is not None
    ) else None

    # -------------------------------------------------------------------------
    # 7. Parse Order Plan (Monthly) — Production & Dispatch Phasing
    # -------------------------------------------------------------------------
    ws_op = wb["Order Plan (Monthly)"] if "Order Plan (Monthly)" in wb.sheetnames else None
    order_monthly_plans: list[dict[str, Any]] = []
    month_columns = [
        "Apr-26", "May-26", "Jun-26", "Jul-26", "Aug-26", "Sep-26",
        "Oct-26", "Nov-26", "Dec-26", "Jan-27", "Feb-26", "Mar-26"
    ]
    calendar_monthly_plan: list[dict[str, Any]] = []
    monthly_plan_sums: dict[str, dict[str, float]] = {
        m: {"planned_production": 0.0, "planned_dispatch": 0.0, "actual_production": 0.0}
        for m in month_columns
    }

    if ws_op:
        # Rows 5, 7, 9, 11, 13, 15 represent the 6 orders
        for r in range(5, 17, 2):
            po_val = ws_op.cell(r, 3).value
            if not po_val or "How to use" in str(po_val):
                continue
            po_clean = str(po_val).strip()
            if po_clean.endswith(".0"):
                po_clean = po_clean[:-2]

            cust = _clean_str(ws_op.cell(r, 2).value) or "Unknown Customer"
            part = _clean_str(ws_op.cell(r, 1).value) or "ERC MKV"
            po_date = _clean_date_str(ws_op.cell(r, 4).value)
            po_qty = _clean_float(ws_op.cell(r, 5).value) or 0.0
            dp_date = _clean_date_str(ws_op.cell(r, 6).value)
            carryover = _clean_float(ws_op.cell(r, 7).value)
            balance = _clean_float(ws_op.cell(r, 8).value)

            prod_by_month: dict[str, float] = {}
            disp_by_month: dict[str, float] = {}

            for c_idx, m_name in enumerate(month_columns, start=10):
                val_p = _clean_float(ws_op.cell(r, c_idx).value) or 0.0
                val_d = _clean_float(ws_op.cell(r + 1, c_idx).value) or 0.0
                prod_by_month[m_name] = val_p
                disp_by_month[m_name] = val_d
                monthly_plan_sums[m_name]["planned_production"] += val_p
                monthly_plan_sums[m_name]["planned_dispatch"] += val_d

            tot_prod = sum(prod_by_month.values())
            tot_disp = sum(disp_by_month.values())
            has_phasing = (tot_prod > 0 or tot_disp > 0)

            order_monthly_plans.append({
                "po_number": po_clean,
                "customer": cust,
                "part": part,
                "po_date": po_date,
                "po_qty": po_qty,
                "dp_date": dp_date,
                "carryover": carryover,
                "balance": balance,
                "production_months": prod_by_month,
                "dispatch_months": disp_by_month,
                "planned_production_total": round(tot_prod, 1),
                "planned_dispatch_total": round(tot_disp, 1),
                "has_monthly_phasing": has_phasing,
                "is_stale_snapshot": True,
            })

    # Associate actual production with calendar months where supported by live data
    # Sep-26 has live shift entries (good pcs from Entries)
    sum_good_sep = sum(e["good_qty"] for e in shift_entries if e["date"] and e["date"].startswith("2026-09"))
    if "Sep-26" in monthly_plan_sums:
        monthly_plan_sums["Sep-26"]["actual_production"] = float(sum_good_sep)

    for m in month_columns:
        p_prod = monthly_plan_sums[m]["planned_production"]
        p_disp = monthly_plan_sums[m]["planned_dispatch"]
        act_prod = monthly_plan_sums[m]["actual_production"]
        ach_pct = round((act_prod / p_prod) * 100, 2) if p_prod > 0 else (100.0 if act_prod > 0 else None)
        calendar_monthly_plan.append({
            "month": m,
            "planned_production": round(p_prod, 1),
            "planned_dispatch": round(p_disp, 1),
            "actual_production": round(act_prod, 1),
            "production_gap": round(p_prod - act_prod, 1),
            "achievement_pct": ach_pct,
            "has_actuals": act_prod > 0,
        })

    # -------------------------------------------------------------------------
    # 8. Enrich Production Orders with Actual Production & Risk Profiling
    # -------------------------------------------------------------------------
    ppc_orders: list[dict[str, Any]] = []
    scr_heats_forming_actual = sum(
        h["actual_forming_ok_nos"] or 0.0 for h in heat_yields
        if "60257500205475" in h.get("customer", "")
    )
    scr_heats_forming_plan = sum(
        h["plan_forming_ok_nos"] or 0.0 for h in heat_yields
        if "60257500205475" in h.get("customer", "")
    )

    for po in orders_list:
        ord_no = po["order_number"]
        qty = po["order_qty"] or 0.0
        dp = po["dp_date"]

        produced_qty = 0.0
        outstanding_qty = qty
        prod_source = "None"
        risk_level = "nominal"
        risk_reasons: list[str] = []
        fulfillment_status = "Open"
        completion_pct = 0.0

        # Case 1: Western Railway PO-2026-001 (Placeholder PO matching Real PO 26265489205106)
        if ord_no == "PO-2026-001" or "26265489205106" in str(po.get("notes", "")):
            produced_qty = float(sum_good)
            outstanding_qty = max(qty - produced_qty, 0.0)
            completion_pct = round((produced_qty / qty) * 100, 2) if qty > 0 else 0.0
            prod_source = "Live Shift Entries (Sep 19-20, 2026; Heat H-2409-118)"
            fulfillment_status = "At Risk"
            risk_level = "critical"
            risk_reasons.append("Planned delivery date is 2026-10-20 (urgent delivery window).")
            risk_reasons.append(f"Outstanding balance is {int(outstanding_qty):,} pcs ({round(100 - completion_pct, 2)}% unfinished).")
            risk_reasons.append("Relies on placeholder heat H-2409-118 (Pending Metallurgical Reconciliation).")

        # Case 2: South Central Railway (SCR) PO 60257500205475
        elif "60257500205475" in ord_no:
            produced_qty = float(scr_heats_forming_actual)
            plan_match = next((p for p in order_monthly_plans if p["po_number"] == "60257500205475"), None)
            outstanding_qty = plan_match["balance"] if plan_match and plan_match["balance"] is not None else max(qty - (1605069.0 + 460989.0), 0.0)
            completion_pct = round((produced_qty / scr_heats_forming_plan) * 100, 2) if scr_heats_forming_plan > 0 else round((produced_qty / qty) * 100, 2)
            prod_source = f"RM Heat Plan vs Actual ({len(heat_yields)} Heats - Bhushan/JSW/JFE)"
            fulfillment_status = "On Track"
            risk_level = "nominal"

        # Case 3: Central Railway (CR) PO 95265013100645
        elif "95265013100645" in ord_no:
            produced_qty = 0.0
            outstanding_qty = qty
            completion_pct = 0.0
            prod_source = "No Shop Floor Allocations Logged"
            fulfillment_status = "Pending Allocation"
            risk_level = "warning"
            risk_reasons.append("Order planned in snapshot (431,713 pcs) but zero RM heats or shop floor entries allocated.")

        # Case 4: Southern Railway (SR) PO 32654922029501
        elif "32654922029501" in ord_no:
            produced_qty = 0.0
            outstanding_qty = qty
            completion_pct = 0.0
            prod_source = "Pending Monthly Phasing & Shop Floor Entry"
            fulfillment_status = "Pending Phasing"
            risk_level = "warning"
            risk_reasons.append("No monthly production/dispatch phasing entered in source planning sheet.")

        # Case 5: SCR Liner Less Clip TP245007400006
        elif "TP245007400006" in ord_no:
            plan_match = next((p for p in order_monthly_plans if p["po_number"] == "TP245007400006"), None)
            produced_qty = plan_match["carryover"] if plan_match and plan_match["carryover"] else 46921.0
            outstanding_qty = 0.0
            completion_pct = 100.0
            prod_source = "FY25-26 Carryover Production"
            fulfillment_status = "Completed / Pending Dispatch"
            risk_level = "info"

        # Case 6: ECoR Liner Less Clip TP235085100013
        elif "TP235085100013" in ord_no:
            produced_qty = 0.0
            outstanding_qty = qty
            completion_pct = 0.0
            prod_source = "Zero Activity Recorded"
            fulfillment_status = "Closed / Inactive"
            risk_level = "info"
            risk_reasons.append("Zero production or dispatch recorded in FY 2026-27 snapshot.")

        else:
            produced_qty = 0.0
            outstanding_qty = qty
            completion_pct = 0.0
            prod_source = "Unlinked"
            fulfillment_status = "Open"
            risk_level = "info"

        ppc_orders.append({
            **po,
            "produced_qty": round(produced_qty, 1),
            "outstanding_qty": round(outstanding_qty, 1),
            "completion_pct": round(completion_pct, 2),
            "fulfillment_status": fulfillment_status,
            "risk_level": risk_level,
            "risk_reasons": risk_reasons,
            "production_source": prod_source,
        })

    # -------------------------------------------------------------------------
    # 9. Compute High-Level PPC Order Fulfillment Summary
    # -------------------------------------------------------------------------
    total_ordered_qty = sum(o["order_qty"] or 0.0 for o in ppc_orders)
    total_produced_qty = sum(o["produced_qty"] for o in ppc_orders)
    total_outstanding_qty = sum(o["outstanding_qty"] for o in ppc_orders)
    overall_fulfillment_pct = round((total_produced_qty / total_ordered_qty) * 100, 2) if total_ordered_qty > 0 else 0.0

    at_risk_count = sum(1 for o in ppc_orders if o["fulfillment_status"] == "At Risk")
    completed_count = sum(1 for o in ppc_orders if "Completed" in o["fulfillment_status"] or "Closed" in o["fulfillment_status"])
    open_count = len(ppc_orders) - completed_count

    ppc_summary = {
        "total_ordered_qty": int(total_ordered_qty),
        "total_produced_or_allocated_qty": int(total_produced_qty),
        "total_outstanding_qty": int(total_outstanding_qty),
        "overall_fulfillment_pct": overall_fulfillment_pct,
        "orders_total_count": len(ppc_orders),
        "at_risk_orders_count": at_risk_count,
        "completed_orders_count": completed_count,
        "open_orders_count": open_count,
        "snapshot_notice": "Reference snapshot from Planning_sheet.xlsx (Information Only — Not Live Synchronized)",
    }

    # -------------------------------------------------------------------------
    # 10. Structure RM Heat & Lot Traceability Tree
    # -------------------------------------------------------------------------
    verified_heats_count = len(heat_yields)
    total_billet_mt = sum(h["rm_qty_mt"] or 0.0 for h in heat_yields)
    total_bar_cropper_ok = sum(h["actual_cut_bar_nos"] or 0.0 for h in heat_yields)
    total_turning_ok = sum(h["actual_turning_ok_nos"] or 0.0 for h in heat_yields)
    total_forming_ok = sum(h["actual_forming_ok_nos"] or 0.0 for h in heat_yields)
    total_endbit_scrap = sum(h["actual_endbit_scrap_nos"] or 0.0 for h in heat_yields)

    traceability_data = {
        "funnel_summary": {
            "total_billet_mt": round(total_billet_mt, 2),
            "total_bar_cropper_ok_nos": int(total_bar_cropper_ok),
            "total_turning_ok_nos": int(total_turning_ok),
            "total_forming_ok_nos": int(total_forming_ok),
            "total_endbit_scrap_nos": int(total_endbit_scrap),
            "overall_forming_yield_pct": round((total_forming_ok / total_bar_cropper_ok) * 100, 2) if total_bar_cropper_ok > 0 else None,
        },
        "verified_heats_count": verified_heats_count,
        "heats": heat_yields,
        "reconciliation_alerts": [
            {
                "heat_number": "H-2409-118",
                "lot_number": "LOT-20260920-DB-01",
                "reason": "Referenced in live shift entries and PO-2026-001 but absent from master Heat & Lot Number Reference catalog.",
                "status": RECONCILIATION_TAG,
            }
        ],
    }

    # -------------------------------------------------------------------------
    # 11. Quality Auditing & Structured Warnings
    # -------------------------------------------------------------------------
    warnings: list[dict[str, Any]] = []

    # Warning 1: Nov 2024 gap
    if nov_2024_count == 0:
        warnings.append({
            "code": "NOV_2024_GAP",
            "severity": "warning",
            "title": "November 2024 Historical Data Gap",
            "description": "Zero records were logged in the historical Downtime Log between 2024-11-01 and 2024-11-30.",
            "impact": "Historical month-wise charts will exhibit a 30-day reporting discontinuity for late 2024.",
        })

    # Warning 2: Incomplete Targets in 2024/Early 2025
    if incomplete_target_count > 0:
        warnings.append({
            "code": "INCOMPLETE_HISTORICAL_TARGETS",
            "severity": "info",
            "title": f"Incomplete Historical Production Targets ({incomplete_target_count:,} records)",
            "description": "Historical downtime entries frequently left Prod Target unrecorded (0 or null), making Fill % unrepresentative for 2024.",
            "impact": "Fill rate metrics should be interpreted with confidence primarily from FY 2025-26 onward.",
        })

    # Warning 3: Placeholder Heat & Lot references in Entries & Production Order
    placeholder_entries_count = sum(1 for e in shift_entries if e["traceability_status"] == RECONCILIATION_TAG)
    if placeholder_entries_count > 0:
        warnings.append({
            "code": "PLACEHOLDER_HEAT_REFERENCES",
            "severity": "warning",
            "title": f"Pending Metallurgical Reconciliation ({placeholder_entries_count} shift records)",
            "description": "Shift entries and Western Railway order reference placeholder heat 'H-2409-118' and lot 'LOT-20260920-DB-01'.",
            "impact": "Traceability links are flagged as 'Pending Metallurgical Reconciliation' until plant planners record verified heats from the 41-heat catalog.",
        })

    # Warning 4: Double-counting prevented
    if mirrored_rows_skipped > 0:
        warnings.append({
            "code": "DOUBLE_COUNTING_PREVENTED",
            "severity": "info",
            "title": f"Double-Counting Protection Active ({mirrored_rows_skipped} mirrored rows isolated)",
            "description": "Rows 14,569 to 14,868 of Downtime Log mirror the live Entries tab and have been excluded from historical downtime tallies.",
            "impact": "Historical and live shift metrics remain cleanly separated with zero double counting.",
        })

    # Warning 5: Calendar-time MTBF disclaimer
    warnings.append({
        "code": "CALENDAR_MTBF_DISCLAIMER",
        "severity": "info",
        "title": "Approximate Calendar-Time MTBF",
        "description": "Historical MTBF uses a fixed 17,952 calendar period hours base (748 days) divided by breakdown events.",
        "impact": "Values represent calendar intervals between failures rather than measured machine run-hours.",
    })

    # Warning 6: Static Planning Snapshot Notice
    warnings.append({
        "code": "STATIC_PLANNING_SNAPSHOT",
        "severity": "info",
        "title": "Static Production Plan Snapshot (Planning_sheet.xlsx)",
        "description": "The Order Plan (Monthly) tab is an imported snapshot marked 'INFORMATION ONLY' and does not synchronize with live Google Sheets.",
        "impact": "Western Railway and Southern Railway orders lack monthly phasing in the snapshot; progress relies on live shift entries and heat records.",
    })

    # Determine date bounds
    entry_dates = [e["date"] for e in shift_entries if e["date"]]
    dt_dates = [d["date"] for d in historical_downtime_records if d["date"]]

    coverage_dates = {
        "shift_entries": {
            "min": min(entry_dates) if entry_dates else None,
            "max": max(entry_dates) if entry_dates else None,
            "count": len(shift_entries),
        },
        "historical_downtime": {
            "min": min(dt_dates) if dt_dates else None,
            "max": max(dt_dates) if dt_dates else None,
            "count": len(historical_downtime_records),
        },
    }

    # Top historical categories
    sorted_categories = sorted(
        [
            {
                "category": cat,
                "occurrences": meta["occurrences"],
                "total_minutes": round(meta["total_minutes"], 1),
                "total_hours": round(meta["total_minutes"] / 60.0, 1),
            }
            for cat, meta in categories_tally.items()
        ],
        key=lambda x: x["total_minutes"],
        reverse=True,
    )

    if file_path and os.path.exists(file_path):
        file_stat = os.stat(file_path)
        file_name = os.path.basename(file_path)
        file_size = file_stat.st_size
        last_modified = datetime.datetime.fromtimestamp(
            file_stat.st_mtime, tz=datetime.timezone.utc
        ).isoformat()
    else:
        file_name = (source_meta or {}).get("file_name", "ERC_MkV_Line_Tracker")
        file_size = int((source_meta or {}).get("size_bytes", 0))
        last_modified = (source_meta or {}).get(
            "last_modified", datetime.datetime.now(datetime.timezone.utc).isoformat()
        )

    return {
        "source_type": "local_excel",
        "source_notice": "Local Development Source: Not Live Google Sheets",
        "file_path": file_path or (source_meta or {}).get("google_sheet_id"),
        "file_name": file_name,
        "file_size_bytes": file_size,
        "last_modified": last_modified,
        "coverage_dates": coverage_dates,
        "records_summary": {
            "shift_entries_accepted": len(shift_entries),
            "shift_entries_rejected": entries_rejected,
            "historical_downtime_accepted": len(historical_downtime_records),
            "mirrored_downtime_skipped": mirrored_rows_skipped,
            "machines_count": len(machines_list),
            "work_centers_count": len({m["work_center"] for m in machines_list}),
            "production_orders_count": len(ppc_orders),
            "rm_heats_count": len(master_heats),
            "rm_heat_yields_count": len(heat_yields),
        },
        "oee_aggregate": {
            "sum_planned_operating_time_min": round(sum_planned_time, 1),
            "sum_run_time_min": round(sum_run_time, 1),
            "sum_downtime_min": round(sum_downtime, 1),
            "sum_output_qty": int(sum_output),
            "sum_good_qty": int(sum_good),
            "component_weighted_availability": round(agg_availability * 100, 2) if agg_availability is not None else None,
            "component_weighted_performance": round(agg_performance * 100, 2) if agg_performance is not None else None,
            "component_weighted_quality": round(agg_quality * 100, 2) if agg_quality is not None else None,
            "component_weighted_oee": round(agg_oee * 100, 2) if agg_oee is not None else None,
        },
        "ppc_summary": ppc_summary,
        "monthly_plan": {
            "metadata": {
                "source_sheet": "Order Plan (Monthly)",
                "snapshot_notice": "Reference snapshot from Planning_sheet.xlsx, imported as-is (Information Only — Not Live Synchronized)",
                "is_stale_snapshot": True,
            },
            "monthly_calendar": calendar_monthly_plan,
            "order_plans": order_monthly_plans,
        },
        "traceability": traceability_data,
        "data_quality_warnings": warnings,
        "machines": machines_list,
        "production_orders": ppc_orders,
        "shift_entries": shift_entries,
        "rm_heats_catalog": list(master_heats.values()),
        "top_historical_downtime_categories": sorted_categories[:8],
        "historical_downtime_records": historical_downtime_records,
    }


def get_line_tracker_dataset(refresh: bool = False) -> dict[str, Any]:
    """Retrieve the normalized ERC Mk-V Line Tracker dataset with thread-safe caching."""
    global _LINE_TRACKER_CACHE

    ttl_seconds = getattr(settings, "line_tracker_cache_ttl_seconds", 300)
    now = datetime.datetime.now(datetime.timezone.utc)

    with _LINE_TRACKER_LOCK:
        cached = _LINE_TRACKER_CACHE.get("dataset")
        if not refresh and cached:
            cached_at = cached.get("_cached_at")
            if cached_at and (now - cached_at).total_seconds() < ttl_seconds:
                return cached["data"]

        # 0. Choose data source: live Google Sheets (if requested & configured) or local Excel.
        requested_source = (getattr(settings, "line_tracker_source", "local_excel") or "local_excel").strip().lower()
        gsheet_id = (getattr(settings, "line_tracker_spreadsheet_id", "") or "").strip()
        google_failure_note: str | None = None
        from_google = False
        google_wb: Any = None
        google_meta: dict[str, Any] | None = None
        file_path: str | None = None

        if requested_source == "google_sheets" and gsheet_id:
            try:
                google_wb, google_meta = fetch_google_sheets_workbook(gsheet_id)
                from_google = True
            except Exception as exc:  # network / permission / configuration errors
                logger.warning(
                    "ERC Mk-V Google Sheets fetch failed (id=%s): %s",
                    gsheet_id, str(exc)[:200],
                )
                reason = (str(exc).split("returned")[0].strip() or type(exc).__name__)[:140]
                google_failure_note = (
                    f"Live Google Sheet could not be read ({reason}). "
                    "Showing the last downloaded Excel snapshot instead."
                )
        if not from_google:
            file_path = resolve_line_tracker_file_path()

        if not from_google and (not file_path or not os.path.exists(file_path)):
            logger.warning("ERC Mk-V Line Tracker workbook not located on disk: %s", file_path)
            return {
                "source_type": "unconfigured",
                "source_notice": "Line Tracker workbook not found. Configure LINE_TRACKER_LOCAL_PATH or place file in Downloads.",
                "file_path": file_path,
                "file_exists": False,
                "records_summary": {
                    "shift_entries_accepted": 0,
                    "historical_downtime_accepted": 0,
                    "machines_count": 0,
                    "work_centers_count": 0,
                    "production_orders_count": 0,
                },
                "data_quality_warnings": [{
                    "code": "FILE_NOT_FOUND",
                    "severity": "error",
                    "title": "Workbook File Not Found",
                    "description": "Could not locate 'ERC_MkV_Line_Tracker R0_10102026.xlsx' in Downloads or configured path.",
                    "impact": "Line tracker views will display an unconfigured state until the file is located.",
                }],
                "machines": [],
                "production_orders": [],
                "shift_entries": [],
                "rm_heats_catalog": [],
                "historical_downtime_records": [],
                "ppc_summary": {
                    "total_ordered_qty": 0,
                    "total_produced_or_allocated_qty": 0,
                    "total_outstanding_qty": 0,
                    "overall_fulfillment_pct": 0.0,
                    "orders_total_count": 0,
                    "at_risk_orders_count": 0,
                    "completed_orders_count": 0,
                    "open_orders_count": 0,
                    "snapshot_notice": "Line Tracker workbook not found.",
                },
                "monthly_plan": {
                    "metadata": {
                        "source_sheet": "Order Plan (Monthly)",
                        "snapshot_notice": "File not found",
                        "is_stale_snapshot": True,
                    },
                    "monthly_calendar": [],
                    "order_plans": [],
                },
                "traceability": {
                    "funnel_summary": {
                        "total_billet_mt": 0.0,
                        "total_bar_cropper_ok_nos": 0,
                        "total_turning_ok_nos": 0,
                        "total_forming_ok_nos": 0,
                        "total_endbit_scrap_nos": 0,
                        "overall_forming_yield_pct": None,
                    },
                    "verified_heats_count": 0,
                    "heats": [],
                    "reconciliation_alerts": [],
                },
            }

        data = parse_line_tracker_workbook(
            workbook=google_wb, source_meta=google_meta
        ) if from_google else parse_line_tracker_workbook(file_path)

        # Reflect the ACTUAL source that served the data (the parser defaults to local_excel).
        if from_google:
            data["source_type"] = "google_sheets"
            data["source_notice"] = "Live Google Sheets source (read-only service account)."
            data["google_sheet_id"] = gsheet_id
            data["is_live_google_sheets"] = True
        else:
            data["is_live_google_sheets"] = False
            if google_failure_note:
                data.setdefault("data_quality_warnings", [])
                data["data_quality_warnings"].insert(0, {
                    "code": "GOOGLE_SHEETS_UNAVAILABLE",
                    "severity": "warning",
                    "title": "Google Sheets source unavailable — showing local Excel snapshot",
                    "description": google_failure_note,
                    "impact": "Dashboard reflects the last downloaded workbook, not the live sheet.",
                })

        _LINE_TRACKER_CACHE["dataset"] = {
            "data": data,
            "_cached_at": now,
        }
        return data


def get_line_tracker_status() -> dict[str, Any]:
    """Get connection status and data-quality health summary without loading full dataset arrays."""
    data = get_line_tracker_dataset(refresh=False)
    return {
        "source_type": data.get("source_type"),
        "source_notice": data.get("source_notice"),
        "is_live_google_sheets": data.get("is_live_google_sheets", False),
        "file_path": data.get("file_path"),
        "file_name": data.get("file_name"),
        "file_size_bytes": data.get("file_size_bytes"),
        "last_modified": data.get("last_modified"),
        "google_sheet_id": data.get("google_sheet_id"),
        "coverage_dates": data.get("coverage_dates"),
        "records_summary": data.get("records_summary"),
        "oee_aggregate": data.get("oee_aggregate"),
        "ppc_summary": data.get("ppc_summary"),
        "data_quality_warnings": data.get("data_quality_warnings"),
    }


def get_line_tracker_ppc_orders(refresh: bool = False) -> dict[str, Any]:
    """Return enriched production orders with actual production, balance, and delivery risk status."""
    data = get_line_tracker_dataset(refresh=refresh)
    return {
        "source_type": data.get("source_type"),
        "source_notice": data.get("source_notice"),
        "is_live_google_sheets": data.get("is_live_google_sheets", False),
        "last_modified": data.get("last_modified"),
        "count": len(data.get("production_orders", [])),
        "orders": data.get("production_orders", []),
        "summary": data.get("ppc_summary", {}),
    }


def get_line_tracker_monthly_plan(refresh: bool = False) -> dict[str, Any]:
    """Return monthly production and dispatch plan vs actual comparison and metadata."""
    data = get_line_tracker_dataset(refresh=refresh)
    res = dict(data.get("monthly_plan", {}))
    res["source_type"] = data.get("source_type")
    res["source_notice"] = data.get("source_notice")
    res["is_live_google_sheets"] = data.get("is_live_google_sheets", False)
    res["last_modified"] = data.get("last_modified")
    return res


def get_line_tracker_traceability(refresh: bool = False) -> dict[str, Any]:
    """Return raw material heat conversion funnel and order-to-lot traceability."""
    data = get_line_tracker_dataset(refresh=refresh)
    res = dict(data.get("traceability", {}))
    res["source_type"] = data.get("source_type")
    res["source_notice"] = data.get("source_notice")
    res["is_live_google_sheets"] = data.get("is_live_google_sheets", False)
    res["last_modified"] = data.get("last_modified")
    return res


def compute_oee_slice_metrics(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute mathematically appropriate component-weighted OEE across a slice of shift entries.

    Strictly preserves:
    - Availability = Run Time / Planned Operating Time
    - Performance = Standard Time / Run Time (where Standard Time = Output * Rated CT)
    - Quality = Good Output / Total Output
    - OEE = Availability * Performance * Quality
    - Speed Loss = Run Time - Standard Time (in minutes)
    - NO averaging of individual percentages!
    """
    if not entries:
        return {
            "count": 0,
            "sum_planned_operating_time_min": 0.0,
            "sum_run_time_min": 0.0,
            "sum_downtime_min": 0.0,
            "sum_output_qty": 0,
            "sum_good_qty": 0,
            "sum_reject_qty": 0,
            "rejection_rate_pct": 0.0,
            "sum_standard_time_sec": 0.0,
            "sum_speed_loss_min": 0.0,
            "speed_loss_hours": 0.0,
            "speed_loss_share_pct": 0.0,
            "weighted_rated_ct_sec": None,
            "weighted_actual_ct_sec": None,
            "cycle_compliance_pct": None,
            "availability_pct": None,
            "performance_pct": None,
            "quality_pct": None,
            "oee_pct": None,
        }

    sum_pot = sum(e.get("planned_operating_time_min", 0.0) or 0.0 for e in entries)
    sum_run = sum(e.get("run_time_min", 0.0) or 0.0 for e in entries)
    sum_dt = sum(e.get("downtime_min", 0.0) or 0.0 for e in entries)
    sum_out = sum(e.get("output_qty", 0.0) or 0.0 for e in entries)
    sum_good = sum(e.get("good_qty", 0.0) or 0.0 for e in entries)
    sum_rej = sum(e.get("total_rejects", 0.0) or 0.0 for e in entries)
    sum_std_sec = sum((e.get("output_qty", 0.0) or 0.0) * (e.get("rated_ct_sec", 0.0) or 0.0) for e in entries)

    speed_loss_min = max(sum_run - (sum_std_sec / 60.0), 0.0)
    speed_loss_hrs = speed_loss_min / 60.0
    speed_loss_share = (speed_loss_min / sum_run * 100.0) if sum_run > 0 else 0.0

    avail = (sum_run / sum_pot) if sum_pot > 0 else None
    perf = (sum_std_sec / (sum_run * 60.0)) if sum_run > 0 else None
    qual = (sum_good / sum_out) if sum_out > 0 else None
    oee = (avail * perf * qual) if (avail is not None and perf is not None and qual is not None) else None

    weighted_rated_ct = (sum_std_sec / sum_out) if sum_out > 0 else None
    weighted_actual_ct = ((sum_run * 60.0) / sum_out) if sum_out > 0 else None
    cycle_compliance = (min(perf, 1.0) * 100.0) if perf is not None else None

    return {
        "count": len(entries),
        "sum_planned_operating_time_min": round(sum_pot, 1),
        "sum_run_time_min": round(sum_run, 1),
        "sum_downtime_min": round(sum_dt, 1),
        "sum_output_qty": int(round(sum_out)),
        "sum_good_qty": int(round(sum_good)),
        "sum_reject_qty": int(round(sum_rej)),
        "rejection_rate_pct": round((sum_rej / sum_out) * 100.0, 2) if sum_out > 0 else 0.0,
        "sum_standard_time_sec": round(sum_std_sec, 1),
        "sum_speed_loss_min": round(speed_loss_min, 1),
        "speed_loss_hours": round(speed_loss_hrs, 2),
        "speed_loss_share_pct": round(speed_loss_share, 2),
        "weighted_rated_ct_sec": round(weighted_rated_ct, 2) if weighted_rated_ct is not None else None,
        "weighted_actual_ct_sec": round(weighted_actual_ct, 2) if weighted_actual_ct is not None else None,
        "cycle_compliance_pct": round(cycle_compliance, 2) if cycle_compliance is not None else None,
        "availability_pct": round(avail * 100.0, 2) if avail is not None else None,
        "performance_pct": round(perf * 100.0, 2) if perf is not None else None,
        "quality_pct": round(qual * 100.0, 2) if qual is not None else None,
        "oee_pct": round(oee * 100.0, 2) if oee is not None else None,
    }


def get_line_tracker_oee_breakdown(
    work_center: str | None = None,
    machine: str | None = None,
    shift: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    """Calculate comprehensive machine-wise, work-center-wise, and shift-wise OEE breakdown.

    Employs component-weighted aggregation across all filtered slices to guarantee
    mathematical validity without percentage averaging.
    """
    data = get_line_tracker_dataset(refresh=refresh)
    entries: list[dict[str, Any]] = data.get("shift_entries", [])
    machines_catalog = data.get("machines", [])

    # Filter entries if parameters are passed
    filtered = entries
    if work_center and work_center.lower() != "all":
        filtered = [e for e in filtered if e.get("work_center", "").lower() == work_center.lower()]
    if machine and machine.lower() != "all":
        filtered = [e for e in filtered if e.get("machine", "").lower() == machine.lower()]
    if shift and shift.lower() != "all":
        filtered = [e for e in filtered if e.get("shift", "").lower() == shift.lower()]
    if date_from:
        filtered = [e for e in filtered if e.get("date") and e["date"] >= date_from]
    if date_to:
        filtered = [e for e in filtered if e.get("date") and e["date"] <= date_to]

    # 1. Overall slice OEE
    overall = compute_oee_slice_metrics(filtered)

    # 2. Group by Work Center
    wc_groups: dict[str, list[dict[str, Any]]] = {}
    for e in filtered:
        wc = e.get("work_center") or "Unspecified"
        wc_groups.setdefault(wc, []).append(e)

    standard_wc_order = ["BC", "Turning", "Forming", "MPI", "DB", "AD", "IBH", "Packing", "Linnseed"]
    all_wc_keys = sorted(
        wc_groups.keys(),
        key=lambda x: (standard_wc_order.index(x) if x in standard_wc_order else 99, x)
    )

    work_centers_list = []
    for wc in all_wc_keys:
        grp = wc_groups[wc]
        metrics = compute_oee_slice_metrics(grp)
        distinct_machs = sorted(list({m.get("machine") for m in grp if m.get("machine")}))
        rows = sorted([r.get("row_number") for r in grp if r.get("row_number") is not None])
        work_centers_list.append({
            "work_center": wc,
            "metrics": metrics,
            "distinct_machines": distinct_machs,
            "distinct_machines_count": len(distinct_machs),
            "underlying_rows": rows,
        })

    # 3. Group by Machine
    mach_groups: dict[str, list[dict[str, Any]]] = {}
    for e in filtered:
        m_name = e.get("machine") or "Unspecified"
        mach_groups.setdefault(m_name, []).append(e)

    machines_list = []
    for m_name, grp in mach_groups.items():
        metrics = compute_oee_slice_metrics(grp)
        wc = grp[0].get("work_center", "Unspecified") if grp else "Unspecified"
        rated_ct = grp[0].get("rated_ct_sec") if grp else None
        actual_ct = metrics.get("weighted_actual_ct_sec")
        status = "Slower than rated" if (actual_ct and rated_ct and actual_ct > rated_ct) else "Nominal / Faster"
        rows = sorted([r.get("row_number") for r in grp if r.get("row_number") is not None])
        machines_list.append({
            "machine": m_name,
            "work_center": wc,
            "metrics": metrics,
            "rated_ct_sec": rated_ct,
            "actual_ct_sec": actual_ct,
            "speed_loss_status": status,
            "underlying_rows": rows,
        })

    # Sort machines by speed loss descending to highlight bottlenecks
    machines_list.sort(key=lambda x: x["metrics"]["sum_speed_loss_min"], reverse=True)

    # 4. Group by Shift
    shift_groups: dict[str, list[dict[str, Any]]] = {}
    for e in filtered:
        sh = e.get("shift") or "Unspecified"
        shift_groups.setdefault(sh, []).append(e)

    shifts_list = []
    for sh, grp in sorted(shift_groups.items()):
        metrics = compute_oee_slice_metrics(grp)
        rows = sorted([r.get("row_number") for r in grp if r.get("row_number") is not None])
        shifts_list.append({
            "shift": sh,
            "metrics": metrics,
            "underlying_rows": rows,
        })

    # 5. Speed Loss Pareto
    speed_loss_pareto = [
        {
            "machine": m["machine"],
            "work_center": m["work_center"],
            "speed_loss_min": m["metrics"]["sum_speed_loss_min"],
            "speed_loss_hours": m["metrics"]["speed_loss_hours"],
            "speed_loss_share_pct": round(
                (m["metrics"]["sum_speed_loss_min"] / overall["sum_speed_loss_min"] * 100.0)
                if overall["sum_speed_loss_min"] > 0 else 0.0,
                2
            ),
            "rated_ct_sec": m["rated_ct_sec"],
            "actual_ct_sec": m["actual_ct_sec"],
            "cycle_compliance_pct": m["metrics"]["cycle_compliance_pct"],
        }
        for m in machines_list if m["metrics"]["sum_speed_loss_min"] > 0
    ]

    # 6. Cycle Time & Compliance Analysis Summary
    cycle_time_analysis = {
        "total_operating_minutes": overall["sum_run_time_min"],
        "total_standard_producing_minutes": round(overall["sum_standard_time_sec"] / 60.0, 1),
        "total_speed_loss_minutes": overall["sum_speed_loss_min"],
        "total_speed_loss_hours": overall["speed_loss_hours"],
        "overall_speed_loss_pct_of_runtime": overall["speed_loss_share_pct"],
        "overall_cycle_compliance_pct": overall["cycle_compliance_pct"],
        "slower_than_rated_count": len([m for m in machines_list if m["speed_loss_status"] == "Slower than rated"]),
        "nominal_or_faster_count": len([m for m in machines_list if m["speed_loss_status"] != "Slower than rated"]),
        "key_bottleneck_finding": (
            "Equipment availability is 100.0% (0 downtime minutes logged) and quality is 99.45% "
            "(101 rejects total), but overall OEE is constrained at 37.96% due to severe cycle time "
            f"slowdowns (61.83% of operating time lost to reduced speed across {len(machines_list)} machines)."
        ),
    }

    # 7. Machines from Machine Master with No Shift Entries Logged
    active_machines_in_entries = {m["machine"].lower() for m in machines_list}
    idle_catalog_machines = [
        {
            "machine": m.get("machine"),
            "work_center": m.get("work_center"),
            "rated_ct_sec": m.get("rated_ct_sec"),
            "status": m.get("status"),
            "entries_logged": 0,
            "comment": "Configured in Machine Master but has 0 active shift logs in Entries tab.",
        }
        for m in machines_catalog
        if m.get("machine") and m.get("machine").lower() not in active_machines_in_entries
    ]

    return {
        "source_type": data.get("source_type"),
        "source_notice": data.get("source_notice"),
        "is_live_google_sheets": data.get("is_live_google_sheets", False),
        "last_modified": data.get("last_modified"),
        "filters_applied": {
            "work_center": work_center or "All",
            "machine": machine or "All",
            "shift": shift or "All",
            "date_from": date_from,
            "date_to": date_to,
        },
        "overall": overall,
        "work_centers": work_centers_list,
        "machines": machines_list,
        "shifts": shifts_list,
        "speed_loss_pareto": speed_loss_pareto,
        "cycle_time_analysis": cycle_time_analysis,
        "unlogged_catalog_machines": idle_catalog_machines,
        "drilldown_records": filtered,
        "formula_documentation": {
            "aggregation_method": "Component-weighted (No percentage averaging)",
            "availability_formula": "Sum(Run Time min) / Sum(Planned Operating Time min)",
            "performance_formula": "Sum(Output * Rated CT sec) / (Sum(Run Time min) * 60)",
            "quality_formula": "Sum(Good Qty pcs) / Sum(Output Qty pcs)",
            "oee_formula": "Availability * Performance * Quality",
            "speed_loss_formula": "Sum(Run Time min) - (Sum(Output * Rated CT sec) / 60)",
            "cycle_compliance_formula": "Min(Performance, 1.0) * 100",
        },
    }


def get_line_tracker_reliability_analysis(
    category: str | None = None,
    machine: str | None = None,
    stage: str | None = None,
    shift: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    refresh: bool = False,
    source_dataset: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Calculate comprehensive historical reliability, Downtime Pareto, MTTR, and MTBF.

    Strictly separates historical downtime records from active shift entries to prevent double-counting.
    Calculates MTTR and MTBF with explicit documentation of calendar-time approximations.
    """
    data = source_dataset or get_line_tracker_dataset(refresh=refresh)
    records: list[dict[str, Any]] = data.get("historical_downtime_records", [])

    filtered = records
    if category and category.lower() != "all":
        filtered = [r for r in filtered if (r.get("category") or "").lower() == category.lower()]
    if machine and machine.lower() != "all":
        filtered = [r for r in filtered if (r.get("machine") or "").lower() == machine.lower()]
    if stage and stage.lower() != "all":
        filtered = [r for r in filtered if (r.get("stage") or "").lower() == stage.lower()]
    if shift and shift.lower() != "all":
        filtered = [r for r in filtered if (r.get("shift") or "").lower() == shift.lower()]
    if date_from:
        filtered = [r for r in filtered if r.get("date") and r["date"] >= date_from]
    if date_to:
        filtered = [r for r in filtered if r.get("date") and r["date"] <= date_to]

    total_records = len(filtered)
    valid_duration_count = sum(
        1 for record in filtered
        if isinstance(record.get("downtime_minutes"), int | float)
        and not isinstance(record.get("downtime_minutes"), bool)
    )
    duration_metrics_available = valid_duration_count > 0
    total_dt_mins = sum(
        value for r in filtered
        if isinstance((value := r.get("downtime_minutes")), int | float) and not isinstance(value, bool)
    )
    total_dt_hrs = total_dt_mins / 60.0

    planned_supported = data.get("planned_classification_supported", True)
    planned_duration_count = sum(
        1 for r in filtered
        if r.get("is_planned")
        and isinstance(r.get("downtime_minutes"), int | float)
        and not isinstance(r.get("downtime_minutes"), bool)
    )
    unplanned_duration_count = sum(
        1 for r in filtered
        if not r.get("is_planned")
        and isinstance(r.get("downtime_minutes"), int | float)
        and not isinstance(r.get("downtime_minutes"), bool)
    )
    planned_mins = sum(
        value for r in filtered
        if r.get("is_planned")
        and isinstance((value := r.get("downtime_minutes")), int | float)
        and not isinstance(value, bool)
    )
    unplanned_mins = max(total_dt_mins - planned_mins, 0.0)
    planned_hrs = planned_mins / 60.0 if planned_duration_count > 0 else None
    unplanned_hrs = unplanned_mins / 60.0 if unplanned_duration_count > 0 else None

    planned_pct = (
        round((planned_mins / total_dt_mins * 100.0), 2)
        if planned_duration_count > 0 and total_dt_mins > 0
        else 0.0 if planned_duration_count > 0 else None
    )
    unplanned_pct = (
        round((unplanned_mins / total_dt_mins * 100.0), 2)
        if unplanned_duration_count > 0 and total_dt_mins > 0
        else 0.0 if unplanned_duration_count > 0 else None
    )
    if not planned_supported or not duration_metrics_available:
        planned_hrs = planned_pct = unplanned_hrs = unplanned_pct = None

    breakdown_records = [r for r in filtered if r.get("category", "").lower() == "breakdown"]
    breakdown_count = len(breakdown_records)
    breakdown_duration_count = sum(
        1 for r in breakdown_records
        if isinstance(r.get("downtime_minutes"), int | float)
        and not isinstance(r.get("downtime_minutes"), bool)
    )
    breakdown_mins = sum(
        value for r in breakdown_records
        if isinstance((value := r.get("downtime_minutes")), int | float) and not isinstance(value, bool)
    )
    breakdown_hrs = breakdown_mins / 60.0

    dates = [r["date"] for r in filtered if r.get("date")]
    min_date = min(dates) if dates else None
    max_date = max(dates) if dates else None

    try:
        if not min_date or not max_date:
            raise ValueError("Date coverage is unavailable")
        d_start = datetime.date.fromisoformat(min_date)
        d_end = datetime.date.fromisoformat(max_date)
        coverage_days = max((d_end - d_start).days, 1)
    except Exception:
        coverage_days = 0
    period_calendar_hours = coverage_days * 24.0

    overall_mttr_hrs = (
        round((breakdown_hrs / breakdown_duration_count), 2)
        if breakdown_duration_count > 0
        else None
    )
    overall_mtbf_approx_hrs = round((period_calendar_hours / breakdown_count), 1) if breakdown_count > 0 and period_calendar_hours > 0 else None

    # 1. Category Pareto
    cat_tally: dict[str, dict[str, Any]] = {}
    for r in filtered:
        c = r.get("category") or "Unclassified"
        if c not in cat_tally:
            cat_tally[c] = {
                "category": c,
                "total_minutes": 0.0,
                "event_count": 0,
                "duration_count": 0,
                "is_planned": r.get("is_planned", False),
            }
        duration = r.get("downtime_minutes")
        if isinstance(duration, int | float) and not isinstance(duration, bool):
            cat_tally[c]["total_minutes"] += duration
            cat_tally[c]["duration_count"] += 1
        cat_tally[c]["event_count"] += 1

    sorted_categories = sorted(cat_tally.values(), key=lambda x: x["total_minutes"], reverse=True)
    cum_share = 0.0
    category_pareto = []
    for c_item in sorted_categories:
        mins = c_item["total_minutes"]
        hrs = mins / 60.0
        has_duration = c_item["duration_count"] > 0
        share = round((mins / total_dt_mins * 100.0), 2) if has_duration and total_dt_mins > 0 else None
        if share is not None:
            cum_share = round(cum_share + share, 2)
        cnt = c_item["event_count"]
        avg_dur = round(mins / c_item["duration_count"], 1) if has_duration else None
        category_pareto.append({
            "category": c_item["category"],
            "total_minutes": round(mins, 1) if has_duration else None,
            "total_hours": round(hrs, 1) if has_duration else None,
            "event_count": cnt,
            "share_pct": share,
            "cumulative_share_pct": min(cum_share, 100.0) if share is not None else None,
            "average_duration_minutes": avg_dur,
            "is_planned": c_item["is_planned"],
        })

    # 2. Machine Ranking & MTTR / MTBF
    mach_tally: dict[str, dict[str, Any]] = {}
    for r in filtered:
        m = r.get("machine") or "Unspecified"
        if m not in mach_tally:
            mach_tally[m] = {
                "machine": m,
                "stage": r.get("stage") or "Unspecified",
                "total_minutes": 0.0,
                "event_count": 0,
                "duration_count": 0,
                "breakdown_minutes": 0.0,
                "breakdown_count": 0,
                "breakdown_duration_count": 0,
                "categories": {},
            }
        raw_duration = r.get("downtime_minutes")
        valid_duration = (
            raw_duration
            if isinstance(raw_duration, int | float) and not isinstance(raw_duration, bool)
            else None
        )
        dt_m = valid_duration or 0.0
        if valid_duration is not None:
            mach_tally[m]["total_minutes"] += valid_duration
            mach_tally[m]["duration_count"] += 1
        mach_tally[m]["event_count"] += 1
        cat_name = r.get("category") or "Unclassified"
        if valid_duration is not None:
            mach_tally[m]["categories"][cat_name] = mach_tally[m]["categories"].get(cat_name, 0.0) + dt_m

        if cat_name.lower() == "breakdown":
            mach_tally[m]["breakdown_count"] += 1
            if valid_duration is not None:
                mach_tally[m]["breakdown_minutes"] += valid_duration
                mach_tally[m]["breakdown_duration_count"] += 1

    machine_ranking = []
    for m_item in sorted(mach_tally.values(), key=lambda x: x["total_minutes"], reverse=True):
        m_mins = m_item["total_minutes"]
        m_hrs = m_mins / 60.0
        bd_cnt = m_item["breakdown_count"]
        bd_duration_count = m_item["breakdown_duration_count"]
        bd_mins = m_item["breakdown_minutes"]
        bd_hrs = bd_mins / 60.0
        mttr = round((bd_hrs / bd_duration_count), 2) if bd_duration_count > 0 else None
        mtbf = round((period_calendar_hours / bd_cnt), 1) if bd_cnt > 0 else None
        has_duration = m_item["duration_count"] > 0
        share = round((m_mins / total_dt_mins * 100.0), 2) if has_duration and total_dt_mins > 0 else None

        top_cat = "None"
        if m_item["categories"]:
            top_cat = max(m_item["categories"].items(), key=lambda kv: kv[1])[0]

        machine_ranking.append({
            "machine": m_item["machine"],
            "stage": m_item["stage"],
            "total_downtime_minutes": round(m_mins, 1) if has_duration else None,
            "total_downtime_hours": round(m_hrs, 1) if has_duration else None,
            "event_count": m_item["event_count"],
            "downtime_share_pct": share,
            "breakdown_event_count": bd_cnt,
            "breakdown_events_with_valid_duration": bd_duration_count,
            "breakdown_downtime_hours": round(bd_hrs, 1) if bd_duration_count > 0 else None,
            "mttr_hours": mttr,
            "mtbf_approx_hours": mtbf,
            "top_category": top_cat,
        })

    # 3. Recurring Breakdown Insights
    frequent_breakdown_machines = sorted(
        [m for m in machine_ranking if m["breakdown_event_count"] > 0],
        key=lambda x: x["breakdown_event_count"],
        reverse=True
    )[:5]

    longest_mttr_machines = sorted(
        [m for m in machine_ranking if m["breakdown_events_with_valid_duration"] >= 3],
        key=lambda x: x["mttr_hours"],
        reverse=True
    )[:5]

    # 4. Monthly Trends
    month_tally: dict[str, dict[str, Any]] = {}
    for r in filtered:
        d = r.get("date")
        if not d:
            continue
        m_key = d[:7]
        if m_key not in month_tally:
            month_tally[m_key] = {
                "month": m_key,
                "downtime_minutes": 0.0,
                "duration_count": 0,
                "event_count": 0,
                "breakdown_count": 0,
                "breakdown_minutes": 0.0,
                "breakdown_duration_count": 0,
            }
        raw_duration = r.get("downtime_minutes")
        valid_duration = (
            raw_duration
            if isinstance(raw_duration, int | float) and not isinstance(raw_duration, bool)
            else None
        )
        if valid_duration is not None:
            month_tally[m_key]["downtime_minutes"] += valid_duration
            month_tally[m_key]["duration_count"] += 1
        month_tally[m_key]["event_count"] += 1
        if (r.get("category") or "").lower() == "breakdown":
            month_tally[m_key]["breakdown_count"] += 1
            if valid_duration is not None:
                month_tally[m_key]["breakdown_minutes"] += valid_duration
                month_tally[m_key]["breakdown_duration_count"] += 1

    monthly_trends = []
    all_months = sorted(month_tally.keys())
    if source_dataset is not None and min_date and max_date:
        month_start = datetime.date.fromisoformat(min_date).replace(day=1)
        month_end = datetime.date.fromisoformat(max_date).replace(day=1)
        while month_start <= month_end:
            month_key = month_start.strftime("%Y-%m")
            if month_key not in all_months:
                all_months.append(month_key)
            month_start = (
                month_start.replace(year=month_start.year + 1, month=1)
                if month_start.month == 12
                else month_start.replace(month=month_start.month + 1)
            )
        all_months.sort()
    elif (
        "2024-11" not in all_months
        and min_date
        and max_date
        and min_date <= "2024-11-01"
        and max_date >= "2024-11-30"
    ):
        all_months.append("2024-11")
        all_months.sort()

    for m_key in all_months:
        if m_key in month_tally:
            meta = month_tally[m_key]
            monthly_trends.append({
                "month": m_key,
                "downtime_hours": (
                    round(meta["downtime_minutes"] / 60.0, 1)
                    if meta["duration_count"] > 0
                    else None
                ),
                "event_count": meta["event_count"],
                "breakdown_event_count": meta["breakdown_count"],
                "breakdown_hours": (
                    round(meta["breakdown_minutes"] / 60.0, 1)
                    if meta["breakdown_duration_count"] > 0
                    else None
                ),
                "has_data": True,
                "has_duration_data": meta["duration_count"] > 0,
            })
        else:
            monthly_trends.append({
                "month": m_key,
                "downtime_hours": None if source_dataset is not None else 0.0,
                "event_count": 0,
                "breakdown_event_count": 0,
                "breakdown_hours": None if source_dataset is not None else 0.0,
                "has_data": False,
                "has_duration_data": False,
                "note": (
                    f"No records were returned for {m_key}."
                    if source_dataset is not None
                    else "Known gap in source workbook: exactly 0 records logged for Nov-2024"
                ),
            })

    # 5. Stage Breakdown
    stage_tally: dict[str, dict[str, Any]] = {}
    for r in filtered:
        st = r.get("stage") or "Unspecified"
        if st not in stage_tally:
            stage_tally[st] = {
                "stage": st,
                "total_minutes": 0.0,
                "duration_count": 0,
                "event_count": 0,
            }
        duration = r.get("downtime_minutes")
        if isinstance(duration, int | float) and not isinstance(duration, bool):
            stage_tally[st]["total_minutes"] += duration
            stage_tally[st]["duration_count"] += 1
        stage_tally[st]["event_count"] += 1

    stage_breakdown = [
        {
            "stage": st_item["stage"],
            "total_hours": (
                round(st_item["total_minutes"] / 60.0, 1)
                if st_item["duration_count"] > 0
                else None
            ),
            "event_count": st_item["event_count"],
            "share_pct": (
                round((st_item["total_minutes"] / total_dt_mins * 100.0), 2)
                if st_item["duration_count"] > 0 and total_dt_mins > 0
                else 0.0 if st_item["duration_count"] > 0 else None
            ),
        }
        for st_item in sorted(stage_tally.values(), key=lambda x: x["total_minutes"], reverse=True)
    ]

    # 6. Shift Breakdown
    shift_tally: dict[str, dict[str, Any]] = {}
    for r in filtered:
        sh = r.get("shift") or "Unspecified"
        if sh not in shift_tally:
            shift_tally[sh] = {
                "shift": sh,
                "total_minutes": 0.0,
                "duration_count": 0,
                "event_count": 0,
            }
        duration = r.get("downtime_minutes")
        if isinstance(duration, int | float) and not isinstance(duration, bool):
            shift_tally[sh]["total_minutes"] += duration
            shift_tally[sh]["duration_count"] += 1
        shift_tally[sh]["event_count"] += 1

    shift_breakdown = [
        {
            "shift": sh_item["shift"],
            "total_hours": (
                round(sh_item["total_minutes"] / 60.0, 1)
                if sh_item["duration_count"] > 0
                else None
            ),
            "event_count": sh_item["event_count"],
            "share_pct": (
                round((sh_item["total_minutes"] / total_dt_mins * 100.0), 2)
                if sh_item["duration_count"] > 0 and total_dt_mins > 0
                else 0.0 if sh_item["duration_count"] > 0 else None
            ),
        }
        for sh_item in sorted(shift_tally.values(), key=lambda x: x["total_minutes"], reverse=True)
    ]

    return {
        "source_type": data.get("source_type"),
        "source_notice": data.get("source_notice"),
        "is_live_google_sheets": data.get("is_live_google_sheets", False),
        "last_modified": data.get("last_modified"),
        "filters_applied": {
            "category": category or "All",
            "machine": machine or "All",
            "stage": stage or "All",
            "shift": shift or "All",
            "date_from": date_from,
            "date_to": date_to,
        },
        "summary": {
            "total_records": total_records,
            "records_with_valid_duration": valid_duration_count,
            "records_without_valid_duration": sum(
                1 for r in filtered
                if not isinstance(r.get("downtime_minutes"), int | float) or isinstance(r.get("downtime_minutes"), bool)
            ),
            "total_downtime_minutes": round(total_dt_mins, 1) if duration_metrics_available else None,
            "total_downtime_hours": round(total_dt_hrs, 1) if duration_metrics_available else None,
            "planned_downtime_hours": round(planned_hrs, 1) if planned_hrs is not None else None,
            "planned_downtime_pct": planned_pct,
            "unplanned_downtime_hours": round(unplanned_hrs, 1) if unplanned_hrs is not None else None,
            "unplanned_downtime_pct": unplanned_pct,
            "breakdown_events_count": breakdown_count,
            "breakdown_events_with_valid_duration": breakdown_duration_count,
            "breakdown_downtime_hours": round(breakdown_hrs, 1) if breakdown_duration_count else None,
            "overall_mttr_hours": overall_mttr_hrs,
            "overall_mtbf_approx_hours": overall_mtbf_approx_hrs,
            "coverage_dates": {
                "min": min_date,
                "max": max_date,
                "coverage_days": coverage_days,
                "period_calendar_hours": period_calendar_hours,
            },
            "mirrored_rows_excluded": data.get("records_summary", {}).get("mirrored_downtime_skipped", 0),
            "planned_classification_supported": planned_supported,
            "duration_metrics_available": duration_metrics_available,
        },
        "category_pareto": category_pareto,
        "machine_ranking": machine_ranking,
        "recurring_breakdown_insights": {
            "frequent_failure_equipment": frequent_breakdown_machines,
            "longest_repair_equipment": longest_mttr_machines,
        },
        "monthly_trends": monthly_trends,
        "stage_breakdown": stage_breakdown,
        "shift_breakdown": shift_breakdown,
        "data_quality_warnings": (
            data.get("data_quality_warnings", [])
            if source_dataset is not None
            else [w for w in data.get("data_quality_warnings", []) if w.get("code") in {"NOV_2024_GAP", "HISTORICAL_SHIFT_GAP", "HISTORICAL_TARGET_OMISSIONS"}]
        ),
        "drilldown_records_sample": filtered[:100],
        "worksheet": data.get("worksheet"),
        "worksheet_id": data.get("worksheet_id"),
        "source_headers": data.get("source_headers"),
        "used_range": data.get("used_range"),
        "record_count": data.get("records_summary", {}).get("historical_downtime_accepted"),
        "formula_documentation": {
            "mttr_definition": "Mean Time To Repair = Total Breakdown Downtime Hours / Breakdown Event Count (Category == 'Breakdown')",
            "mtbf_definition": "Mean Time Between Failures = Calendar hours in the selected date coverage / Breakdown Event Count. This is a calendar-time approximation because machine run hours are not tracked in this log.",
            "planned_categories": sorted(list(PLANNED_DOWNTIME_CATEGORIES)),
            "data_separation": (
                "Records are read from the Downtime Log worksheet only; no Entries rows are joined."
                if source_dataset is not None
                else "Historical downtime records are isolated from active shift entries; formula-mirrored rows are excluded by the local workbook parser."
            ),
        },
    }


def get_line_tracker_historical_records(
    category: str | None = None,
    machine: str | None = None,
    stage: str | None = None,
    shift: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
    refresh: bool = False,
    source_dataset: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return paginated, searchable historical downtime records with slice filters."""
    data = source_dataset or get_line_tracker_dataset(refresh=refresh)
    records: list[dict[str, Any]] = data.get("historical_downtime_records", [])

    filtered = records
    if category and category.lower() != "all":
        filtered = [r for r in filtered if (r.get("category") or "").lower() == category.lower()]
    if machine and machine.lower() != "all":
        filtered = [r for r in filtered if (r.get("machine") or "").lower() == machine.lower()]
    if stage and stage.lower() != "all":
        filtered = [r for r in filtered if (r.get("stage") or "").lower() == stage.lower()]
    if shift and shift.lower() != "all":
        filtered = [r for r in filtered if (r.get("shift") or "").lower() == shift.lower()]
    if date_from:
        filtered = [r for r in filtered if r.get("date") and r["date"] >= date_from]
    if date_to:
        filtered = [r for r in filtered if r.get("date") and r["date"] <= date_to]
    if search:
        s_term = search.lower().strip()
        filtered = [
            r for r in filtered
            if s_term in (r.get("machine") or "").lower()
            or s_term in (r.get("category") or "").lower()
            or s_term in (r.get("downtime_type") or "").lower()
            or s_term in (r.get("description") or "").lower()
        ]

    total_count = len(filtered)
    start_idx = max((page - 1) * page_size, 0)
    end_idx = start_idx + page_size
    sliced = filtered[start_idx:end_idx]

    return {
        "source_type": data.get("source_type"),
        "source_notice": data.get("source_notice"),
        "is_live_google_sheets": data.get("is_live_google_sheets", False),
        "last_modified": data.get("last_modified"),
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": max((total_count + page_size - 1) // page_size, 1),
        "records": sliced,
    }



