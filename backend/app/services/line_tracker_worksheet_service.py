"""Read-only catalog and paginated source rows for ERC Mk-V worksheets."""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from typing import Any

from app.core.config import settings
from app.services.google_sheets_service import (
    _fetch_sheet_values_with_metadata,
    fetch_google_sheet_worksheet_metadata,
)


@dataclass(frozen=True)
class WorksheetDefinition:
    key: str
    name: str
    group: str
    header_row: int | None
    column_count: int | None
    layout: str = "table"


WORKSHEETS = (
    WorksheetDefinition("production-order", "Production Order", "Production", 1, 11),
    WorksheetDefinition(
        "copy-of-production-order", "Copy of Production Order", "Production", 1, 11
    ),
    WorksheetDefinition("order-plan-monthly", "Order Plan (Monthly)", "Production", 4, 22),
    WorksheetDefinition(
        "rm-heat-plan-vs-actual", "RM Heat Plan vs Actual", "Raw Materials", 4, 17
    ),
    WorksheetDefinition(
        "heat-lot-number-reference",
        "Heat & Lot Number Reference",
        "Raw Materials",
        5,
        6,
    ),
    WorksheetDefinition(
        "machine-consumables", "Machine Consumables", "Machines & Capacity", 4, 8
    ),
    WorksheetDefinition("machine-master", "Machine Master", "Machines & Capacity", 1, 13),
    WorksheetDefinition(
        "capacity-change-log", "Capacity Change Log", "Machines & Capacity", 1, 6
    ),
    WorksheetDefinition("entries", "Entries", "Operations", 1, 32),
    WorksheetDefinition("planned-shutdowns", "Planned Shutdowns", "Machines & Capacity", 1, 7),
    WorksheetDefinition(
        "manpower-summary", "Manpower Summary", "Operations", None, 6, layout="grid"
    ),
    WorksheetDefinition(
        "production-dashboard",
        "Production Dashboard",
        "Dashboards",
        7,
        6,
        layout="grid",
    ),
    WorksheetDefinition("dashboard", "Dashboard", "Dashboards", 5, 4, layout="grid"),
    WorksheetDefinition("summary", "Summary", "Dashboards", 5, 7, layout="grid"),
    WorksheetDefinition("downtime-log", "Downtime Log", "Downtime & Reliability", 1, 15),
    WorksheetDefinition(
        "downtime-analysis",
        "Downtime Analysis",
        "Downtime & Reliability",
        5,
        5,
        layout="grid",
    ),
    WorksheetDefinition(
        "oee-reliability", "OEE & Reliability", "Downtime & Reliability", 5, 6
    ),
)

_WORKSHEET_BY_KEY = {worksheet.key: worksheet for worksheet in WORKSHEETS}
_CACHE_TTL_SECONDS = max(30, settings.line_tracker_cache_ttl_seconds)
_CACHE: dict[str, dict[str, Any]] = {}
_CATALOG_CACHE: dict[str, Any] | None = None
_CACHE_LOCK = Lock()


class WorksheetNotFoundError(ValueError):
    """Raised when a requested worksheet key is not in the allowlisted catalog."""


class WorksheetReadError(RuntimeError):
    """Raised when a worksheet cannot be read and no successful cache is available."""


def _spreadsheet_id() -> str:
    spreadsheet_id = settings.line_tracker_spreadsheet_id.strip()
    if not spreadsheet_id:
        raise WorksheetReadError("ERC Mk-V Google Sheets spreadsheet ID is not configured.")
    return spreadsheet_id


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


def _is_empty_row(row: list[Any]) -> bool:
    return not any(value is not None and str(value).strip() for value in row)


def _column_label(index: int) -> str:
    label = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        label = chr(65 + remainder) + label
    return label


