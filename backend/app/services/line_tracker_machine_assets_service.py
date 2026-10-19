"""Read-only machine registry, consumables, capacity-change, and shutdown views."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date, datetime
from math import isclose, isfinite
from typing import Any

from app.services.line_tracker_worksheet_service import (
    WorksheetReadError,
    get_line_tracker_worksheet_data,
)

_KEYS = {
    "machine-consumables": ("Machine Consumables", 1208025434),
    "machine-master": ("Machine Master", 1022871279),
    "capacity-change-log": ("Capacity Change Log", 1408359762),
    "planned-shutdowns": ("Planned Shutdowns", 1171824600),
}
_MAX_PAGE_SIZE = 100
_READ_PAGE_SIZE = 200
_MAX_ROWS = 5000
_HEADERS = {
    "machine-master": (
        "Work Center",
        "Machine",
        "Current Rated CT (sec)",
        "Status",
        "Notes",
        "Commissioning Date",
        "Manpower Required (Rated) / Shift",
        "Decommissioned Date",
        "Output",
        "Hourly",
        "Shift",
        "Day",
        "85 %",
    ),
    "machine-consumables": (
        "Work Center",
        "Machine",
        "Consumable",
        "Category",
        "Typical Change Frequency",
        "Last Changed Date",
        "Next Due Date",
        "Notes",
    ),
    "capacity-change-log": (
        "Date Changed",
        "Work Center",
        "Machine",
        "Old Rated CT (sec)",
        "New Rated CT (sec)",
        "Reason / Notes",
    ),
    "planned-shutdowns": (
        "Start Date",
        "End Date",
        "Scope",
        "Scope Detail (Work Center or Machine)",
        "Hours Affected / Day",
        "Reason",
        "Notes",
    ),
}
_SORT_FIELDS = {
    "machine-master": {
        "source_row",
        "work_center",
        "machine",
        "rated_ct_sec",
        "status",
        "commissioning_date",
        "manpower_per_shift",
        "decommissioned_date",
        "output_per_minute",
        "hourly_capacity",
        "shift_capacity",
        "day_capacity",
        "capacity_at_85_percent",
    },
    "machine-consumables": {
        "source_row",
        "work_center",
        "machine",
        "consumable",
        "category",
        "change_frequency",
        "last_changed_date",
        "next_due_date",
        "due_status",
        "machine_match",
    },
    "capacity-change-log": {
        "source_row",
        "date_changed",
        "work_center",
        "machine",
        "old_rated_ct_sec",
        "new_rated_ct_sec",
        "percentage_change",
        "classification",
        "machine_match",
    },
    "planned-shutdowns": {
        "source_row",
        "start_date",
        "end_date",
        "scope",
        "scope_detail",
        "hours_affected_per_day",
        "duration_days",
        "estimated_hours",
        "classification",
        "date_range_valid",
    },
}


def _header(value: Any) -> str:
    return str(value or "").strip().casefold()


def _text(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _number(value: Any) -> int | float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float):
        return value if isfinite(value) else None
    cleaned = str(value).strip().replace(",", "")
    if not cleaned:
        return None
    try:
        number = float(cleaned)
    except ValueError:
        return None
    if not isfinite(number):
        return None
    return int(number) if number.is_integer() else number


def _date_value(value: Any) -> tuple[str | None, date | None]:
    text = _text(value)
    if not text:
        return None, None
    try:
        parsed = date.fromisoformat(text[:10])
    except ValueError:
        for pattern in ("%m/%d/%Y", "%d/%m/%Y", "%d-%b-%Y"):
            try:
                parsed = datetime.strptime(text, pattern).date()
                break
            except ValueError:
                continue
        else:
            return text, None
    return parsed.isoformat(), parsed


def _machine_key(work_center: Any, machine: Any) -> tuple[str, str] | None:
    center = _text(work_center)
    name = _text(machine)
    if not center or not name:
        return None
    return center.casefold(), name.casefold()


def _row(headers: list[str], values: list[Any]) -> dict[str, Any]:
    return {
        _header(name): values[index] if index < len(values) else None
        for index, name in enumerate(headers)
    }


def _source(key: str, *, refresh: bool) -> dict[str, Any]:
    name, expected_id = _KEYS[key]
    first = get_line_tracker_worksheet_data(key, page=1, page_size=_READ_PAGE_SIZE, refresh=refresh)
    if first["record_count"] > _MAX_ROWS:
        raise WorksheetReadError(f"Worksheet '{name}' exceeds the Phase 4 read limit.")
    if first["worksheet"]["worksheet_id"] != expected_id:
        raise WorksheetReadError(f"Worksheet '{name}' sheet ID did not match the audited source.")
    records = list(first["records"])
    for page in range(2, first["page_count"] + 1):
        following = get_line_tracker_worksheet_data(
            key, page=page, page_size=_READ_PAGE_SIZE, refresh=False
        )
        records.extend(following["records"])
    actual = {_header(item) for item in first["headers"]}
    missing = [item for item in _HEADERS[key] if _header(item) not in actual]
    if missing:
        raise WorksheetReadError(
            f"Worksheet '{name}' is missing expected headers: " + ", ".join(missing)
        )
    return {**first, "records": records}


def _source_state(**sources: dict[str, Any]) -> dict[str, Any]:
    fetched = [item.get("fetched_at") for item in sources.values() if item.get("fetched_at")]
    errors = [item["refresh_error"] for item in sources.values() if item.get("refresh_error")]
    return {
        "source": "google-sheets",
        "spreadsheet_id": next(iter(sources.values()))["spreadsheet_id"],
        "fetched_at": max(fetched) if fetched else None,
        "cache_hit": all(item.get("cache_hit", False) for item in sources.values()),
        "is_stale": any(item.get("is_stale", False) for item in sources.values()),
        "refresh_error": "; ".join(errors) or None,
        "sources": {
            key: {
                "worksheet": item["worksheet"]["name"],
                "worksheet_id": item["worksheet"]["worksheet_id"],
                "fetched_at": item.get("fetched_at"),
                "cache_hit": item.get("cache_hit", False),
                "is_stale": item.get("is_stale", False),
                "refresh_error": item.get("refresh_error"),
            }
            for key, item in sources.items()
        },
    }


def _is_instruction_row(values: list[Any]) -> bool:
    first = _text(values[0] if values else None)
    return bool(
        first
        and first.casefold().startswith(
            (
                "how to use",
                "how this works",
                "yellow cells are editable",
                "add a row per planned shutdown",
            )
        )
    )


def _parse_machines(source: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    machines: list[dict[str, Any]] = []
    warnings: list[str] = []
    for source_record in source["records"]:
        values = source_record["values"]
        if _is_instruction_row(values):
            continue
        data = _row(source["headers"], values)
        key = _machine_key(data.get("work center"), data.get("machine"))
        if not key:
            if any(_text(value) for value in values[:2]):
                warnings.append(
                    f"Machine Master row {source_record['row_number']} has an incomplete "
                    "machine key and was not joined."
                )
            continue
        ct = _number(data.get("current rated ct (sec)"))
        output = _number(data.get("output"))
        hourly = _number(data.get("hourly"))
        shift = _number(data.get("shift"))
        day_capacity = _number(data.get("day"))
        eighty_five = _number(data.get("85 %"))
        expected: dict[str, int | float | None] = {
            "output_per_minute": 60 / ct if ct is not None and ct > 0 else None,
            "hourly_capacity": 3600 / ct if ct is not None and ct > 0 else None,
            "shift_capacity": (3600 / ct) * 11 if ct is not None and ct > 0 else None,
            "day_capacity": (3600 / ct) * 22 if ct is not None and ct > 0 else None,
            "capacity_at_85_percent": (
                (3600 / ct) * 22 * 0.85 if ct is not None and ct > 0 else None
            ),
        }
        formula_columns = {
            "output_per_minute": output,
            "hourly_capacity": hourly,
            "shift_capacity": shift,
            "day_capacity": day_capacity,
            "capacity_at_85_percent": eighty_five,
        }
        checks = {
            field: (
                isclose(float(actual), float(expected[field]), rel_tol=1e-9, abs_tol=1e-7)
                if actual is not None and expected[field] is not None
                else None
            )
            for field, actual in formula_columns.items()
        }
        machines.append(
            {
                "source_row": source_record["row_number"],
                "work_center": _text(data.get("work center")),
                "machine": _text(data.get("machine")),
                "key": key,
                "rated_ct_sec": ct,
                "status": _text(data.get("status")),
                "notes": _text(data.get("notes")),
                "commissioning_date": _date_value(data.get("commissioning date"))[0],
                "manpower_per_shift": _number(data.get("manpower required (rated) / shift")),
                "decommissioned_date": _date_value(data.get("decommissioned date"))[0],
                **expected,
                "source_capacity": {
                    "output_per_minute": output,
                    "hourly_capacity": hourly,
                    "shift_capacity": shift,
                    "day_capacity": day_capacity,
                    "capacity_at_85_percent": eighty_five,
                },
                "capacity_formula_checks": checks,
                "capacity_validation": (
                    "verified"
                    if checks and all(value is True for value in checks.values())
                    else "incomplete"
                    if any(value is None for value in checks.values())
                    else "mismatch"
                ),
            }
        )
    keys = Counter(item["key"] for item in machines)
    for key, count in keys.items():
        if count > 1:
            warnings.append(
                f"Machine Master composite key {key[0]} / {key[1]} occurs {count} "
                "times; joins are ambiguous."
            )
    for item in machines:
        if item["capacity_validation"] == "mismatch":
            warnings.append(
                f"Machine Master row {item['source_row']} rated-capacity values do not "
                "match the verified formula assumptions."
            )
        if item["capacity_validation"] == "incomplete":
            warnings.append(
                f"Machine Master row {item['source_row']} lacks a valid cycle time or "
                "calculated capacity value."
            )
    return machines, warnings


def _parse_consumables(
    source: dict[str, Any], machines: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[str]]:
    master_index: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for machine in machines:
        master_index[machine["key"]].append(machine)
    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    today = date.today()
    for source_record in source["records"]:
        values = source_record["values"]
        if _is_instruction_row(values):
            continue
        data = _row(source["headers"], values)
        key = _machine_key(data.get("work center"), data.get("machine"))
        if not key:
            if any(_text(value) for value in values[:2]):
                warnings.append(
                    f"Machine Consumables row {source_record['row_number']} has an "
                    "incomplete machine key."
                )
            continue
        matches = master_index.get(key, [])
        last_text, last_date = _date_value(data.get("last changed date"))
        due_text, due_date = _date_value(data.get("next due date"))
        if _text(data.get("last changed date")) and last_date is None:
            warnings.append(
                f"Machine Consumables row {source_record['row_number']} has an invalid "
                "Last Changed Date."
            )
        if _text(data.get("next due date")) and due_date is None:
            warnings.append(
                f"Machine Consumables row {source_record['row_number']} has an invalid "
                "Next Due Date."
            )
        if due_date is None:
            due_status = "missing" if not due_text else "invalid"
        elif due_date < today:
            due_status = "past date"
        else:
            due_status = "dated"
        records.append(
            {
                "source_row": source_record["row_number"],
                "work_center": _text(data.get("work center")),
                "machine": _text(data.get("machine")),
                "consumable": _text(data.get("consumable")),
                "category": _text(data.get("category")),
                "change_frequency": _text(data.get("typical change frequency")),
                "last_changed_date": last_text,
                "next_due_date": due_text,
                "due_status": due_status,
                "notes": _text(data.get("notes")),
                "machine_match": "matched"
                if len(matches) == 1
                else "ambiguous"
                if matches
                else "unmatched",
                "machine_status": matches[0]["status"] if len(matches) == 1 else None,
                "machine_source_row": matches[0]["source_row"] if len(matches) == 1 else None,
            }
        )
        if len(matches) > 1:
            warnings.append(
                f"Machine Consumables row {source_record['row_number']} matches multiple "
                "Machine Master rows."
            )
        elif not matches:
            warnings.append(
                f"Machine Consumables row {source_record['row_number']} has no exact "
                "Machine Master key match."
            )
    if records and all(item["due_status"] == "missing" for item in records):
        warnings.append(
            "All consumable Last Changed Date and Next Due Date fields are blank; "
            "no due-date status can be inferred."
        )
    return records, warnings


def _event_classification(*values: Any) -> str:
    source_text = " ".join(_text(value) or "" for value in values).casefold()
    if re.search(r"\bexample\b", source_text):
        return "example"
    if re.search(r"\bconfirmed\b", source_text):
        return "confirmed"
    return "unverified"


def _parse_capacity_changes(
    source: dict[str, Any], machines: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[str]]:
    master_index: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for machine in machines:
        master_index[machine["key"]].append(machine)
    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    for source_record in source["records"]:
        values = source_record["values"]
        data = _row(source["headers"], values)
        wc, name = _text(data.get("work center")), _text(data.get("machine"))
        if not any((wc, name, _text(data.get("reason / notes")), _text(data.get("date changed")))):
            continue
        changed, changed_date = _date_value(data.get("date changed"))
        key = _machine_key(wc, name)
        matches = master_index.get(key, []) if key else []
        old, new = _number(data.get("old rated ct (sec)")), _number(data.get("new rated ct (sec)"))
        classification = _event_classification(data.get("reason / notes"))
        comparable = old is not None and new is not None and old > 0 and new > 0
        percentage = (
            ((new - old) / old * 100) if classification == "confirmed" and comparable else None
        )
        records.append(
            {
                "source_row": source_record["row_number"],
                "date_changed": changed,
                "work_center": wc,
                "machine": name,
                "old_rated_ct_sec": old,
                "new_rated_ct_sec": new,
                "reason_notes": _text(data.get("reason / notes")),
                "classification": classification,
                "machine_match": "matched"
                if len(matches) == 1
                else "ambiguous"
                if matches
                else "unmatched",
                "machine_source_row": matches[0]["source_row"] if len(matches) == 1 else None,
                "percentage_change": percentage,
                "date_valid": changed_date is not None,
                "cycle_times_comparable": comparable,
            }
        )
        if classification == "example":
            warnings.append(
                f"Capacity Change Log row {source_record['row_number']} is explicitly "
                "marked as an example, not operational history."
            )
        elif classification == "unverified":
            warnings.append(
                f"Capacity Change Log row {source_record['row_number']} is not explicitly "
                "confirmed as an operational change."
            )
        if key and len(matches) != 1:
            warnings.append(
                f"Capacity Change Log row {source_record['row_number']} does not resolve "
                "to one unique Machine Master composite key."
            )
        if not changed_date:
            warnings.append(
                f"Capacity Change Log row {source_record['row_number']} has an invalid change date."
            )
    return records, warnings


def _scopes_overlap(
    left: dict[str, Any], right: dict[str, Any], machines: list[dict[str, Any]]
) -> bool:
    left_scope = (left["scope"] or "").casefold()
    right_scope = (right["scope"] or "").casefold()
    if left_scope == "all machines" or right_scope == "all machines":
        return True
    if left_scope == right_scope == "work center":
        return (left["scope_detail"] or "").casefold() == (right["scope_detail"] or "").casefold()
    if left_scope == right_scope == "machine":
        return (left["scope_detail"] or "").casefold() == (right["scope_detail"] or "").casefold()
    machine_detail = left if left_scope == "machine" else right
    center_detail = right if machine_detail is left else left
    if (center_detail["scope"] or "").casefold() != "work center":
        return False
    matches = [
        item
        for item in machines
        if (item["machine"] or "").casefold() == (machine_detail["scope_detail"] or "").casefold()
    ]
    return (
        len(matches) == 1
        and (matches[0]["work_center"] or "").casefold()
        == (center_detail["scope_detail"] or "").casefold()
    )


def _parse_shutdowns(
    source: dict[str, Any], machines: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    allowed_scopes = {"all machines", "work center", "machine"}
    for source_record in source["records"]:
        values = source_record["values"]
        if _is_instruction_row(values):
            continue
        data = _row(source["headers"], values)
        if not any(_text(value) for value in values):
            continue
        start_text, start = _date_value(data.get("start date"))
        end_text, end = _date_value(data.get("end date"))
        scope = _text(data.get("scope"))
        scope_detail = _text(data.get("scope detail (work center or machine)"))
        hours = _number(data.get("hours affected / day"))
        reason, notes = _text(data.get("reason")), _text(data.get("notes"))
        if not any((start_text, end_text, scope, scope_detail, hours, reason, notes)):
            continue
        range_valid = bool(start and end and start <= end)
        scope_valid = bool(scope and scope.casefold() in allowed_scopes)
        hours_valid = hours is not None and 0 <= hours <= 24
        if (scope or "").casefold() == "all machines":
            scope_valid = scope_valid and not scope_detail
        elif (scope or "").casefold() in {"work center", "machine"}:
            scope_valid = scope_valid and bool(scope_detail)
        classification = _event_classification(reason, notes)
        duration_days = (end - start).days + 1 if range_valid and start and end else None
        estimated = (
            duration_days * hours
            if classification == "confirmed"
            and range_valid
            and scope_valid
            and hours_valid
            and duration_days is not None
            else None
        )
        machine_matches: list[dict[str, Any]] = []
        if scope and scope.casefold() == "machine" and scope_detail:
            machine_matches = [
                item
                for item in machines
                if (item["machine"] or "").casefold() == scope_detail.casefold()
            ]
        work_center_machine_matches = [
            item
            for item in machines
            if scope
            and scope.casefold() == "work center"
            and scope_detail
            and (item["work_center"] or "").casefold() == scope_detail.casefold()
        ]
        records.append(
            {
                "source_row": source_record["row_number"],
                "start_date": start_text,
                "end_date": end_text,
                "scope": scope,
                "scope_detail": scope_detail,
                "hours_affected_per_day": hours,
                "reason": reason,
                "notes": notes,
                "classification": classification,
                "date_range_valid": range_valid,
                "scope_valid": scope_valid,
                "hours_valid": hours_valid,
                "duration_days": duration_days,
                "estimated_hours": estimated,
                "overlaps_source_rows": [],
                "linked_machine_keys": [
                    {
                        "work_center": item["work_center"],
                        "machine": item["machine"],
                        "source_row": item["source_row"],
                    }
                    for item in (
                        machine_matches
                        if len(machine_matches) == 1
                        else work_center_machine_matches
                    )
                ],
                "machine_link_status": (
                    "matched"
                    if scope and scope.casefold() == "machine" and len(machine_matches) == 1
                    else "ambiguous"
                    if scope and scope.casefold() == "machine" and len(machine_matches) > 1
                    else "work-center scope"
                    if work_center_machine_matches
                    else "not machine-specific"
                ),
            }
        )
        if classification == "example":
            warnings.append(
                f"Planned Shutdowns row {source_record['row_number']} is explicitly an "
                "example, not a confirmed shutdown."
            )
        elif classification == "unverified":
            warnings.append(
                f"Planned Shutdowns row {source_record['row_number']} is not explicitly "
                "confirmed as an operational schedule."
            )
        if not range_valid:
            warnings.append(
                f"Planned Shutdowns row {source_record['row_number']} has missing, "
                "invalid, or reversed dates."
            )
        if not scope_valid:
            warnings.append(
                f"Planned Shutdowns row {source_record['row_number']} has an invalid "
                "or incomplete scope."
            )
        if not hours_valid:
            warnings.append(
                f"Planned Shutdowns row {source_record['row_number']} Hours Affected / "
                "Day is not a valid 0-24 hour value."
            )
        if scope and scope.casefold() == "machine" and len(machine_matches) != 1:
            warnings.append(
                f"Planned Shutdowns row {source_record['row_number']} machine scope "
                "does not resolve to one unique machine name."
            )

    for index, left in enumerate(records):
        if not left["date_range_valid"] or left["classification"] == "example":
            continue
        left_start = date.fromisoformat(left["start_date"])
        left_end = date.fromisoformat(left["end_date"])
        for right in records[index + 1 :]:
            if not right["date_range_valid"] or right["classification"] == "example":
                continue
            right_start = date.fromisoformat(right["start_date"])
            right_end = date.fromisoformat(right["end_date"])
            if (
                left_start <= right_end
                and right_start <= left_end
                and _scopes_overlap(left, right, machines)
            ):
                left["overlaps_source_rows"].append(right["source_row"])
                right["overlaps_source_rows"].append(left["source_row"])
    for item in records:
        item.setdefault("overlaps_source_rows", [])
        if item["overlaps_source_rows"]:
            warnings.append(
                f"Planned Shutdowns row {item['source_row']} overlaps another "
                "non-example schedule; affected hours are not combined."
            )
    return records, warnings


def _source_rows(source: dict[str, Any]) -> list[dict[str, Any]]:
    return [{"row_number": row["row_number"], "values": row["values"]} for row in source["records"]]


def _options(records: list[dict[str, Any]], field: str) -> list[str]:
    return sorted({record[field] for record in records if record.get(field)}, key=str.casefold)


def _matches(
    record: dict[str, Any],
    *,
    search: str,
    filters: dict[str, str],
) -> bool:
    if (
        search
        and search.casefold()
        not in " ".join(str(value) for value in record.values() if value is not None).casefold()
    ):
        return False
    return all(
        not selected or (str(record.get(field) or "").casefold() == selected.casefold())
        for field, selected in filters.items()
    )


def _page(
    records: list[dict[str, Any]],
    *,
    page: int,
    page_size: int,
    search: str,
    filters: dict[str, str],
    sort_by: str,
    sort_order: str,
    kind: str,
) -> tuple[list[dict[str, Any]], int, int]:
    if page < 1:
        raise ValueError("Page number must be at least 1.")
    if not 1 <= page_size <= _MAX_PAGE_SIZE:
        raise ValueError(f"Page size must be between 1 and {_MAX_PAGE_SIZE}.")
    if sort_by not in _SORT_FIELDS[kind]:
        raise ValueError(f"Unsupported sort field: {sort_by}.")
    if sort_order not in {"asc", "desc"}:
        raise ValueError("Sort order must be 'asc' or 'desc'.")
    filtered = [item for item in records if _matches(item, search=search.strip(), filters=filters)]
    filtered.sort(
        key=lambda item: (
            item.get(sort_by) is None,
            item.get(sort_by)
            if isinstance(item.get(sort_by), int | float)
            else str(item.get(sort_by) or "").casefold(),
            item["source_row"],
        ),
        reverse=sort_order == "desc",
    )
    count = len(filtered)
    start = (page - 1) * page_size
    return filtered[start : start + page_size], count, (count + page_size - 1) // page_size


def _base(
    source: dict[str, Any],
    *,
    records: list[dict[str, Any]],
    page_rows: list[dict[str, Any]],
    page: int,
    page_size: int,
    filtered_count: int,
    page_count: int,
    warnings: list[str],
) -> dict[str, Any]:
    return {
        **_source_state(source=source),
        "worksheet": source["worksheet"],
        "records": [
            {key: value for key, value in item.items() if key != "key"} for item in page_rows
        ],
        "record_count": len(records),
        "filtered_record_count": filtered_count,
        "page": page,
        "page_size": page_size,
        "page_count": page_count,
        "source_headers": source["headers"],
        "source_records": _source_rows(source),
        "source_context_rows": source.get("source_context_rows", []),
        "source_record_count": source["record_count"],
        "validation_warnings": warnings,
    }


def _get_machines(*, refresh: bool) -> tuple[dict[str, Any], list[dict[str, Any]], list[str]]:
    source = _source("machine-master", refresh=refresh)
    records, warnings = _parse_machines(source)
    return source, records, warnings


def get_machine_master_analytics(
    *,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    work_center: str = "",
    status: str = "",
    sort_by: str = "source_row",
    sort_order: str = "asc",
    refresh: bool = False,
) -> dict[str, Any]:
    source, records, warnings = _get_machines(refresh=refresh)
    rows, count, pages = _page(
        records,
        page=page,
        page_size=page_size,
        search=search,
        filters={"work_center": work_center, "status": status},
        sort_by=sort_by,
        sort_order=sort_order,
        kind="machine-master",
    )
    counts = Counter(record["capacity_validation"] for record in records)
    return {
        **_base(
            source,
            records=records,
            page_rows=rows,
            page=page,
            page_size=page_size,
            filtered_count=count,
            page_count=pages,
            warnings=warnings,
        ),
        "summary": {
            "machine_count": len(records),
            "unique_machine_key_count": len({item["key"] for item in records}),
            "duplicate_key_count": sum(
                value - 1
                for value in Counter(item["key"] for item in records).values()
                if value > 1
            ),
            "status_counts": dict(Counter(item["status"] or "Unspecified" for item in records)),
            "capacity_validation_counts": dict(counts),
            "formula_assumptions": {
                "minutes_per_hour": 60,
                "hours_per_shift": 11,
                "shifts_per_day": 2,
                "rated_day_factor": 0.85,
            },
        },
        "filter_options": {
            "work_centers": _options(records, "work_center"),
            "statuses": _options(records, "status"),
        },
    }


def get_machine_consumables_analytics(
    *,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    work_center: str = "",
    category: str = "",
    due_status: str = "",
    machine: str = "",
    sort_by: str = "source_row",
    sort_order: str = "asc",
    refresh: bool = False,
) -> dict[str, Any]:
    machine_source, machines, machine_warnings = _get_machines(refresh=refresh)
    source = _source("machine-consumables", refresh=refresh)
    records, warnings = _parse_consumables(source, machines)
    rows, count, pages = _page(
        records,
        page=page,
        page_size=page_size,
        search=search,
        filters={
            "work_center": work_center,
            "category": category,
            "due_status": due_status,
            "machine": machine,
        },
        sort_by=sort_by,
        sort_order=sort_order,
        kind="machine-consumables",
    )
    return {
        **_base(
            source,
            records=records,
            page_rows=rows,
            page=page,
            page_size=page_size,
            filtered_count=count,
            page_count=pages,
            warnings=machine_warnings + warnings,
        ),
        **_source_state(machine_master=machine_source, consumables=source),
        "summary": {
            "consumable_record_count": len(records),
            "machine_key_match_count": sum(item["machine_match"] == "matched" for item in records),
            "missing_last_changed_date_count": sum(
                item["last_changed_date"] is None for item in records
            ),
            "missing_next_due_date_count": sum(item["due_status"] == "missing" for item in records),
            "past_date_count": sum(item["due_status"] == "past date" for item in records),
        },
        "filter_options": {
            "work_centers": _options(records, "work_center"),
            "categories": _options(records, "category"),
            "due_statuses": _options(records, "due_status"),
        },
    }


def get_capacity_change_analytics(
    *,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    classification: str = "",
    work_center: str = "",
    machine: str = "",
    sort_by: str = "source_row",
    sort_order: str = "asc",
    refresh: bool = False,
) -> dict[str, Any]:
    machine_source, machines, machine_warnings = _get_machines(refresh=refresh)
    source = _source("capacity-change-log", refresh=refresh)
    records, warnings = _parse_capacity_changes(source, machines)
    rows, count, pages = _page(
        records,
        page=page,
        page_size=page_size,
        search=search,
        filters={"classification": classification, "work_center": work_center, "machine": machine},
        sort_by=sort_by,
        sort_order=sort_order,
        kind="capacity-change-log",
    )
    return {
        **_base(
            source,
            records=records,
            page_rows=rows,
            page=page,
            page_size=page_size,
            filtered_count=count,
            page_count=pages,
            warnings=machine_warnings + warnings,
        ),
        **_source_state(machine_master=machine_source, capacity_change_log=source),
        "summary": {
            "example_count": sum(item["classification"] == "example" for item in records),
            "confirmed_count": sum(item["classification"] == "confirmed" for item in records),
            "unverified_count": sum(item["classification"] == "unverified" for item in records),
        },
        "filter_options": {
            "classifications": _options(records, "classification"),
            "work_centers": _options(records, "work_center"),
            "machines": _options(records, "machine"),
        },
    }


def get_planned_shutdown_analytics(
    *,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    classification: str = "",
    scope: str = "",
    sort_by: str = "source_row",
    sort_order: str = "asc",
    refresh: bool = False,
) -> dict[str, Any]:
    machine_source, machines, machine_warnings = _get_machines(refresh=refresh)
    source = _source("planned-shutdowns", refresh=refresh)
    records, warnings = _parse_shutdowns(source, machines)
    rows, count, pages = _page(
        records,
        page=page,
        page_size=page_size,
        search=search,
        filters={"classification": classification, "scope": scope},
        sort_by=sort_by,
        sort_order=sort_order,
        kind="planned-shutdowns",
    )
    return {
        **_base(
            source,
            records=records,
            page_rows=rows,
            page=page,
            page_size=page_size,
            filtered_count=count,
            page_count=pages,
            warnings=machine_warnings + warnings,
        ),
        **_source_state(machine_master=machine_source, planned_shutdowns=source),
        "summary": {
            "example_count": sum(item["classification"] == "example" for item in records),
            "confirmed_count": sum(item["classification"] == "confirmed" for item in records),
            "unverified_count": sum(item["classification"] == "unverified" for item in records),
            "valid_date_range_count": sum(item["date_range_valid"] for item in records),
            "overlap_count": sum(bool(item["overlaps_source_rows"]) for item in records),
            "estimated_confirmed_hours": None,
        },
        "filter_options": {
            "classifications": _options(records, "classification"),
            "scopes": _options(records, "scope"),
        },
    }
