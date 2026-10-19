"""Read-only shift-entry and manpower analytics for ERC Mk-V worksheets."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
from math import isclose
from typing import Any

from app.services.line_tracker_machine_assets_service import get_machine_master_analytics
from app.services.line_tracker_rm_heat_service import get_heat_lot_reference_analytics
from app.services.line_tracker_worksheet_service import (
    WorksheetReadError,
    get_line_tracker_worksheet_data,
)

_ENTRY_ID = 1019432778
_MANPOWER_ID = 1841059416
_READ_PAGE_SIZE = 200
_MAX_PAGE_SIZE = 100
_MAX_ROWS = 5000
_ENTRY_HEADERS = (
    "Date",
    "Shift",
    "Shift Duration (min)",
    "Source",
    "Work Center",
    "Machine",
    "Rated CT (sec)",
    "Output Qty",
    "Downtime (min)",
    "Rejects (Other Ops)",
    "Actual CT (sec)",
    "Efficiency %",
    "Status vs Rated",
    "Downtime Category",
    "Breakdown Type",
    "Downtime Description",
    "Planned Shutdown (min)",
    "Availability %",
    "Performance %",
    "Quality %",
    "OEE %",
    "Planned Manpower",
    "Actual Manpower",
    "Manpower Shortfall",
    "RM Heat Nr",
    "Bundle Nr",
    "Lot Number",
    "Part",
    "OP10 Rejects (Forming)",
    "OP20 Rejects (Forming)",
    "OP30 Rejects (Forming)",
    "Total Rejects",
)
_FORMULA_FIELDS = (
    "Shift Duration (min)",
    "Work Center",
    "Rated CT (sec)",
    "Actual CT (sec)",
    "Efficiency %",
    "Status vs Rated",
    "Planned Shutdown (min)",
    "Availability %",
    "Performance %",
    "Quality %",
    "OEE %",
    "Planned Manpower",
    "Manpower Shortfall",
    "Total Rejects",
)
_ENTRY_KEYS = {
    "Date": "date",
    "Shift": "shift",
    "Shift Duration (min)": "shift_duration_min",
    "Source": "source",
    "Work Center": "work_center",
    "Machine": "machine",
    "Rated CT (sec)": "rated_ct_sec",
    "Output Qty": "output_qty",
    "Downtime (min)": "downtime_min",
    "Rejects (Other Ops)": "rejects_other_ops",
    "Actual CT (sec)": "actual_ct_sec",
    "Efficiency %": "efficiency_fraction",
    "Status vs Rated": "status_vs_rated",
    "Downtime Category": "downtime_category",
    "Breakdown Type": "breakdown_type",
    "Downtime Description": "downtime_description",
    "Planned Shutdown (min)": "planned_shutdown_min",
    "Availability %": "availability_fraction",
    "Performance %": "performance_fraction",
    "Quality %": "quality_fraction",
    "OEE %": "oee_fraction",
    "Planned Manpower": "planned_manpower",
    "Actual Manpower": "actual_manpower",
    "Manpower Shortfall": "manpower_shortfall",
    "RM Heat Nr": "rm_heat_number",
    "Bundle Nr": "bundle_number",
    "Lot Number": "lot_number",
    "Part": "part",
    "OP10 Rejects (Forming)": "op10_rejects_forming",
    "OP20 Rejects (Forming)": "op20_rejects_forming",
    "OP30 Rejects (Forming)": "op30_rejects_forming",
    "Total Rejects": "total_rejects",
}
_MANUAL_FIELDS = tuple(
    field for field in _ENTRY_HEADERS if field not in _FORMULA_FIELDS and field != "Date"
)
_ENTRY_SORTS = {
    "source_row",
    "date",
    "shift",
    "work_center",
    "machine",
    "part",
    "output_qty",
    "downtime_min",
    "total_rejects",
    "availability_fraction",
    "performance_fraction",
    "quality_fraction",
    "oee_fraction",
    "planned_manpower",
    "actual_manpower",
    "manpower_shortfall",
}
_MANPOWER_SORTS = {
    "source_row",
    "name",
    "rated_manpower_per_shift",
    "avg_planned",
    "avg_actual",
    "total_shortfall",
    "source_shifts_logged",
    "dated_entry_count",
}


def _field_name(value: Any) -> str:
    return str(value or "").strip().casefold()


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text.strip() else None


def _normalized(value: Any) -> str | None:
    text = _text(value)
    return text.strip().casefold() if text else None


def _number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return value


def _cell(row: list[Any], index: int) -> Any:
    if index >= len(row):
        return None
    value = row[index]
    return None if value == "" else value


def _source(
    key: str,
    expected_id: int,
    *,
    refresh: bool,
) -> dict[str, Any]:
    first = get_line_tracker_worksheet_data(key, page=1, page_size=_READ_PAGE_SIZE, refresh=refresh)
    name = first["worksheet"]["name"]
    if first["record_count"] > _MAX_ROWS:
        raise WorksheetReadError(f"Worksheet '{name}' exceeds the Phase 5 read limit.")
    if first["worksheet"]["worksheet_id"] != expected_id:
        raise WorksheetReadError(f"Worksheet '{name}' sheet ID did not match the audited source.")
    records = list(first["records"])
    for page in range(2, first["page_count"] + 1):
        following = get_line_tracker_worksheet_data(
            key, page=page, page_size=_READ_PAGE_SIZE, refresh=False
        )
        records.extend(following["records"])
    return {**first, "records": records}


def _validate_entry_headers(source: dict[str, Any]) -> None:
    actual = {_field_name(value) for value in source["headers"]}
    missing = [header for header in _ENTRY_HEADERS if _field_name(header) not in actual]
    if missing:
        raise WorksheetReadError(
            "Worksheet 'Entries' is missing expected headers: " + ", ".join(missing)
        )


def _source_state(**sources: dict[str, Any]) -> dict[str, Any]:
    fetched = [source.get("fetched_at") for source in sources.values() if source.get("fetched_at")]
    errors = [source["refresh_error"] for source in sources.values() if source.get("refresh_error")]
    return {
        "source": "google-sheets",
        "spreadsheet_id": next(iter(sources.values()))["spreadsheet_id"],
        "fetched_at": max(fetched) if fetched else None,
        "cache_hit": all(source.get("cache_hit", False) for source in sources.values()),
        "is_stale": any(source.get("is_stale", False) for source in sources.values()),
        "refresh_error": "; ".join(errors) or None,
        "sources": {
            key: {
                "worksheet": source["worksheet"]["name"],
                "worksheet_id": source["worksheet"]["worksheet_id"],
                "fetched_at": source.get("fetched_at"),
                "cache_hit": source.get("cache_hit", False),
                "is_stale": source.get("is_stale", False),
                "refresh_error": source.get("refresh_error"),
            }
            for key, source in sources.items()
        },
    }


def _header_positions(headers: list[str]) -> dict[str, int]:
    return {_field_name(header): index for index, header in enumerate(headers)}


def _entry_has_user_data(values: list[Any], positions: dict[str, int]) -> bool:
    return any(_cell(values, positions[_field_name(field)]) is not None for field in _MANUAL_FIELDS)


def _is_iso_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value[:10])
    except ValueError:
        return False
    return len(value) == 10


def _compare_number(actual: Any, expected: float | int | str | None) -> str:
    numeric = _number(actual)
    if numeric is None or not isinstance(expected, int | float):
        return "unverifiable"
    return (
        "match"
        if isclose(float(numeric), float(expected), rel_tol=1e-8, abs_tol=1e-7)
        else "mismatch"
    )


def _build_entries(
    source: dict[str, Any],
    machine_source: dict[str, Any],
    heat_reference: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    positions = _header_positions(source["headers"])
    _validate_entry_headers(source)

    machines_by_key: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for machine in machine_source["records"]:
        work_center = _normalized(machine.get("work_center"))
        name = _normalized(machine.get("machine"))
        if work_center and name:
            machines_by_key[(work_center, name)].append(machine)

    reference_by_key: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for reference in heat_reference["records"]:
        heat = _normalized(reference.get("heat_no"))
        lot = _normalized(reference.get("lot_no"))
        if heat and lot:
            reference_by_key[(heat, lot)].append(reference)

    entries: list[dict[str, Any]] = []
    for source_record in source["records"]:
        values = source_record["values"]
        if not _entry_has_user_data(values, positions):
            continue
        raw = {field: _cell(values, positions[_field_name(field)]) for field in _ENTRY_HEADERS}
        source_row = source_record["row_number"]
        work_center = _text(raw["Work Center"])
        machine_name = _text(raw["Machine"])
        machine_key = (
            (_normalized(work_center), _normalized(machine_name))
            if work_center and machine_name
            else None
        )
        machine_matches = machines_by_key.get(machine_key, []) if machine_key else []
        machine_status = (
            "incomplete_key"
            if machine_key is None
            else "matched"
            if len(machine_matches) == 1
            else "ambiguous"
            if len(machine_matches) > 1
            else "unmatched"
        )

        heat = _text(raw["RM Heat Nr"])
        lot = _text(raw["Lot Number"])
        heat_key = (_normalized(heat), _normalized(lot)) if heat and lot else None
        reference_matches = reference_by_key.get(heat_key, []) if heat_key else []
        heat_status = (
            "incomplete_key"
            if heat_key is None
            else "matched"
            if len(reference_matches) == 1
            else "ambiguous"
            if len(reference_matches) > 1
            else "unmatched"
        )

        values_by_name = {_field_name(key): value for key, value in raw.items()}

        def value(field: str) -> Any:
            return values_by_name.get(_field_name(field))

        duration = _number(value("Shift Duration (min)"))
        output = _number(value("Output Qty"))
        downtime = _number(value("Downtime (min)"))
        planned_shutdown = _number(value("Planned Shutdown (min)"))
        rated_ct = _number(value("Rated CT (sec)"))
        actual_ct = _number(value("Actual CT (sec)"))
        rejects = _number(value("Total Rejects"))
        expected: dict[str, float | int | str | None] = {}
        if _number(value("Shift Duration (min)")) is not None:
            expected["Shift Duration (min)"] = 60 * 11
        if (
            all(item is not None for item in (duration, output, downtime, planned_shutdown))
            and output > 0
        ):
            expected["Actual CT (sec)"] = (
                max(duration * 60 - downtime * 60 - planned_shutdown * 60, 0) / output
            )
        if rated_ct is not None and actual_ct is not None and actual_ct > 0:
            expected["Efficiency %"] = rated_ct / actual_ct
            expected["Status vs Rated"] = (
                "Slower than rated" if actual_ct > rated_ct else "On / under rated"
            )
        if (
            duration is not None
            and planned_shutdown is not None
            and downtime is not None
            and duration > planned_shutdown
        ):
            available_minutes = duration - planned_shutdown
            expected["Availability %"] = max(available_minutes - downtime, 0) / available_minutes
            runtime_seconds = max(available_minutes - downtime, 0) * 60
            if output is not None and rated_ct is not None and runtime_seconds > 0:
                expected["Performance %"] = output * rated_ct / runtime_seconds
        if output is not None and output > 0 and rejects is not None:
            expected["Quality %"] = (output - rejects) / output
        availability = _number(value("Availability %"))
        performance = _number(value("Performance %"))
        quality = _number(value("Quality %"))
        if all(item is not None for item in (availability, performance, quality)):
            expected["OEE %"] = availability * performance * quality
        planned_manpower = _number(value("Planned Manpower"))
        actual_manpower = _number(value("Actual Manpower"))
        if planned_manpower is not None and actual_manpower is not None:
            expected["Manpower Shortfall"] = planned_manpower - actual_manpower
        if _text(raw["Work Center"]) == "Forming":
            forming_rejects = [
                _number(value(field))
                for field in (
                    "OP10 Rejects (Forming)",
                    "OP20 Rejects (Forming)",
                    "OP30 Rejects (Forming)",
                )
            ]
            expected["Total Rejects"] = sum(item for item in forming_rejects if item is not None)
        elif _number(value("Rejects (Other Ops)")) is not None:
            expected["Total Rejects"] = _number(value("Rejects (Other Ops)"))

        validations: dict[str, str] = {}
        for field, expected_value in expected.items():
            if field == "Status vs Rated":
                actual_value = value(field)
                validations[field] = (
                    "unverifiable"
                    if actual_value is None
                    else "match"
                    if actual_value == expected_value
                    else "mismatch"
                )
            else:
                validations[field] = _compare_number(value(field), expected_value)
        if machine_status == "matched":
            linked_machine = machine_matches[0]
            for field, master_field in (
                ("Work Center", "work_center"),
                ("Rated CT (sec)", "rated_ct_sec"),
                ("Planned Manpower", "manpower_per_shift"),
            ):
                actual_value = value(field)
                master_value = linked_machine.get(master_field)
                validations[f"Machine Master: {field}"] = (
                    "match"
                    if actual_value == master_value
                    else "mismatch"
                    if actual_value is not None and master_value is not None
                    else "unverifiable"
                )

        missing_fields = [
            name for name in ("Date", "Shift", "Work Center", "Machine") if _text(raw[name]) is None
        ]
        missing_fields.extend(["Machine Master match"] if machine_status != "matched" else [])
        entry_record = {
            "source_row": source_row,
            **{_ENTRY_KEYS[key]: cell_value for key, cell_value in raw.items()},
            "formula_derived_fields": list(_FORMULA_FIELDS) if 2 <= source_row <= 301 else [],
            "machine_match": machine_status,
            "heat_lot_match": heat_status,
            "heat_reference_row_numbers": [record["source_row"] for record in reference_matches],
            "missing_fields": missing_fields,
            "record_status": "incomplete" if missing_fields else "complete",
            "formula_validations": validations,
            "formula_unverified_fields": [
                field
                for field in _FORMULA_FIELDS
                if field not in validations and f"Machine Master: {field}" not in validations
            ],
            "actual_manpower_observed": actual_manpower is not None,
            "is_dated_entry": _is_iso_date(raw["Date"]),
        }
        entries.append(entry_record)
    return entries, list(machine_source["records"])


def _options(records: list[dict[str, Any]], field: str) -> list[str]:
    return sorted(
        {str(record[field]) for record in records if record.get(field) not in (None, "")},
        key=str.casefold,
    )


def _filter_entries(
    records: list[dict[str, Any]],
    *,
    search: str,
    date_from: str,
    date_to: str,
    filters: dict[str, str],
) -> list[dict[str, Any]]:
    query = search.strip().casefold()
    output = []
    for record in records:
        if (
            query
            and query
            not in " ".join(
                str(value) for key, value in record.items() if key not in {"formula_validations"}
            ).casefold()
        ):
            continue
        row_date = record.get("date")
        if date_from and (not _is_iso_date(row_date) or row_date < date_from):
            continue
        if date_to and (not _is_iso_date(row_date) or row_date > date_to):
            continue
        if any(
            requested and _normalized(record.get(field)) != _normalized(requested)
            for field, requested in filters.items()
        ):
            continue
        output.append(record)
    return output


def _sort_and_page(
    records: list[dict[str, Any]],
    *,
    page: int,
    page_size: int,
    sort_by: str,
    sort_order: str,
    allowed: set[str],
) -> tuple[list[dict[str, Any]], int, int]:
    if page < 1:
        raise ValueError("Page number must be at least 1.")
    if not 1 <= page_size <= _MAX_PAGE_SIZE:
        raise ValueError(f"Page size must be between 1 and {_MAX_PAGE_SIZE}.")
    if sort_by not in allowed:
        raise ValueError(f"Unsupported sort field: {sort_by}.")
    if sort_order not in {"asc", "desc"}:
        raise ValueError("Sort order must be 'asc' or 'desc'.")
    ordered = sorted(
        records,
        key=lambda record: (
            record.get(sort_by) is None,
            record.get(sort_by)
            if isinstance(record.get(sort_by), int | float)
            else str(record.get(sort_by) or "").casefold(),
            record["source_row"],
        ),
        reverse=sort_order == "desc",
    )
    count = len(ordered)
    pages = (count + page_size - 1) // page_size
    start = (page - 1) * page_size
    return ordered[start : start + page_size], count, pages


def _measure(records: list[dict[str, Any]], field: str) -> dict[str, int | float]:
    values = [_number(record.get(field)) for record in records]
    known = [value for value in values if value is not None]
    return {
        "known_total": sum(known),
        "known_value_count": len(known),
        "missing_value_count": len(values) - len(known),
    }


def _entry_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    formula_checks: dict[str, dict[str, int]] = {}
    for record in records:
        validations = record["formula_validations"]
        for field in record["formula_derived_fields"]:
            validation_field = (
                f"Machine Master: {field}"
                if field in {"Work Center", "Rated CT (sec)", "Planned Manpower"}
                else field
            )
            result = validations.get(validation_field, "unverifiable")
            counts = formula_checks.setdefault(
                field, {"match_count": 0, "mismatch_count": 0, "unverifiable_count": 0}
            )
            key = f"{result}_count"
            counts[key] += 1
    return {
        "entry_count": len(records),
        "dated_entry_count": sum(record["is_dated_entry"] for record in records),
        "incomplete_entry_count": sum(
            record["record_status"] == "incomplete" for record in records
        ),
        "manpower_observation_count": sum(record["actual_manpower_observed"] for record in records),
        "output_qty": _measure(records, "output_qty"),
        "downtime_min": _measure(records, "downtime_min"),
        "total_rejects": _measure(records, "total_rejects"),
        "planned_manpower": _measure(records, "planned_manpower"),
        "actual_manpower": _measure(records, "actual_manpower"),
        "manpower_shortfall": _measure(records, "manpower_shortfall"),
        "formula_validations": formula_checks,
        "unmatched_machine_count": sum(
            record["machine_match"] == "unmatched" for record in records
        ),
        "unmatched_heat_lot_count": sum(
            record["heat_lot_match"] == "unmatched" for record in records
        ),
        "machine_match_counts": dict(Counter(record["machine_match"] for record in records)),
        "heat_lot_match_counts": dict(Counter(record["heat_lot_match"] for record in records)),
    }


def _quality_summary(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        if record.get("work_center") and record.get("is_dated_entry"):
            grouped[str(record["work_center"])].append(record)
    return [
        {
            "work_center": work_center,
            "op10_rejects_forming": _measure(rows, "op10_rejects_forming"),
            "op20_rejects_forming": _measure(rows, "op20_rejects_forming"),
            "op30_rejects_forming": _measure(rows, "op30_rejects_forming"),
            "rejects_other_ops": _measure(rows, "rejects_other_ops"),
            "total_rejects": _measure(rows, "total_rejects"),
            "quality_fraction": _measure(rows, "quality_fraction"),
            "source_row_count": len(rows),
        }
        for work_center, rows in sorted(grouped.items(), key=lambda item: item[0].casefold())
    ]


def _build_base(
    refresh: bool,
    *,
    include_manpower_source: bool = True,
    include_heat_reference: bool = True,
) -> tuple[
    dict[str, Any],
    dict[str, Any] | None,
    list[dict[str, Any]],
    dict[str, Any],
    dict[str, Any] | None,
]:
    entry_source = _source("entries", _ENTRY_ID, refresh=refresh)
    _validate_entry_headers(entry_source)
    machine_data = get_machine_master_analytics(page_size=100, refresh=refresh)
    heat_data = (
        get_heat_lot_reference_analytics(page_size=100, refresh=refresh)
        if include_heat_reference
        else None
    )
    manpower_source = (
        _source("manpower-summary", _MANPOWER_ID, refresh=refresh)
        if include_manpower_source
        else None
    )
    entries, _ = _build_entries(entry_source, machine_data, heat_data or {"records": []})
    return entry_source, manpower_source, entries, machine_data, heat_data


def get_shift_entries_analytics(
    *,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    date_from: str = "",
    date_to: str = "",
    shift: str = "",
    work_center: str = "",
    machine: str = "",
    part: str = "",
    source: str = "",
    downtime_category: str = "",
    breakdown_type: str = "",
    status_vs_rated: str = "",
    sort_by: str = "date",
    sort_order: str = "desc",
    refresh: bool = False,
) -> dict[str, Any]:
    if date_from:
        try:
            date.fromisoformat(date_from)
        except ValueError as exc:
            raise ValueError("date_from must be an ISO date (YYYY-MM-DD).") from exc
    if date_to:
        try:
            date.fromisoformat(date_to)
        except ValueError as exc:
            raise ValueError("date_to must be an ISO date (YYYY-MM-DD).") from exc
    if date_from and date_to and date_from > date_to:
        raise ValueError("date_from must be on or before date_to.")

    entry_source, _, records, machine_data, heat_data = _build_base(
        refresh, include_manpower_source=False
    )
    assert heat_data is not None
    all_entries = list(records)
    filtered = _filter_entries(
        records,
        search=search,
        date_from=date_from,
        date_to=date_to,
        filters={
            "shift": shift,
            "work_center": work_center,
            "machine": machine,
            "part": part,
            "source": source,
            "downtime_category": downtime_category,
            "breakdown_type": breakdown_type,
            "status_vs_rated": status_vs_rated,
        },
    )
    rows, count, page_count = _sort_and_page(
        filtered,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        allowed=_ENTRY_SORTS,
    )
    return {
        **_source_state(
            entries=entry_source,
            machine_master={
                "spreadsheet_id": machine_data["spreadsheet_id"],
                "worksheet": machine_data["worksheet"],
                "fetched_at": machine_data.get("fetched_at"),
                "cache_hit": machine_data.get("cache_hit", False),
                "is_stale": machine_data.get("is_stale", False),
                "refresh_error": machine_data.get("refresh_error"),
            },
            heat_lot_reference={
                "spreadsheet_id": heat_data["spreadsheet_id"],
                "worksheet": heat_data["worksheet"],
                "fetched_at": heat_data.get("fetched_at"),
                "cache_hit": heat_data.get("cache_hit", False),
                "is_stale": heat_data.get("is_stale", False),
                "refresh_error": heat_data.get("refresh_error"),
            },
        ),
        "worksheet": entry_source["worksheet"],
        "source_headers": entry_source["headers"],
        "source_record_count": entry_source["record_count"],
        "formula_coverage": {
            "first_source_row": 2,
            "last_source_row": 301,
            "formula_row_count": 300,
            "formula_fields": list(_FORMULA_FIELDS),
        },
        "summary": _entry_summary(filtered),
        "total_summary": _entry_summary(all_entries),
        "quality_summary_by_work_center": _quality_summary(all_entries),
        "record_count": len(all_entries),
        "filtered_record_count": count,
        "page": page,
        "page_size": page_size,
        "page_count": page_count,
        "records": rows,
        "filter_options": {
            field: _options(all_entries, field)
            for field in (
                "shift",
                "work_center",
                "machine",
                "part",
                "source",
                "downtime_category",
                "breakdown_type",
                "status_vs_rated",
            )
        },
        "validation_warnings": [
            warning for warning in entry_source.get("validation_warnings", []) if warning
        ],
    }


def _summary_sections(source: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    work_centers: list[dict[str, Any]] = []
    machines: list[dict[str, Any]] = []
    section: str | None = None
    found_work_center_header = False
    found_machine_header = False
    for source_record in source["records"]:
        values = source_record["values"]
        cells = values[1:] if len(values) > 1 else []
        labels = {_field_name(value) for value in cells if _text(value)}
        if {
            "work center",
            "avg planned",
            "avg actual",
            "total shortfall",
            "shifts logged",
        }.issubset(labels):
            section = "work_center"
            found_work_center_header = True
            continue
        if {
            "machine",
            "rated manpower / shift",
            "avg planned",
            "avg actual",
            "total shortfall",
            "shifts logged",
        }.issubset(labels):
            section = "machine"
            found_machine_header = True
            continue
        if not any(_text(value) for value in cells):
            section = None
            continue
        if section == "work_center" and len(cells) >= 5:
            if _field_name(cells[0]) in {"by work center", "work center"}:
                continue
            work_centers.append(
                {
                    "source_row": source_record["row_number"],
                    "name": _text(cells[0]),
                    "rated_manpower_per_shift": None,
                    "avg_planned": _number(cells[1]),
                    "avg_actual": _number(cells[2]),
                    "total_shortfall": _number(cells[3]),
                    "source_shifts_logged": _number(cells[4]),
                }
            )
        elif section == "machine" and len(cells) >= 6:
            machines.append(
                {
                    "source_row": source_record["row_number"],
                    "name": _text(cells[0]),
                    "rated_manpower_per_shift": _number(cells[1]),
                    "avg_planned": _number(cells[2]),
                    "avg_actual": _number(cells[3]),
                    "total_shortfall": _number(cells[4]),
                    "source_shifts_logged": _number(cells[5]),
                }
            )
    if not found_work_center_header or not found_machine_header:
        raise WorksheetReadError(
            "Worksheet 'Manpower Summary' is missing expected work-center or machine "
            "section headers."
        )
    return work_centers, machines


def _recomputed_manpower(
    entries: list[dict[str, Any]],
    *,
    group_field: str,
    machine_master: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        name = _normalized(entry.get(group_field))
        if name:
            groups[name].append(entry)
    master_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for machine in machine_master:
        name = _normalized(machine.get("machine"))
        if name:
            master_by_name[name].append(machine)
            if group_field == "machine":
                groups.setdefault(name, [])
    output = {}
    for name, records in groups.items():
        planned = [_number(item.get("planned_manpower")) for item in records]
        actual = [_number(item.get("actual_manpower")) for item in records]
        shortfall = [_number(item.get("manpower_shortfall")) for item in records]
        planned_values = [value for value in planned if value is not None]
        actual_values = [value for value in actual if value is not None]
        shortfall_values = [value for value in shortfall if value is not None]
        matches = master_by_name.get(name, [])
        output[name] = {
            "avg_planned": sum(planned_values) / len(planned_values) if planned_values else None,
            "avg_actual": sum(actual_values) / len(actual_values) if actual_values else None,
            "total_shortfall": sum(shortfall_values),
            "source_shifts_logged": len(actual_values),
            "dated_entry_count": sum(item["is_dated_entry"] for item in records),
            "entry_row_count": len(records),
            "rated_manpower_per_shift": (
                matches[0].get("manpower_per_shift") if len(matches) == 1 else None
            ),
            "master_match": (
                "matched" if len(matches) == 1 else "ambiguous" if len(matches) > 1 else "unmatched"
            ),
        }
    return output


def _compare_manpower_rows(
    source_rows: list[dict[str, Any]],
    recomputed: dict[str, dict[str, Any]],
    *,
    machine_level: bool,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    comparisons = {"matched": 0, "mismatched": 0, "unverifiable": 0}
    output = []
    numeric_fields = (
        "avg_planned",
        "avg_actual",
        "total_shortfall",
        "source_shifts_logged",
    )
    for row in source_rows:
        name = _text(row.get("name"))
        actual = recomputed.get(
            _normalized(name) or "",
            {
                "avg_planned": None,
                "avg_actual": None,
                "total_shortfall": 0,
                "source_shifts_logged": 0,
                "dated_entry_count": 0,
                "entry_row_count": 0,
                "rated_manpower_per_shift": None,
                "master_match": "unmatched",
            },
        )
        fields = []
        for field in numeric_fields:
            source_value = _number(row.get(field))
            computed_value = actual.get(field)
            if source_value is None and computed_value is None:
                fields.append("match")
            elif source_value is None or computed_value is None:
                fields.append("mismatch")
            elif isclose(float(source_value), float(computed_value), rel_tol=1e-8, abs_tol=1e-7):
                fields.append("match")
            else:
                fields.append("mismatch")
        status = "mismatched" if "mismatch" in fields else "matched" if actual else "unverifiable"
        comparisons[status] += 1
        rated_validation = "not_applicable"
        if machine_level:
            rated_source = _number(row.get("rated_manpower_per_shift"))
            rated_recomputed = _number(actual.get("rated_manpower_per_shift"))
            rated_validation = (
                "unverifiable"
                if actual.get("master_match") != "matched"
                or rated_source is None
                or rated_recomputed is None
                else "matched"
                if isclose(
                    float(rated_source),
                    float(rated_recomputed),
                    rel_tol=1e-8,
                    abs_tol=1e-7,
                )
                else "mismatched"
            )
        output.append(
            {
                **row,
                "recomputed": actual,
                "formula_reconciliation": status,
                "rated_manpower_reconciliation": rated_validation,
                "entry_row_count": actual.get("entry_row_count", 0),
                "dated_entry_count": actual.get("dated_entry_count", 0),
                "master_match": actual.get("master_match", "unmatched") if machine_level else None,
            }
        )
    return output, comparisons


def get_manpower_summary_analytics(
    *,
    level: str = "machine",
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    sort_by: str = "name",
    sort_order: str = "asc",
    refresh: bool = False,
) -> dict[str, Any]:
    if level not in {"machine", "work-center"}:
        raise ValueError("level must be 'machine' or 'work-center'.")
    entry_source, manpower_source, entries, machine_data, _ = _build_base(
        refresh, include_heat_reference=False
    )
    assert manpower_source is not None
    work_centers, machines = _summary_sections(manpower_source)
    computed_work_centers = _recomputed_manpower(
        entries, group_field="work_center", machine_master=machine_data["records"]
    )
    computed_machines = _recomputed_manpower(
        entries, group_field="machine", machine_master=machine_data["records"]
    )
    work_centers, work_center_checks = _compare_manpower_rows(
        work_centers, computed_work_centers, machine_level=False
    )
    machines, machine_checks = _compare_manpower_rows(
        machines, computed_machines, machine_level=True
    )
    selected = machines if level == "machine" else work_centers
    query = search.strip().casefold()
    selected = [
        record
        for record in selected
        if not query or query in str(record.get("name") or "").casefold()
    ]
    if sort_by not in _MANPOWER_SORTS:
        raise ValueError(f"Unsupported sort field: {sort_by}.")
    rows, count, page_count = _sort_and_page(
        selected,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        allowed=_MANPOWER_SORTS,
    )
    return {
        **_source_state(
            entries=entry_source,
            manpower_summary=manpower_source,
            machine_master={
                "spreadsheet_id": machine_data["spreadsheet_id"],
                "worksheet": machine_data["worksheet"],
                "fetched_at": machine_data.get("fetched_at"),
                "cache_hit": machine_data.get("cache_hit", False),
                "is_stale": machine_data.get("is_stale", False),
                "refresh_error": machine_data.get("refresh_error"),
            },
        ),
        "worksheet": manpower_source["worksheet"],
        "level": level,
        "formula_coverage": {
            "entry_source_first_row": 2,
            "entry_source_last_row": 301,
            "entry_source_rows": 300,
            "entry_rows_with_machine": sum(bool(_text(entry.get("machine"))) for entry in entries),
            "dated_entry_count": sum(entry["is_dated_entry"] for entry in entries),
        },
        "summary": {
            "work_center_count": len(work_centers),
            "machine_count": len(machines),
            "work_center_reconciliation": work_center_checks,
            "machine_reconciliation": machine_checks,
            "rated_manpower_mismatch_count": sum(
                row.get("rated_manpower_reconciliation") == "mismatched" for row in machines
            ),
            "actual_manpower_observation_count": sum(
                entry["actual_manpower_observed"] for entry in entries
            ),
            "entry_count": len(entries),
            "dated_entry_count": sum(entry["is_dated_entry"] for entry in entries),
            "undated_entry_count": sum(not entry["is_dated_entry"] for entry in entries),
            "source_shift_count_definition": (
                "The sheet counts rows with a nonblank Actual Manpower value, "
                "not every production entry."
            ),
        },
        "records": rows,
        "record_count": len(machines if level == "machine" else work_centers),
        "filtered_record_count": count,
        "page": page,
        "page_size": page_size,
        "page_count": page_count,
        "filter_options": {
            "levels": ["machine", "work-center"],
            "work_centers": _options(work_centers, "name"),
            "machines": _options(machines, "name"),
        },
        "validation_warnings": [
            *entry_source.get("validation_warnings", []),
            *manpower_source.get("validation_warnings", []),
        ],
    }
