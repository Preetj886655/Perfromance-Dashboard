"""Read-only raw-material heat planning and heat/lot traceability analytics."""

from __future__ import annotations

from collections import defaultdict
from math import isclose
from typing import Any

from app.services.line_tracker_worksheet_service import (
    WorksheetReadError,
    get_line_tracker_worksheet_data,
)

_PLAN_KEY = "rm-heat-plan-vs-actual"
_REFERENCE_KEY = "heat-lot-number-reference"
_EXPECTED_IDS = {
    _PLAN_KEY: 217356585,
    _REFERENCE_KEY: 1881319427,
}
_MAX_PAGE_SIZE = 100
_READ_PAGE_SIZE = 200
_MAX_ROWS = 5000
_PLAN_NUMERIC_FIELDS = (
    "rm_qty_mt",
    "plan_cut_bar_nos",
    "actual_bar_cropper_ok",
    "actual_endbit_scrap",
    "actual_acm_turning_ok",
    "actual_acm_turning_rej",
    "plan_clip_prod_nos",
    "actual_forming_ok",
    "actual_forming_rej",
    "plan_final_supply_nos",
    "yield_vs_plan_fraction",
    "balance_reconciliation",
)
_ACTUAL_FIELDS = (
    "actual_bar_cropper_ok",
    "actual_endbit_scrap",
    "actual_acm_turning_ok",
    "actual_acm_turning_rej",
    "actual_forming_ok",
    "actual_forming_rej",
)
_PLAN_SORT_FIELDS = {
    "source_row": "source_row",
    "heat_no": "heat_no",
    "lot_no": "lot_no",
    "customer": "customer",
    "supplier": "supplier",
    "rm_qty_mt": "rm_qty_mt",
    "yield_vs_plan_fraction": "yield_vs_plan_fraction",
    "balance_reconciliation": "balance_reconciliation",
    "source_batch": "source_batch",
    "reference_status": "reference_status",
}
_REFERENCE_SORT_FIELDS = {
    "source_row": "source_row",
    "heat_no": "heat_no",
    "lot_no": "lot_no",
    "customer": "customer",
    "supplier": "supplier",
    "rm_qty_mt": "rm_qty_mt",
    "source_batch": "source_batch",
    "plan_usage": "plan_usage",
}
_PLAN_HEADERS = {
    "customer": "customer",
    "supplier": "supplier",
    "heat no.": "heat_no",
    "lot no.": "lot_no",
    "rm qty (mt)": "rm_qty_mt",
    "plan: cut bar (nos)": "plan_cut_bar_nos",
    "actual: bar cropper ok": "actual_bar_cropper_ok",
    "actual: endbit scrap": "actual_endbit_scrap",
    "actual: acm/turning ok": "actual_acm_turning_ok",
    "actual: acm/turning rej": "actual_acm_turning_rej",
    "plan: clip prod (nos)": "plan_clip_prod_nos",
    "actual: forming ok": "actual_forming_ok",
    "actual: forming rej": "actual_forming_rej",
    "plan: final supply (nos)": "plan_final_supply_nos",
    "yield vs plan %": "yield_vs_plan_fraction",
    "balance / reconciliation": "balance_reconciliation",
    "source batch": "source_batch",
}
_REFERENCE_HEADERS = {
    "heat no.": "heat_no",
    "lot no.": "lot_no",
    "customer": "customer",
    "supplier": "supplier",
    "rm qty (mt)": "rm_qty_mt",
    "source batch": "source_batch",
}
_SUMMARY_LABELS = {
    "total rm qty planned (mt)": "rm_qty_mt",
    "total planned final supply (nos)": "plan_final_supply_nos",
    "total actual forming ok (nos)": "actual_forming_ok",
}


def _normalise_header(value: Any) -> str:
    return str(value or "").strip().casefold()


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _number(value: Any) -> int | float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return value if value == value else None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