def _header_labels(values: list[Any], count: int) -> tuple[list[str], list[str]]:
    headers: list[str] = []
    warnings: list[str] = []
    for index in range(count):
        raw = values[index] if index < len(values) else None
        label = str(raw).strip() if raw is not None else ""
        headers.append(label or f"Column {_column_label(index + 1)}")

    seen: set[str] = set()
    duplicates = sorted({header for header in headers if header in seen or seen.add(header)})
    if duplicates:
        warnings.append(
            "Duplicate source headers were preserved by column position: "
            + ", ".join(duplicates)
        )
    if any(header.startswith("Column ") for header in headers):
        warnings.append("One or more source headers are blank; spreadsheet column labels are shown.")
    return headers, warnings


def get_line_tracker_worksheet_catalog(*, refresh: bool = False) -> dict[str, Any]:
    """Return the expected worksheets with live Google sheet IDs and availability."""
    global _CATALOG_CACHE

    spreadsheet_id = _spreadsheet_id()
    now = time.monotonic()
    with _CACHE_LOCK:
        cached = _CATALOG_CACHE
        if not refresh and cached and now - cached["cached_at"] < _CACHE_TTL_SECONDS:
            payload = dict(cached["payload"])
            payload["cache_hit"] = True
            return payload

    try:
        metadata = fetch_google_sheet_worksheet_metadata(spreadsheet_id)
    except Exception as exc:
        raise WorksheetReadError(
            f"Unable to read ERC Mk-V worksheet metadata ({type(exc).__name__})."
        ) from exc

    live_by_name = {item.get("worksheet"): item for item in metadata}
    worksheets = []
    for definition in WORKSHEETS:
        live = live_by_name.get(definition.name)
        worksheets.append(
            {
                "key": definition.key,
                "name": definition.name,
                "group": definition.group,
                "layout": definition.layout,
                "header_row": definition.header_row,
                "status": "available" if live else "missing",
                "worksheet_id": live.get("worksheet_id") if live else None,
                "grid_row_count": live.get("grid_row_count") if live else None,
                "grid_column_count": live.get("grid_column_count") if live else None,
            }
        )

    payload = {
        "source": "google-sheets",
        "spreadsheet_id": spreadsheet_id,
        "fetched_at": _iso_now(),
        "cache_hit": False,
        "worksheets": worksheets,
        "unconfigured_worksheets": [
            {"name": item.get("worksheet"), "worksheet_id": item.get("worksheet_id")}
            for item in metadata
            if item.get("worksheet") not in _WORKSHEET_BY_NAME
        ],
    }
    with _CACHE_LOCK:
        _CATALOG_CACHE = {"cached_at": now, "payload": payload}
    return payload


_WORKSHEET_BY_NAME = {worksheet.name for worksheet in WORKSHEETS}


