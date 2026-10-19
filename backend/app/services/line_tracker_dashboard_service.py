"""Read-only analytics for the three ERC Mk-V dashboard worksheets."""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, datetime, timedelta
from math import floor, isclose
from typing import Any

from app.services.line_tracker_machine_assets_service import get_machine_master_analytics
from app.services.line_tracker_shift_manpower_service import get_shift_entries_analytics
from app.services.line_tracker_worksheet_service import (
    WorksheetReadError,
    get_line_tracker_worksheet_data,
)

_EXPECTED_IDS = {
    "production-dashboard": 1905823832,
    "dashboard": 1047718776,
    "summary": 311599185,
    "downtime-log": 1490231673,
}
_EXPECTED_HEADERS = {
    "production-dashboard": ["day#", "date", "output", "target", "downtime (hrs)", "fill %"],
    "dashboard": ["work center", "machines", "effective rated ct (sec)", "bottleneck?"],
    "summary": [
        "month",
        "downtime hours",
        "breakdown hours",
        "target nos",
        "actual nos",
        "fill %",
        "approx. availability %",
    ],
}
_DOWNTIME_MIRROR_START = 14569
_DOWNTIME_MIRROR_END = 14868
_READ_PAGE_SIZE = 200
_MAX_ROWS = 20000


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _date_value(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    serial = _number(value)
    if serial is not None:
        try:
            return date(1899, 12, 30) + timedelta(days=floor(serial))
        except OverflowError:
            return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _grid_source(key: str, *, refresh: bool) -> dict[str, Any]:
    first = get_line_tracker_worksheet_data(key, page=1, page_size=_READ_PAGE_SIZE, refresh=refresh)
    if first["worksheet"]["worksheet_id"] != _EXPECTED_IDS[key]:
        raise WorksheetReadError(
            f"Worksheet '{first['worksheet']['name']}' sheet ID did not match the audited source."
        )
    if first["record_count"] > _MAX_ROWS:
        raise WorksheetReadError(
            f"Worksheet '{first['worksheet']['name']}' exceeds the Phase 6 read limit."
        )
    records = list(first["records"])
    for page in range(2, first["page_count"] + 1):
        following = get_line_tracker_worksheet_data(
            key, page=page, page_size=_READ_PAGE_SIZE, refresh=False
        )
        records.extend(following["records"])
    return {**first, "records": records}


def _grid_rows(source: dict[str, Any]) -> dict[int, list[Any]]:
    return {int(record["row_number"]): record["values"][1:] for record in source["records"]}


def _validate_grid_header(
    source: dict[str, Any],
    *,
    row_number: int,
    expected: list[str],
) -> None:
    row = _grid_rows(source).get(row_number, [])
    actual = [str(value or "").strip().casefold() for value in row[: len(expected)]]
    if actual != expected:
        raise WorksheetReadError(
            f"Worksheet '{source['worksheet']['name']}' has an unexpected header at row "
            f"{row_number}."
        )


def _source_info(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "worksheet": source["worksheet"]["name"],
        "worksheet_id": source["worksheet"]["worksheet_id"],
        "fetched_at": source.get("fetched_at"),
        "cache_hit": source.get("cache_hit", False),
        "is_stale": source.get("is_stale", False),
        "refresh_error": source.get("refresh_error"),
    }


def _source_state(**sources: dict[str, Any]) -> dict[str, Any]:
    fetched = [source.get("fetched_at") for source in sources.values() if source.get("fetched_at")]
    errors = [source["refresh_error"] for source in sources.values() if source.get("refresh_error")]
    return {
        "source": "google-sheets",
        "spreadsheet_id": next(iter(sources.values()))["spreadsheet_id"],
        "sources": {key: _source_info(source) for key, source in sources.items()},
        "fetched_at": max(fetched) if fetched else None,
        "cache_hit": all(source.get("cache_hit", False) for source in sources.values()),
        "is_stale": any(source.get("is_stale", False) for source in sources.values()),
        "refresh_error": "; ".join(errors) or None,
        "validation_warnings": [
            warning
            for source in sources.values()
            for warning in source.get("validation_warnings", [])
        ],
    }


def _machine_source_from_result(result: dict[str, Any]) -> dict[str, Any]:
    info = result["sources"]["source"]
    return {
        "spreadsheet_id": result["spreadsheet_id"],
        "worksheet": {"name": info["worksheet"], "worksheet_id": info["worksheet_id"]},
        "fetched_at": info["fetched_at"],
        "cache_hit": info["cache_hit"],
        "is_stale": info["is_stale"],
        "refresh_error": info["refresh_error"],
        "validation_warnings": result.get("validation_warnings", []),
    }


def _entries_source_from_result(result: dict[str, Any]) -> dict[str, Any]:
    info = result["sources"]["entries"]
    return {
        "spreadsheet_id": result["spreadsheet_id"],
        "worksheet": {"name": info["worksheet"], "worksheet_id": info["worksheet_id"]},
        "fetched_at": info["fetched_at"],
        "cache_hit": info["cache_hit"],
        "is_stale": info["is_stale"],
        "refresh_error": info["refresh_error"],
        "validation_warnings": result.get("validation_warnings", []),
    }


def _downtime_source(*, refresh: bool) -> dict[str, Any]:
    key = "downtime-log"
    first = get_line_tracker_worksheet_data(key, page=1, page_size=_READ_PAGE_SIZE, refresh=refresh)
    if first["worksheet"]["worksheet_id"] != _EXPECTED_IDS[key]:
        raise WorksheetReadError(
            f"Worksheet '{first['worksheet']['name']}' sheet ID did not match the audited source."
        )
    if first["record_count"] > _MAX_ROWS:
        raise WorksheetReadError("Downtime Log exceeds the Phase 6 read limit.")
    records = list(first["records"])
    for page in range(2, first["page_count"] + 1):
        following = get_line_tracker_worksheet_data(
            key, page=page, page_size=_READ_PAGE_SIZE, refresh=False
        )
        records.extend(following["records"])
    return {
        **first,
        "headers": ["Row", *first["headers"]],
        "records": [
            {
                "row_number": int(record["row_number"]),
                "values": [record["row_number"], *record["values"]],
            }
            for record in records
        ],
    }


def _downtime_records(source: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    headers = [str(value or "").strip().casefold() for value in source.get("headers", [])[1:]]
    expected_headers = [
        "date",
        "line",
        "shift",
        "part",
        "stage",
        "machine",
        "downtime type (raw)",
        "downtime category",
        "breakdown type",
        "downtime mins",
        "prod loss nos",
        "prod target nos",
        "total prod nos",
        "rejection",
        "description",
    ]
    if headers[: len(expected_headers)] != expected_headers:
        raise WorksheetReadError("Downtime Log has an unexpected live header schema.")
    records: list[dict[str, Any]] = []
    mirror_source_rows = 0
    invalid_dates = 0
    for source_record in source["records"]:
        row_number = int(source_record["row_number"])
        if row_number >= _DOWNTIME_MIRROR_START:
            mirror_source_rows += 1
            continue
        row = source_record["values"][1:]
        parsed_date = _date_value(row[0])
        if parsed_date is None:
            invalid_dates += 1
            continue
        row.extend([None] * max(0, 13 - len(row)))
        records.append(
            {
                "source_row": row_number,
                "date": parsed_date.isoformat(),
                "line": _text(row[1]),
                "shift": _text(row[2]),
                "part": _text(row[3]),
                "stage": _text(row[4]),
                "machine": _text(row[5]),
                "category": _text(row[7]),
                "breakdown_type": _text(row[8]),
                "downtime_min": _number(row[9]),
                "production_loss": _number(row[10]),
                "target_nos": _number(row[11]),
                "actual_nos": _number(row[12]),
            }
        )
    grid_rows = source["worksheet"].get("grid_row_count") or 0
    formula_range_rows = max(
        0,
        min(grid_rows, _DOWNTIME_MIRROR_END) - _DOWNTIME_MIRROR_START + 1,
    )
    return records, {
        "mirror_formula_range_rows_excluded": formula_range_rows,
        "nonempty_mirror_source_rows_excluded": mirror_source_rows,
        "invalid_dates": invalid_dates,
    }


def _known_total(records: list[dict[str, Any]], field: str, *, scale: float = 1) -> dict[str, Any]:
    known = [record[field] for record in records if record[field] is not None]
    return {
        "total": sum(known) / scale if known else None,
        "known_count": len(known),
        "missing_count": len(records) - len(known),
    }


def _matches_filter(value: str | None, selected: str) -> bool:
    return (
        not selected
        or selected.casefold() == "all"
        or (value or "").casefold() == selected.casefold()
    )


def _daily_rollup(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        buckets[record["date"]].append(record)
    result: dict[str, dict[str, Any]] = {}
    for day, items in buckets.items():
        output = _known_total(items, "actual_nos")
        target = _known_total(items, "target_nos")
        downtime = _known_total(items, "downtime_min", scale=60)
        fill = (
            output["total"] / target["total"]
            if output["total"] is not None and target["total"] not in (None, 0)
            else None
        )
        result[day] = {
            "date": day,
            "output_nos": output["total"],
            "output_known_count": output["known_count"],
            "output_missing_count": output["missing_count"],
            "target_nos": target["total"],
            "target_known_count": target["known_count"],
            "target_missing_count": target["missing_count"],
            "downtime_hours": downtime["total"],
            "downtime_known_count": downtime["known_count"],
            "downtime_missing_count": downtime["missing_count"],
            "fill_fraction": fill,
            "source_record_count": len(items),
        }
    return result


def get_production_dashboard(
    *,
    date_from: str = "",
    date_to: str = "",
    stage: str = "",
    machine: str = "",
    refresh: bool = False,
) -> dict[str, Any]:
    dashboard_source = _grid_source("production-dashboard", refresh=refresh)
    _validate_grid_header(
        dashboard_source, row_number=7, expected=_EXPECTED_HEADERS["production-dashboard"]
    )
    downtime_source = _downtime_source(refresh=refresh)
    downtime_rows, data_quality = _downtime_records(downtime_source)
    if not downtime_rows:
        raise WorksheetReadError("Downtime Log contains no valid historical records.")

    controls = _grid_rows(dashboard_source).get(4, [])
    window_days = _number(controls[1] if len(controls) > 1 else None) or 15
    window_days = max(1, min(int(window_days), 30))
    latest = max(record["date"] for record in downtime_rows)
    latest_date = date.fromisoformat(latest)
    start_default = (latest_date - timedelta(days=window_days - 1)).isoformat()
    date_from = date_from or start_default
    date_to = date_to or latest
    try:
        start_date = date.fromisoformat(date_from)
        end_date = date.fromisoformat(date_to)
    except ValueError as exc:
        raise ValueError("date_from and date_to must use YYYY-MM-DD format.") from exc
    if start_date > end_date:
        raise ValueError("date_from must be on or before date_to.")
    source_stage_filter = _text(controls[8] if len(controls) > 8 else None) or "All"
    source_machine_filter = (
        _text((_grid_rows(dashboard_source).get(5, []) or [None] * 9)[8]) or "All"
    )
    requested_stage = stage or source_stage_filter
    requested_machine = machine or source_machine_filter
    selected = [
        record
        for record in downtime_rows
        if date_from <= record["date"] <= date_to
        and _matches_filter(record["stage"], requested_stage)
        and _matches_filter(record["machine"], requested_machine)
    ]
    daily = _daily_rollup(selected)
    ordered_days = sorted(daily)
    missing_dates: list[str] = []
    cursor = start_date
    while cursor <= end_date:
        key = cursor.isoformat()
        if key not in daily:
            missing_dates.append(key)
        cursor += timedelta(days=1)
    numeric_fill = [
        row["fill_fraction"] for row in daily.values() if row["fill_fraction"] is not None
    ]
    raw_rows = _grid_rows(dashboard_source)
    source_rows = []
    source_filters_match = (
        requested_stage.casefold() == source_stage_filter.casefold()
        and requested_machine.casefold() == source_machine_filter.casefold()
    )
    for source_row_number, row in raw_rows.items():
        if source_row_number < 8 or source_row_number > 37 or len(row) < 6:
            continue
        day_number = _number(row[0])
        if day_number is None or day_number <= 30 - window_days:
            continue
        source_date = _date_value(row[1])
        if source_date is None:
            source_date = latest_date - timedelta(days=30 - int(day_number))
        if source_date is None:
            continue
        source_day = source_date.isoformat()
        if source_filters_match and source_day in daily:
            source_rows.append(
                {
                    "date": source_day,
                    "output_nos": _number(row[2]),
                    "target_nos": _number(row[3]),
                    "downtime_hours": _number(row[4]),
                    "fill_fraction": _number(row[5]),
                }
            )
    checks = 0
    mismatches = 0
    for source_row in source_rows:
        calculated = daily[source_row["date"]]
        for field in ("output_nos", "target_nos", "downtime_hours", "fill_fraction"):
            expected = source_row[field]
            actual = calculated[field]
            if expected is not None and actual is not None:
                checks += 1
                if not isclose(expected, actual, rel_tol=1e-8, abs_tol=1e-6):
                    mismatches += 1
    source_summary_checks = 0
    source_summary_mismatches = 0
    source_avg_fill = _number((raw_rows.get(6, []) + [None] * 9)[8])
    source_total_downtime = _number((raw_rows.get(7, []) + [None] * 9)[8])
    computed_avg_fill = sum(numeric_fill) / len(numeric_fill) if numeric_fill else None
    computed_total_downtime = _known_total(selected, "downtime_min", scale=60)["total"]
    for expected, actual in (
        (source_avg_fill, computed_avg_fill),
        (source_total_downtime, computed_total_downtime),
    ):
        if expected is not None and actual is not None:
            source_summary_checks += 1
            if not isclose(expected, actual, rel_tol=1e-8, abs_tol=1e-6):
                source_summary_mismatches += 1
    return {
        **_source_state(production_dashboard=dashboard_source, downtime_log=downtime_source),
        "worksheet": dashboard_source["worksheet"],
        "date_from": date_from,
        "date_to": date_to,
        "source_window_days": window_days,
        "latest_log_date": latest,
        "stage_filter": stage or None,
        "machine_filter": machine or None,
        "filter_options": {
            "stages": sorted({item["stage"] for item in downtime_rows if item["stage"]}),
            "machines": sorted({item["machine"] for item in downtime_rows if item["machine"]}),
        },
        "records": [daily[key] for key in ordered_days],
        "missing_dates": missing_dates,
        "summary": {
            "source_record_count": len(selected),
            "output_nos": _known_total(selected, "actual_nos"),
            "target_nos": _known_total(selected, "target_nos"),
            "downtime_hours": _known_total(selected, "downtime_min", scale=60),
            "average_daily_fill_fraction": sum(numeric_fill) / len(numeric_fill)
            if numeric_fill
            else None,
            "days_with_fill": len(numeric_fill),
        },
        "reconciliation": {
            "source_daily_values_checked": checks,
            "mismatch_count": mismatches,
            "source_summary_values_checked": source_summary_checks,
            "source_summary_mismatch_count": source_summary_mismatches,
        },
        "data_quality": data_quality,
    }


def _dashboard_rows(source: dict[str, Any], start: int, end: int) -> dict[int, list[Any]]:
    return {
        row_number: row
        for row_number, row in _grid_rows(source).items()
        if start <= row_number <= end
    }


def _entry_summaries(entries: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in entries:
        center = _text(record.get("work_center"))
        if center:
            groups[center].append(record)
    result: dict[str, dict[str, Any]] = {}
    for center, records in groups.items():
        actual_ct = [
            row["actual_ct_sec"] for row in records if _number(row.get("actual_ct_sec")) is not None
        ]
        efficiency = [
            row["efficiency_fraction"]
            for row in records
            if _number(row.get("efficiency_fraction")) is not None
        ]
        availability = [
            row["availability_fraction"]
            for row in records
            if _number(row.get("availability_fraction")) is not None
        ]
        result[center] = {
            "avg_actual_ct_sec": sum(actual_ct) / len(actual_ct) if actual_ct else None,
            "actual_ct_count": len(actual_ct),
            "output_nos": _known_total(records, "output_qty"),
            "total_rejects": _known_total(records, "total_rejects"),
            "avg_efficiency_fraction": sum(efficiency) / len(efficiency) if efficiency else None,
            "efficiency_count": len(efficiency),
            "avg_availability_fraction": sum(availability) / len(availability)
            if availability
            else None,
            "availability_count": len(availability),
            "entry_count": len(records),
        }
    return result


def get_capacity_dashboard(*, refresh: bool = False) -> dict[str, Any]:
    dashboard_source = _grid_source("dashboard", refresh=refresh)
    _validate_grid_header(dashboard_source, row_number=5, expected=_EXPECTED_HEADERS["dashboard"])
    machine_data = get_machine_master_analytics(page_size=100, refresh=refresh)
    entry_data = get_shift_entries_analytics(page_size=100, refresh=refresh)
    machines = machine_data["records"]
    active_rated = [
        machine
        for machine in machines
        if _number(machine.get("rated_ct_sec")) is not None
        and _number(machine.get("rated_ct_sec")) > 0
        and (machine.get("status") or "").strip().casefold() == "active"
    ]
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    all_by_center: dict[str, int] = defaultdict(int)
    for machine in machines:
        center = _text(machine.get("work_center"))
        if center:
            all_by_center[center] += 1
    for machine in active_rated:
        groups[machine["work_center"]].append(machine)
    source_rows = _dashboard_rows(dashboard_source, 6, 14)
    source_actual_rows = _dashboard_rows(dashboard_source, 24, 32)
    entry_groups = _entry_summaries(entry_data["records"])
    capacity_rows: list[dict[str, Any]] = []
    bottleneck_values: list[float] = []
    checks = 0
    mismatches = 0
    actual_checks = 0
    actual_mismatches = 0
    for source_row_number, row in source_rows.items():
        if len(row) < 3 or not _text(row[0]):
            continue
        center = _text(row[0])
        members = groups.get(center, [])
        rates = [1 / float(item["rated_ct_sec"]) for item in members]
        effective_ct = 1 / sum(rates) if rates else None
        if effective_ct is not None:
            bottleneck_values.append(effective_ct)
        source_count, source_ct = _number(row[1]), _number(row[2])
        if source_count is not None and effective_ct is not None:
            checks += 1
            if not isclose(source_count, len(members), rel_tol=1e-9, abs_tol=1e-7):
                mismatches += 1
        if source_ct is not None and effective_ct is not None:
            checks += 1
            if not isclose(source_ct, effective_ct, rel_tol=1e-9, abs_tol=1e-7):
                mismatches += 1
        entry = entry_groups.get(center, {})
        capacity_rows.append(
            {
                "source_row": source_row_number,
                "work_center": center,
                "machine_count": all_by_center.get(center, 0),
                "rated_machine_count": len(members),
                "effective_rated_ct_sec": effective_ct,
                "source_machine_count": source_count,
                "source_effective_rated_ct_sec": source_ct,
                "is_bottleneck": False,
                **entry,
            }
        )
    actual_fields = (
        ("avg_actual_ct_sec", 1),
        ("output_nos", 2),
        ("total_rejects", 3),
        ("avg_efficiency_fraction", 4),
    )
    for row in source_actual_rows.values():
        center = _text(row[0] if row else None)
        if not center:
            continue
        entry = entry_groups.get(center, {})
        for field, column_index in actual_fields:
            source_value = _number(row[column_index] if column_index < len(row) else None)
            result_value = entry.get(field)
            if field in {"output_nos", "total_rejects"} and isinstance(result_value, dict):
                result_value = result_value["total"]
            if source_value is None:
                continue
            actual_checks += 1
            if result_value is None:
                if source_value != 0:
                    actual_mismatches += 1
            elif not isclose(source_value, result_value, rel_tol=1e-8, abs_tol=1e-5):
                actual_mismatches += 1
    maximum_ct = max(bottleneck_values) if bottleneck_values else None
    for row in capacity_rows:
        row["is_bottleneck"] = (
            row["effective_rated_ct_sec"] is not None
            and maximum_ct is not None
            and isclose(row["effective_rated_ct_sec"], maximum_ct, abs_tol=1e-9)
        )
    theoretical_output = 3600 / maximum_ct if maximum_ct else None
    return {
        **_source_state(
            dashboard=dashboard_source,
            machine_master=_machine_source_from_result(machine_data),
            entries=_entries_source_from_result(entry_data),
        ),
        "worksheet": dashboard_source["worksheet"],
        "records": capacity_rows,
        "summary": {
            "registered_machines": len(machines),
            "active_rated_machines": len(active_rated),
            "machines_excluded_from_active_rated_capacity": len(machines) - len(active_rated),
            "theoretical_bottleneck_ct_sec": maximum_ct,
            "theoretical_output_pcs_per_hour": theoretical_output,
            "theoretical_output_pcs_per_12_hour_shift": theoretical_output * 12
            if theoretical_output is not None
            else None,
        },
        "actual_performance": entry_groups,
        "reconciliation": {"source_values_checked": checks, "mismatch_count": mismatches},
        "actual_performance_reconciliation": {
            "source_values_checked": actual_checks,
            "mismatch_count": actual_mismatches,
        },
        "data_quality": {
            "capacity_formula_source_range": "Machine Master rows 2–28",
            "active_rated_machine_range_count": len(active_rated),
            "master_machine_count": len(machines),
        },
    }


def _period_aggregate(
    records: list[dict[str, Any]],
    *,
    period: str,
    days: int,
) -> dict[str, Any]:
    hours = _known_total(records, "downtime_min", scale=60)
    output = _known_total(records, "actual_nos")
    target = _known_total(records, "target_nos")
    breakdown_records = [
        record
        for record in records
        if (record.get("category") or "").strip().casefold() == "breakdown"
    ]
    breakdown_hours = _known_total(breakdown_records, "downtime_min", scale=60)
    fill = (
        output["total"] / target["total"]
        if output["total"] is not None and target["total"] not in (None, 0)
        else None
    )
    approximate_availability = (
        1 - hours["total"] / (days * 24 * 27) if hours["total"] is not None else None
    )
    return {
        "period": period,
        "downtime_hours": hours["total"],
        "downtime_known_count": hours["known_count"],
        "downtime_missing_count": hours["missing_count"],
        "breakdown_hours": breakdown_hours["total"],
        "breakdown_known_count": breakdown_hours["known_count"],
        "target_nos": target["total"],
        "target_known_count": target["known_count"],
        "target_missing_count": target["missing_count"],
        "actual_nos": output["total"],
        "actual_known_count": output["known_count"],
        "actual_missing_count": output["missing_count"],
        "fill_fraction": fill,
        "approx_availability_fraction": approximate_availability,
        "source_record_count": len(records),
    }


def _records_in_period(
    records: list[dict[str, Any]], start: date, end: date
) -> list[dict[str, Any]]:
    return [record for record in records if start.isoformat() <= record["date"] <= end.isoformat()]


def _reconcile(source_row: list[Any], computed: dict[str, Any]) -> dict[str, Any]:
    checks = 0
    mismatches = 0
    fields = (
        ("downtime_hours", 1),
        ("breakdown_hours", 2),
        ("target_nos", 3),
        ("actual_nos", 4),
        ("fill_fraction", 5),
        ("approx_availability_fraction", 6),
    )
    for field, index in fields:
        expected = _number(source_row[index] if index < len(source_row) else None)
        actual = computed[field]
        if expected is None:
            continue
        checks += 1
        if actual is None:
            if expected != 0:
                mismatches += 1
        elif not isclose(expected, actual, rel_tol=1e-8, abs_tol=1e-5):
            mismatches += 1
    return {"values_checked": checks, "mismatch_count": mismatches}


def get_dashboard_summary(
    *,
    date_from: str = "",
    date_to: str = "",
    refresh: bool = False,
) -> dict[str, Any]:
    summary_source = _grid_source("summary", refresh=refresh)
    _validate_grid_header(summary_source, row_number=5, expected=_EXPECTED_HEADERS["summary"])
    downtime_source = _downtime_source(refresh=refresh)
    downtime_rows, data_quality = _downtime_records(downtime_source)
    if not downtime_rows:
        raise WorksheetReadError("Downtime Log contains no valid historical records.")

    rows = _grid_rows(summary_source)
    headers = _EXPECTED_HEADERS["summary"]
    month_rows: list[dict[str, Any]] = []
    yearly_rows: list[dict[str, Any]] = []
    month_reconciliation = {"values_checked": 0, "mismatch_count": 0}
    year_reconciliation = {"values_checked": 0, "mismatch_count": 0}
    section = "months"
    for row_number in sorted(rows):
        row = rows[row_number]
        label = _text(row[0] if row else None)
        if label and label.casefold() == "year-wise":
            section = "years"
            continue
        if label and label.casefold() == "year" and row[1:7] == headers[1:]:
            continue
        if label and label.casefold() == "month" and row[:7] == headers:
            continue
        if section == "months" and label and len(label) == 7 and label[4] == "-":
            try:
                year, month = (int(part) for part in label.split("-"))
                start = date(year, month, 1)
            except ValueError:
                continue
            end = date(year, month, calendar.monthrange(year, month)[1])
            computed = _period_aggregate(
                _records_in_period(downtime_rows, start, end),
                period=label,
                days=end.day,
            )
            month_rows.append(computed)
            check = _reconcile(row, computed)
            month_reconciliation["values_checked"] += check["values_checked"]
            month_reconciliation["mismatch_count"] += check["mismatch_count"]
        elif section == "years" and label and label.isdigit() and len(label) == 4:
            year = int(label)
            start, end = date(year, 1, 1), date(year, 12, 31)
            computed = _period_aggregate(
                _records_in_period(downtime_rows, start, end),
                period=label,
                days=366 if calendar.isleap(year) else 365,
            )
            yearly_rows.append(computed)
            check = _reconcile(row, computed)
            year_reconciliation["values_checked"] += check["values_checked"]
            year_reconciliation["mismatch_count"] += check["mismatch_count"]

    all_dates = sorted(record["date"] for record in downtime_rows)
    date_from = date_from or all_dates[0]
    date_to = date_to or all_dates[-1]
    try:
        start_date, end_date = date.fromisoformat(date_from), date.fromisoformat(date_to)
    except ValueError as exc:
        raise ValueError("date_from and date_to must use YYYY-MM-DD format.") from exc
    if start_date > end_date:
        raise ValueError("date_from must be on or before date_to.")
    month_rows = [
        row for row in month_rows if row["period"] >= date_from[:7] and row["period"] <= date_to[:7]
    ]
    yearly_rows = [
        row
        for row in yearly_rows
        if row["period"] >= date_from[:4] and row["period"] <= date_to[:4]
    ]
    month_reconciliation = {"values_checked": 0, "mismatch_count": 0}
    year_reconciliation = {"values_checked": 0, "mismatch_count": 0}
    formula_zero_missing_downtime_periods: list[str] = []
    # Reconciliation remains for the complete source periods, independent of the display filter.
    for row_number, row in rows.items():
        label = _text(row[0] if row else None)
        if label and len(label) == 7 and label[4] == "-":
            match = next((item for item in _period_rows_for_label(downtime_rows, label)), None)
            if match is not None:
                source_downtime = _number(row[1] if len(row) > 1 else None)
                if (
                    source_downtime == 0
                    and match["downtime_hours"] is None
                    and match["downtime_missing_count"] > 0
                ):
                    formula_zero_missing_downtime_periods.append(label)
                check = _reconcile(row, match)
                month_reconciliation["values_checked"] += check["values_checked"]
                month_reconciliation["mismatch_count"] += check["mismatch_count"]
        elif label and label.isdigit() and len(label) == 4:
            year = int(label)
            match = _period_aggregate(
                _records_in_period(downtime_rows, date(year, 1, 1), date(year, 12, 31)),
                period=label,
                days=366 if calendar.isleap(year) else 365,
            )
            check = _reconcile(row, match)
            year_reconciliation["values_checked"] += check["values_checked"]
            year_reconciliation["mismatch_count"] += check["mismatch_count"]

    monthly_labels = {row["period"] for row in month_rows}
    start_month = date(start_date.year, start_date.month, 1)
    end_month = date(end_date.year, end_date.month, 1)
    missing_months: list[str] = []
    cursor = start_month
    while cursor <= end_month:
        label = cursor.strftime("%Y-%m")
        if label not in monthly_labels:
            missing_months.append(label)
        cursor = date(
            cursor.year + (cursor.month == 12), 1 if cursor.month == 12 else cursor.month + 1, 1
        )

    entries_data = get_shift_entries_analytics(page_size=100, refresh=refresh)
    availability = _entry_summaries(entries_data["records"])
    return {
        **_source_state(
            summary=summary_source,
            downtime_log=downtime_source,
            entries=_entries_source_from_result(entries_data),
        ),
        "worksheet": summary_source["worksheet"],
        "date_from": date_from,
        "date_to": date_to,
        "months": month_rows,
        "years": yearly_rows,
        "entry_availability_by_work_center": {
            center: {
                "average_fraction": result["avg_availability_fraction"],
                "shift_count": result["availability_count"],
            }
            for center, result in availability.items()
        },
        "missing_months": missing_months,
        "reconciliation": {
            "monthly": month_reconciliation,
            "yearly": year_reconciliation,
        },
        "data_quality": {
            **data_quality,
            "november_2024_source_records": sum(
                1 for record in downtime_rows if record["date"].startswith("2024-11")
            ),
            "historical_record_count": len(downtime_rows),
            "date_range": {"from": all_dates[0], "to": all_dates[-1]},
            "formula_zero_missing_downtime_periods": formula_zero_missing_downtime_periods,
        },
    }


def _period_rows_for_label(records: list[dict[str, Any]], label: str) -> list[dict[str, Any]]:
    year, month = (int(part) for part in label.split("-"))
    start = date(year, month, 1)
    end = date(year, month, calendar.monthrange(year, month)[1])
    return [
        _period_aggregate(
            _records_in_period(records, start, end),
            period=label,
            days=end.day,
        )
    ]