def _identifier(value: Any) -> str | None:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return _text(value)


def _join_part(value: Any) -> str | None:
    """Trim and case-fold identifiers; keep punctuation and leading zeroes intact."""
    return _text(value).casefold() if _text(value) else None


def _composite_key(heat_no: Any, lot_no: Any) -> tuple[str, str] | None:
    heat = _join_part(heat_no)
    lot = _join_part(lot_no)
    return (heat, lot) if heat and lot else None


def _row_dict(headers: list[str], values: list[Any]) -> dict[str, Any]:
    return {
        _normalise_header(header): values[index] if index < len(values) else None
        for index, header in enumerate(headers)
    }


def _read_all_rows(worksheet_key: str, *, refresh: bool) -> dict[str, Any]:
    first = get_line_tracker_worksheet_data(
        worksheet_key,
        page=1,
        page_size=_READ_PAGE_SIZE,
        refresh=refresh,
    )
    if first["record_count"] > _MAX_ROWS:
        raise WorksheetReadError(
            f"Worksheet '{first['worksheet']['name']}' exceeds the Phase 3 read limit."
        )
    if first["worksheet"]["worksheet_id"] != _EXPECTED_IDS[worksheet_key]:
        raise WorksheetReadError(
            f"Worksheet '{first['worksheet']['name']}' sheet ID did not match the audited source."
        )
    records = list(first["records"])
    for page in range(2, first["page_count"] + 1):
        next_page = get_line_tracker_worksheet_data(
            worksheet_key,
            page=page,
            page_size=_READ_PAGE_SIZE,
            refresh=False,
        )
        records.extend(next_page["records"])
    return {**first, "records": records}