def get_line_tracker_worksheet_data(
    worksheet_key: str,
    *,
    page: int = 1,
    page_size: int = 50,
    search: str = "",
    refresh: bool = False,
) -> dict[str, Any]:
    """Return a worksheet's source rows, preserving row numbers and read provenance."""
    if worksheet_key not in _WORKSHEET_BY_KEY:
        raise WorksheetNotFoundError(f"Unknown ERC Mk-V worksheet key: {worksheet_key}.")
    if page < 1:
        raise ValueError("Page number must be at least 1.")
    if not 1 <= page_size <= 200:
        raise ValueError("Page size must be between 1 and 200.")

    definition = _WORKSHEET_BY_KEY[worksheet_key]
    spreadsheet_id = _spreadsheet_id()
    cache_key = f"{spreadsheet_id}:{definition.name}"
    now = time.monotonic()
    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
        is_fresh = cached is not None and now - cached["cached_at"] < _CACHE_TTL_SECONDS
        if not refresh and is_fresh:
            raw = cached["data"]
            cache_hit = True
            is_stale = False
            refresh_error = None
        else:
            raw = None
            cache_hit = False
            is_stale = False
            refresh_error = None

    if raw is None:
        try:
            fetched = _fetch_sheet_values_with_metadata(spreadsheet_id, definition.name)
        except Exception as exc:
            with _CACHE_LOCK:
                cached = _CACHE.get(cache_key)
            if cached is None:
                raise WorksheetReadError(
                    f"Unable to read worksheet '{definition.name}' from Google Sheets "
                    f"({type(exc).__name__})."
                ) from exc
            raw = cached["data"]
            is_stale = True
            refresh_error = (
                f"Google Sheets refresh failed ({type(exc).__name__}); showing cached data."
            )
        else:
            raw = fetched
            with _CACHE_LOCK:
                _CACHE[cache_key] = {
                    "data": fetched,
                    "cached_at": now,
                    "fetched_at": _iso_now(),
                }
            cached = _CACHE[cache_key]
    else:
        with _CACHE_LOCK:
            cached = _CACHE[cache_key]

    values = raw.get("rows") or []
    warnings: list[str] = []
    source_context_rows: list[dict[str, Any]] = []
    if definition.layout == "grid":
        column_count = min(
            max((len(row) for row in values if not _is_empty_row(row)), default=0),
            52,
        )
        headers = ["Row", *[_column_label(index) for index in range(1, column_count + 1)]]
        source_rows = [
            {"row_number": index, "values": [index, *row[:column_count]]}
            for index, row in enumerate(values, start=1)
            if not _is_empty_row(row)
        ]
        if any(len(row) > 52 for row in values):
            warnings.append("Columns beyond AZ are omitted from this grid preview.")
    else:
        header_index = (definition.header_row or 1) - 1
        source_context_rows = [
            {"row_number": index, "values": row}
            for index, row in enumerate(values[:header_index], start=1)
            if not _is_empty_row(row)
        ]
        header_values = values[header_index] if header_index < len(values) else []
        if not header_values:
            warnings.append(
                f"Expected header row {definition.header_row} is empty or unavailable."
            )
        inferred_count = max(
            (len(row) for row in values if not _is_empty_row(row)),
            default=0,
        )
        column_count = min(
            max(definition.column_count or inferred_count, inferred_count),
            52,
        )
        headers, header_warnings = _header_labels(header_values, column_count)
        warnings.extend(header_warnings)
        if inferred_count > 52:
            warnings.append("Columns beyond AZ are omitted from this table preview.")
        source_rows = [
            {"row_number": index, "values": row[:column_count]}
            for index, row in enumerate(values, start=1)
            if index > header_index + 1 and not _is_empty_row(row)
        ]

    query = search.strip().casefold()
    filtered_rows = (
        [
            row
            for row in source_rows
            if query
            in " ".join(str(value) for value in row["values"] if value is not None).casefold()
        ]
        if query
        else source_rows
    )
    total_count = len(source_rows)
    filtered_count = len(filtered_rows)
    start = (page - 1) * page_size
    page_rows = filtered_rows[start : start + page_size]
    fetched_at = cached.get("fetched_at")
    live_metadata = {
        "key": definition.key,
        "name": raw.get("worksheet", definition.name),
        "group": definition.group,
        "layout": definition.layout,
        "header_row": definition.header_row,
        "worksheet_id": raw.get("worksheet_id"),
        "grid_row_count": raw.get("grid_row_count"),
        "grid_column_count": raw.get("grid_column_count"),
    }

    return {
        "source": "google-sheets",
        "spreadsheet_id": spreadsheet_id,
        "worksheet": live_metadata,
        "headers": headers,
        "source_context_rows": source_context_rows,
        "records": page_rows,
        "record_count": total_count,
        "filtered_record_count": filtered_count,
        "page": page,
        "page_size": page_size,
        "page_count": (filtered_count + page_size - 1) // page_size,
        "fetched_at": fetched_at,
        "cache_hit": cache_hit,
        "is_stale": is_stale,
        "refresh_error": refresh_error,
        "validation_warnings": warnings,
    }


def clear_line_tracker_worksheet_cache() -> None:
    """Clear worksheet caches for isolated tests."""
    global _CATALOG_CACHE
    with _CACHE_LOCK:
        _CACHE.clear()
        _CATALOG_CACHE = None