def _source_state(**sources: dict[str, Any]) -> dict[str, Any]:
    fetched_at = [
        source.get("fetched_at") for source in sources.values() if source.get("fetched_at")
    ]
    errors = [source["refresh_error"] for source in sources.values() if source.get("refresh_error")]
    return {
        "source": "google-sheets",
        "spreadsheet_id": next(iter(sources.values()))["spreadsheet_id"],
        "fetched_at": max(fetched_at) if fetched_at else None,
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


def _validate_headers(source: dict[str, Any], expected: dict[str, str]) -> None:
    actual = {_normalise_header(header) for header in source["headers"]}
    missing = [header for header in expected if header not in actual]
    if missing:
        raise WorksheetReadError(
            f"Worksheet '{source['worksheet']['name']}' is missing expected headers: "
            + ", ".join(missing)
        )


def _source_rows(source: dict[str, Any]) -> list[dict[str, Any]]:
    return [{"row_number": row["row_number"], "values": row["values"]} for row in source["records"]]


def _has_numeric_plan_value(row: dict[str, Any]) -> bool:
    return any(
        _number(row.get(header)) is not None
        for header, field in _PLAN_HEADERS.items()
        if field in _PLAN_NUMERIC_FIELDS
    )


def _parse_plan_rows(
    source: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    _validate_headers(source, _PLAN_HEADERS)
    plan_rows: list[dict[str, Any]] = []
    raw_rows = _source_rows(source)
    warnings: list[str] = []

    for source_record in source["records"]:
        row = _row_dict(source["headers"], source_record["values"])
        customer = _text(row.get("customer"))
        heat_no = _identifier(row.get("heat no."))
        lot_no = _identifier(row.get("lot no."))
        if customer and customer.casefold() == "summary":
            break
        if not (_has_numeric_plan_value(row) or (heat_no and lot_no)):
            continue
        if customer and customer.casefold() == "total":
            continue

        record = {
            "source_row": source_record["row_number"],
            "customer": customer,
            "supplier": _text(row.get("supplier")),
            "heat_no": heat_no,
            "lot_no": lot_no,
            "rm_qty_mt": _number(row.get("rm qty (mt)")),
            "plan_cut_bar_nos": _number(row.get("plan: cut bar (nos)")),
            "actual_bar_cropper_ok": _number(row.get("actual: bar cropper ok")),
            "actual_endbit_scrap": _number(row.get("actual: endbit scrap")),
            "actual_acm_turning_ok": _number(row.get("actual: acm/turning ok")),
            "actual_acm_turning_rej": _number(row.get("actual: acm/turning rej")),
            "plan_clip_prod_nos": _number(row.get("plan: clip prod (nos)")),
            "actual_forming_ok": _number(row.get("actual: forming ok")),
            "actual_forming_rej": _number(row.get("actual: forming rej")),
            "plan_final_supply_nos": _number(row.get("plan: final supply (nos)")),
            "yield_vs_plan_fraction": _number(row.get("yield vs plan %")),
            "balance_reconciliation": _number(row.get("balance / reconciliation")),
            "source_batch": _text(row.get("source batch")),
            "reference_status": "incomplete_key",
            "reference_row_numbers": [],
            "computed_yield_fraction": None,
            "yield_source_matches_calculation": None,
            "has_actual_values": any(
                _number(row.get(field)) is not None
                for field in (
                    "actual: bar cropper ok",
                    "actual: endbit scrap",
                    "actual: acm/turning ok",
                    "actual: acm/turning rej",
                    "actual: forming ok",
                    "actual: forming rej",
                )
            ),
        }
        planned_clip = record["plan_clip_prod_nos"]
        actual_forming = record["actual_forming_ok"]
        if (
            record["yield_vs_plan_fraction"] is not None
            and planned_clip not in (None, 0)
            and actual_forming is not None
        ):
            record["computed_yield_fraction"] = actual_forming / planned_clip
            record["yield_source_matches_calculation"] = isclose(
                record["yield_vs_plan_fraction"],
                record["computed_yield_fraction"],
                rel_tol=1e-10,
                abs_tol=1e-12,
            )
        if not heat_no or not lot_no:
            warnings.append(
                f"Plan source row {source_record['row_number']} is missing a heat or lot "
                "identifier; "
                "it is retained but not joined on Heat No. alone."
            )
        plan_rows.append(record)
    return plan_rows, raw_rows, warnings


def _parse_reference_rows(
    source: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    _validate_headers(source, _REFERENCE_HEADERS)
    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    section_started = False
    crosswalk_started = False
    crosswalk: list[dict[str, Any]] = []

    for source_record in source["records"]:
        values = source_record["values"]
        first = _text(values[0]) if values else None
        second = _text(values[1]) if len(values) > 1 else None
        folded_first = first.casefold() if first else ""
        folded_second = second.casefold() if second else ""

        if folded_first == "distinct lot numbers":
            section_started = True
            continue
        if section_started and folded_first == "lot no." and folded_second == "heats assigned":
            crosswalk_started = True
            continue
        if section_started:
            if crosswalk_started and first and second:
                lot_no = _identifier(first)
                heat_no = _identifier(second)
                if lot_no and lot_no.casefold() != "(no lot assigned)":
                    crosswalk.append(
                        {
                            "source_row": source_record["row_number"],
                            "heat_no": heat_no,
                            "lot_no": lot_no,
                            "rm_qty_mt": _number(values[2] if len(values) > 2 else None),
                            "key": _composite_key(heat_no, lot_no),
                        }
                    )
            continue

        row = _row_dict(source["headers"], values)
        heat_no = _identifier(row.get("heat no."))
        lot_no = _identifier(row.get("lot no."))
        rm_qty_mt = _number(row.get("rm qty (mt)"))
        customer = _text(row.get("customer"))
        if (heat_no and heat_no.casefold() == "bar cropper") or (
            customer and customer.casefold() == "total"
        ):
            continue
        if not (heat_no or lot_no or rm_qty_mt is not None):
            continue
        records.append(
            {
                "source_row": source_record["row_number"],
                "heat_no": heat_no,
                "lot_no": lot_no,
                "customer": customer,
                "supplier": _text(row.get("supplier")),
                "rm_qty_mt": rm_qty_mt,
                "source_batch": _text(row.get("source batch")),
                "plan_usage": "incomplete_key",
                "plan_row_numbers": [],
            }
        )
        if not heat_no or not lot_no:
            warnings.append(
                f"Reference source row {source_record['row_number']} is missing a heat or lot "
                "identifier; it is not inferred as a composite-key match."
            )
    if not section_started:
        warnings.append(
            "The expected 'Distinct Lot Numbers' cross-reference section was not found."
        )
    return records, crosswalk, warnings


def _index_by_key(records: list[dict[str, Any]]) -> dict[tuple[str, str], list[dict[str, Any]]]:
    index: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        key = _composite_key(record.get("heat_no"), record.get("lot_no"))
        if key:
            index[key].append(record)
    return index


def _consistency_differences(
    plan: dict[str, Any], reference: dict[str, Any], key: tuple[str, str]
) -> list[dict[str, Any]]:
    differences = []
    for field in ("customer", "supplier", "source_batch"):
        left = _text(plan.get(field))
        right = _text(reference.get(field))
        if left and right and left.casefold() != right.casefold():
            differences.append(
                {
                    "heat_no": plan["heat_no"],
                    "lot_no": plan["lot_no"],
                    "field": field,
                    "plan_value": left,
                    "reference_value": right,
                }
            )
    plan_qty = plan.get("rm_qty_mt")
    reference_qty = reference.get("rm_qty_mt")
    if (
        plan_qty is not None
        and reference_qty is not None
        and not isclose(plan_qty, reference_qty, rel_tol=1e-9, abs_tol=1e-6)
    ):
        differences.append(
            {
                "heat_no": plan["heat_no"],
                "lot_no": plan["lot_no"],
                "field": "rm_qty_mt",
                "plan_value": plan_qty,
                "reference_value": reference_qty,
            }
        )
    return differences


def _link_plan_and_reference(
    plan_rows: list[dict[str, Any]],
    reference_rows: list[dict[str, Any]],
    crosswalk: list[dict[str, Any]],
) -> dict[str, Any]:
    plan_index = _index_by_key(plan_rows)
    reference_index = _index_by_key(reference_rows)
    consistency_differences: list[dict[str, Any]] = []
    exact_match_count = 0
    ambiguous_plan_count = 0
    unmatched_plan_keys: list[dict[str, str]] = []
    ambiguous_plan_keys: list[dict[str, str]] = []

    for key, plan_group in plan_index.items():
        reference_group = reference_index.get(key, [])
        if len(plan_group) > 1 or len(reference_group) > 1:
            ambiguous_plan_count += len(plan_group)
            ambiguous_plan_keys.append({"heat_no": key[0], "lot_no": key[1]})
            for plan in plan_group:
                plan["reference_status"] = "ambiguous"
            for reference in reference_group:
                reference["plan_usage"] = "ambiguous"
            continue
        if not reference_group:
            unmatched_plan_keys.append({"heat_no": key[0], "lot_no": key[1]})
            for plan in plan_group:
                plan["reference_status"] = "unmatched"
            continue
        exact_match_count += 1
        plan = plan_group[0]
        reference = reference_group[0]
        plan["reference_status"] = "exact"
        plan["reference_row_numbers"] = [reference["source_row"]]
        reference["plan_usage"] = "exact"
        reference["plan_row_numbers"] = [plan["source_row"]]
        consistency_differences.extend(_consistency_differences(plan, reference, key))

    reference_only_keys = [
        {"heat_no": key[0], "lot_no": key[1]} for key in reference_index if key not in plan_index
    ]
    crosswalk_index: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for entry in crosswalk:
        if entry["key"]:
            crosswalk_index[entry["key"]].append(entry)
    crosswalk_duplicate_keys = [
        {"heat_no": key[0], "lot_no": key[1]}
        for key, group in crosswalk_index.items()
        if len(group) > 1
    ]
    crosswalk_unmatched_keys = [
        {"heat_no": key[0], "lot_no": key[1]}
        for key in crosswalk_index
        if key not in reference_index
    ]

    return {
        "plan_record_count": len(plan_rows),
        "reference_master_record_count": len(reference_rows),
        "plan_complete_key_count": sum(
            bool(_composite_key(row["heat_no"], row["lot_no"])) for row in plan_rows
        ),
        "reference_complete_key_count": sum(
            bool(_composite_key(row["heat_no"], row["lot_no"])) for row in reference_rows
        ),
        "plan_incomplete_key_count": sum(
            not _composite_key(row["heat_no"], row["lot_no"]) for row in plan_rows
        ),
        "reference_incomplete_key_count": sum(
            not _composite_key(row["heat_no"], row["lot_no"]) for row in reference_rows
        ),
        "matched_pair_count": exact_match_count,
        "unmatched_plan_key_count": len(unmatched_plan_keys),
        "unmatched_plan_keys": unmatched_plan_keys,
        "reference_only_key_count": len(reference_only_keys),
        "reference_only_keys": reference_only_keys,
        "ambiguous_plan_key_count": len(ambiguous_plan_keys),
        "ambiguous_plan_keys": ambiguous_plan_keys,
        "duplicate_plan_key_count": sum(
            len(group) - 1 for group in plan_index.values() if len(group) > 1
        ),
        "duplicate_reference_key_count": sum(
            len(group) - 1 for group in reference_index.values() if len(group) > 1
        ),
        "consistency_difference_count": len(consistency_differences),
        "consistency_differences": consistency_differences,
        "crosswalk_entry_count": len(crosswalk),
        "crosswalk_matched_key_count": sum(1 for key in crosswalk_index if key in reference_index),
        "crosswalk_unmatched_keys": crosswalk_unmatched_keys,
        "crosswalk_duplicate_keys": crosswalk_duplicate_keys,
        "reference_is_additive_with_plan": False,
    }


def _summary_source_values(source: dict[str, Any]) -> dict[str, int | float]:
    summary: dict[str, int | float] = {}
    for record in source["records"]:
        values = record["values"]
        label = _text(values[0]) if values else None
        value = _number(values[1] if len(values) > 1 else None)
        if label and value is not None:
            metric = _SUMMARY_LABELS.get(label.casefold())
            if metric:
                summary[metric] = value
    return summary


def _aggregate_metrics(
    records: list[dict[str, Any]], source_summary: dict[str, int | float]
) -> dict[str, Any]:
    totals: dict[str, Any] = {}
    for field in _PLAN_NUMERIC_FIELDS:
        if field == "yield_vs_plan_fraction" or field == "balance_reconciliation":
            continue
        values = [record[field] for record in records if record[field] is not None]
        totals[field] = {
            "total": sum(values) if values else None,
            "record_count": len(values),
        }
    formula_checks = {
        "rm_qty_mt": source_summary.get("rm_qty_mt"),
        "plan_final_supply_nos": source_summary.get("plan_final_supply_nos"),
        "actual_forming_ok": source_summary.get("actual_forming_ok"),
    }
    reconciliation = {}
    for field, source_value in formula_checks.items():
        computed = totals[field]["total"]
        reconciliation[field] = {
            "source_formula_value": source_value,
            "recomputed_value": computed,
            "matches": (
                isclose(source_value, computed, rel_tol=1e-10, abs_tol=1e-7)
                if source_value is not None and computed is not None
                else None
            ),
        }
    yield_rows = [record for record in records if record["yield_vs_plan_fraction"] is not None]
    yield_mismatches = [
        record["source_row"]
        for record in yield_rows
        if record["yield_source_matches_calculation"] is not True
    ]
    return {
        "record_count": len(records),
        "has_actual_values_count": sum(record["has_actual_values"] for record in records),
        "metrics": totals,
        "yield_validation": {
            "definition": "Actual: Forming OK / Plan: Clip Prod (Nos)",
            "source_formula_count": len(yield_rows),
            "independently_recomputed_count": len(yield_rows) - len(yield_mismatches),
            "mismatch_count": len(yield_mismatches),
            "mismatch_source_rows": yield_mismatches,
        },
        "source_formula_reconciliation": reconciliation,
    }


def _sort_and_page(
    records: list[dict[str, Any]],
    *,
    page: int,
    page_size: int,
    sort_by: str,
    sort_order: str,
    allowed_fields: dict[str, str],
) -> tuple[list[dict[str, Any]], int, int]:
    if page < 1:
        raise ValueError("Page number must be at least 1.")
    if not 1 <= page_size <= _MAX_PAGE_SIZE:
        raise ValueError(f"Page size must be between 1 and {_MAX_PAGE_SIZE}.")
    if sort_by not in allowed_fields:
        raise ValueError(f"Unsupported sort field: {sort_by}.")
    if sort_order not in {"asc", "desc"}:
        raise ValueError("Sort order must be 'asc' or 'desc'.")

    field = allowed_fields[sort_by]
    present = [record for record in records if record.get(field) is not None]
    missing = [record for record in records if record.get(field) is None]
    present.sort(
        key=lambda record: (
            record[field].casefold() if isinstance(record[field], str) else record[field]
        ),
        reverse=sort_order == "desc",
    )
    total = len(records)
    offset = (page - 1) * page_size
    ordered = present + missing
    return (
        ordered[offset : offset + page_size],
        total,
        (total + page_size - 1) // page_size,
    )


def _matches_filters(
    record: dict[str, Any],
    *,
    search: str,
    customer: str,
    supplier: str,
    source_batch: str,
    heat_no: str,
    lot_no: str,
) -> bool:
    if (
        search
        and search.casefold()
        not in " ".join(
            str(value)
            for value in record.values()
            if value is not None and not isinstance(value, dict | list)
        ).casefold()
    ):
        return False
    for field, selected in (
        ("customer", customer),
        ("supplier", supplier),
        ("source_batch", source_batch),
        ("heat_no", heat_no),
        ("lot_no", lot_no),
    ):
        if selected and _join_part(record.get(field)) != _join_part(selected):
            return False
    return True


def _group_summaries(records: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        label = record.get(field)
        if label:
            grouped[label].append(record)
    return [
        {
            "name": name,
            "record_count": len(rows),
            "rm_qty_mt": _sum_if_present(row["rm_qty_mt"] for row in rows),
            "matched_pair_count": sum(row.get("reference_status") == "exact" for row in rows),
        }
        for name, rows in sorted(grouped.items(), key=lambda item: item[0].casefold())
    ]


_STAGE_SUMMARY_FIELDS = (
    ("plan_cut_bar_nos", "Plan: Cut Bar (Nos)"),
    ("actual_bar_cropper_ok", "Actual: Bar Cropper OK"),
    ("actual_endbit_scrap", "Actual: Endbit Scrap"),
    ("actual_acm_turning_ok", "Actual: ACM/Turning OK"),
    ("actual_acm_turning_rej", "Actual: ACM/Turning REJ"),
    ("plan_clip_prod_nos", "Plan: Clip Prod (Nos)"),
    ("actual_forming_ok", "Actual: Forming OK"),
    ("actual_forming_rej", "Actual: Forming REJ"),
    ("plan_final_supply_nos", "Plan: Final Supply (Nos)"),
)


def _stage_summary(records: list[dict[str, Any]], group_field: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        label = record.get(group_field)
        if label:
            grouped[str(label)].append(record)
    return [
        {
            "group": group,
            "metrics": {
                field: _sum_if_present(row.get(field) for row in rows)
                for field, _ in _STAGE_SUMMARY_FIELDS
            },
            "yield_vs_plan_fraction": _sum_if_present(
                row.get("yield_vs_plan_fraction") for row in rows
            ),
            "source_row_count": len(rows),
        }
        for group, rows in sorted(grouped.items(), key=lambda item: item[0].casefold())
    ]


def _sum_if_present(values: Any) -> int | float | None:
    present = [value for value in values if value is not None]
    return sum(present) if present else None


def _build_phase_three_data(refresh: bool) -> dict[str, Any]:
    plan_source = _read_all_rows(_PLAN_KEY, refresh=refresh)
    reference_source = _read_all_rows(_REFERENCE_KEY, refresh=refresh)
    plan_rows, plan_source_rows, plan_warnings = _parse_plan_rows(plan_source)
    reference_rows, crosswalk, reference_warnings = _parse_reference_rows(reference_source)
    relationship = _link_plan_and_reference(plan_rows, reference_rows, crosswalk)
    source_summary = _summary_source_values(plan_source)
    warnings = plan_warnings + reference_warnings
    if relationship["consistency_difference_count"]:
        warnings.append(
            f"{relationship['consistency_difference_count']} matched pair(s) have "
            "source attribute differences."
        )
    if relationship["crosswalk_unmatched_keys"] or relationship["crosswalk_duplicate_keys"]:
        warnings.append(
            "The source lot cross-reference contains duplicate or unmatched composite keys."
        )
    return {
        "plan_source": plan_source,
        "reference_source": reference_source,
        "plan_rows": plan_rows,
        "reference_rows": reference_rows,
        "plan_source_rows": plan_source_rows,
        "reference_source_rows": _source_rows(reference_source),
        "crosswalk": crosswalk,
        "relationship": relationship,
        "source_summary": source_summary,
        "warnings": warnings,
    }


def _filter_options(records: list[dict[str, Any]]) -> dict[str, list[str]]:
    return {
        option: sorted(
            {record[field] for record in records if record.get(field)},
            key=str.casefold,
        )
        for option, field in (
            ("customers", "customer"),
            ("suppliers", "supplier"),
            ("source_batches", "source_batch"),
        )
    }


def _add_raw_source(
    result: dict[str, Any],
    *,
    headers: list[str],
    records: list[dict[str, Any]],
    context_rows: list[dict[str, Any]],
    source_record_count: int,
) -> dict[str, Any]:
    result["source_headers"] = headers
    result["source_records"] = records
    result["source_context_rows"] = context_rows
    result["source_record_count"] = source_record_count
    return result


def get_rm_heat_plan_analytics(
    *,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    customer: str = "",
    supplier: str = "",
    source_batch: str = "",
    heat_no: str = "",
    lot_no: str = "",
    sort_by: str = "source_row",
    sort_order: str = "asc",
    refresh: bool = False,
) -> dict[str, Any]:
    if bool(heat_no) != bool(lot_no):
        raise ValueError("Exact heat/lot lookup requires both Heat No. and Lot No.")
    data = _build_phase_three_data(refresh)
    filtered = [
        record
        for record in data["plan_rows"]
        if _matches_filters(
            record,
            search=search.strip(),
            customer=customer,
            supplier=supplier,
            source_batch=source_batch,
            heat_no=heat_no,
            lot_no=lot_no,
        )
    ]
    page_rows, filtered_count, page_count = _sort_and_page(
        filtered,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        allowed_fields=_PLAN_SORT_FIELDS,
    )
    filtered_metrics = _aggregate_metrics(filtered, {})
    all_metrics = _aggregate_metrics(data["plan_rows"], data["source_summary"])
    result = {
        **_source_state(
            plan=data["plan_source"],
            reference=data["reference_source"],
        ),
        "worksheet": data["plan_source"]["worksheet"],
        "record_count": len(data["plan_rows"]),
        "filtered_record_count": filtered_count,
        "page": page,
        "page_size": page_size,
        "page_count": page_count,
        "records": page_rows,
        "relationship": data["relationship"],
        "metrics": filtered_metrics,
        "source_formula_reconciliation": all_metrics["source_formula_reconciliation"],
        "yield_validation": all_metrics["yield_validation"],
        "customer_summary": _group_summaries(filtered, "customer"),
        "supplier_summary": _group_summaries(filtered, "supplier"),
        "stage_summary_by_supplier": _stage_summary(data["plan_rows"], "supplier"),
        "stage_summary_by_customer": _stage_summary(data["plan_rows"], "customer"),
        "heat_yield_series": [
            {
                "source_row": row["source_row"],
                "heat_no": row["heat_no"],
                "lot_no": row["lot_no"],
                "yield_vs_plan_fraction": row["yield_vs_plan_fraction"],
                "reference_status": row["reference_status"],
            }
            for row in data["plan_rows"]
        ],
        "filter_options": _filter_options(data["plan_rows"]),
        "validation_warnings": data["warnings"],
    }
    return _add_raw_source(
        result,
        headers=data["plan_source"]["headers"],
        records=data["plan_source_rows"],
        context_rows=data["plan_source"].get("source_context_rows", []),
        source_record_count=data["plan_source"]["record_count"],
    )


def get_heat_lot_reference_analytics(
    *,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    customer: str = "",
    supplier: str = "",
    source_batch: str = "",
    heat_no: str = "",
    lot_no: str = "",
    sort_by: str = "source_row",
    sort_order: str = "asc",
    refresh: bool = False,
) -> dict[str, Any]:
    if bool(heat_no) != bool(lot_no):
        raise ValueError("Exact heat/lot lookup requires both Heat No. and Lot No.")
    data = _build_phase_three_data(refresh)
    filtered = [
        record
        for record in data["reference_rows"]
        if _matches_filters(
            record,
            search=search.strip(),
            customer=customer,
            supplier=supplier,
            source_batch=source_batch,
            heat_no=heat_no,
            lot_no=lot_no,
        )
    ]
    page_rows, filtered_count, page_count = _sort_and_page(
        filtered,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        allowed_fields=_REFERENCE_SORT_FIELDS,
    )
    result = {
        **_source_state(
            plan=data["plan_source"],
            reference=data["reference_source"],
        ),
        "worksheet": data["reference_source"]["worksheet"],
        "record_count": len(data["reference_rows"]),
        "filtered_record_count": filtered_count,
        "page": page,
        "page_size": page_size,
        "page_count": page_count,
        "records": page_rows,
        "relationship": data["relationship"],
        "filter_options": _filter_options(data["reference_rows"]),
        "validation_warnings": data["warnings"],
    }
    return _add_raw_source(
        result,
        headers=data["reference_source"]["headers"],
        records=data["reference_source_rows"],
        context_rows=data["reference_source"].get("source_context_rows", []),
        source_record_count=data["reference_source"]["record_count"],
    )


def _read_computed_sums(records: list[dict[str, Any]]) -> dict[str, dict[str, int | float | None]]:
    output = {}
    for field in ("rm_qty_mt", "plan_final_supply_nos", "actual_forming_ok"):
        values = [record[field] for record in records if record[field] is not None]
        output[field] = {
            "total": sum(values) if values else None,
            "record_count": len(values),
        }
    return output


def summarize_live_rm_heat_source(*, refresh: bool = False) -> dict[str, Any]:
    """Expose an unfiltered summary for deterministic live-source verification."""
    data = _build_phase_three_data(refresh)
    return {
        "relationship": data["relationship"],
        "metrics": _read_computed_sums(data["plan_rows"]),
        "yield_validation": _aggregate_metrics(data["plan_rows"], data["source_summary"])[
            "yield_validation"
        ],
        "source_summary": data["source_summary"],
        "validation_warnings": data["warnings"],
    }
