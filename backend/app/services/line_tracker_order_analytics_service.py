"""Read-only Phase 2 production-order and monthly-plan analytics."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any, Literal

from app.services.line_tracker_worksheet_service import (
    WorksheetNotFoundError,
    get_line_tracker_worksheet_data,
)

MatchMethod = Literal["exact", "note_alias", "unmatched", "ambiguous"]

_ORDER_KEYS = {"production-order", "copy-of-production-order"}
_MONTH_PLAN_KEY = "order-plan-monthly"
_DEFAULT_PAGE_SIZE = 20
_MAX_PAGE_SIZE = 100
_MAX_ROWS = 5000

_ORDER_SORT_FIELDS = {
    "order_number": "order_number",
    "customer": "customer",
    "part": "part",
    "order_date": "order_date",
    "order_quantity": "order_quantity",
    "status": "status",
    "dispatch_date": "dispatch_date",
    "rm_requirement_mt": "rm_requirement_mt",
    "plan_production_total": "plan_production_total",
    "plan_dispatch_total": "plan_dispatch_total",
}
_PLAN_SORT_FIELDS = {
    "row_number": "row_number",
    "po_number": "parent_po_number",
    "customer": "customer",
    "part": "part",
    "type": "source_type",
    "po_quantity": "po_quantity",
    "balance": "balance",
    "month_total": "month_total",
}


def _normalise_header(value: Any) -> str:
    return str(value or "").strip().casefold()


def _row_dict(headers: list[str], values: list[Any]) -> dict[str, Any]:
    return {
        _normalise_header(header): values[index] if index < len(values) else None
        for index, header in enumerate(headers)
    }


def _text(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _number(value: Any) -> int | float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return value if value == value else None
    normalized = str(value).strip().replace(",", "")
    if not normalized:
        return None
    try:
        parsed = float(normalized)
    except ValueError:
        return None
    if parsed.is_integer():
        return int(parsed)
    return parsed


def _join_key(value: Any) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        if not float(value).is_integer():
            return str(value).strip().casefold()
        return str(int(value))
    normalized = str(value).strip()
    if not normalized:
        return None
    if re.fullmatch(r"\d+\.0+", normalized):
        normalized = normalized.split(".", maxsplit=1)[0]
    return normalized.casefold()


def _trim_row(values: list[Any]) -> list[Any]:
    trimmed = list(values)
    while trimmed and trimmed[-1] in ("", None):
        trimmed.pop()
    return trimmed


def _all_rows(worksheet_key: str, *, refresh: bool) -> dict[str, Any]:
    first = get_line_tracker_worksheet_data(
        worksheet_key,
        page=1,
        page_size=_MAX_PAGE_SIZE,
        refresh=refresh,
    )
    if first["record_count"] > _MAX_ROWS:
        raise ValueError(
            f"Worksheet '{first['worksheet']['name']}' exceeds the Phase 2 read limit."
        )
    records = list(first["records"])
    for page in range(2, first["page_count"] + 1):
        result = get_line_tracker_worksheet_data(
            worksheet_key,
            page=page,
            page_size=_MAX_PAGE_SIZE,
            refresh=False,
        )
        records.extend(result["records"])
    return {**first, "records": records}


def _source_state(**sources: dict[str, Any]) -> dict[str, Any]:
    fetched_values = [
        source.get("fetched_at") for source in sources.values() if source.get("fetched_at")
    ]
    stale_sources = [
        source["worksheet"]["name"] for source in sources.values() if source.get("is_stale")
    ]
    refresh_errors = [
        source["refresh_error"] for source in sources.values() if source.get("refresh_error")
    ]
    return {
        "source": "google-sheets",
        "spreadsheet_id": next(iter(sources.values()))["spreadsheet_id"],
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
        "fetched_at": max(fetched_values) if fetched_values else None,
        "cache_hit": all(source.get("cache_hit", False) for source in sources.values()),
        "is_stale": bool(stale_sources),
        "refresh_error": "; ".join(refresh_errors) or None,
    }


def _month_headers(source: dict[str, Any]) -> list[str]:
    headers = source["headers"]
    if len(headers) < 9:
        raise ValueError("Order Plan (Monthly) is missing its Type/month columns.")
    return [_normalise_month_header(header) for header in headers[9:21]]


def _normalise_month_header(value: Any) -> str:
    label = _text(value) or ""
    return {"Feb-26": "Feb-27", "Mar-26": "Mar-27"}.get(label, label)


def _extract_fiscal_label(source: dict[str, Any]) -> str | None:
    for context_row in source.get("source_context_rows", []):
        for value in context_row["values"]:
            text = _text(value)
            if text:
                match = re.search(r"\bFY\s+\d{4}-\d{2}\b", text, re.IGNORECASE)
                if match:
                    return match.group(0)
    return None


def _parse_monthly_rows(source: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    headers = source["headers"]
    raw_month_headers = source["headers"][9:21]
    month_headers = [_normalise_month_header(header) for header in raw_month_headers]
    plans: list[dict[str, Any]] = []
    current_production: dict[str, Any] | None = None
    source_total_order_qty: int | float | None = None
    data_quality_warnings: list[str] = []

    for record in source["records"]:
        row = _row_dict(headers, record["values"])
        source_type = _text(row.get("type"))
        po_number = row.get(_normalise_header("PO No"))
        if _text(row.get("part")) == "Total order qty.":
            source_total_order_qty = _number(row.get("po qty"))
            continue
        if not source_type:
            continue

        month_values = {
            month: _number(
                row.get(_normalise_header(raw_month_headers[index]))
            )
            for index, month in enumerate(month_headers)
        }
        present_month_values = [value for value in month_values.values() if value is not None]
        month_total = sum(present_month_values) if present_month_values else None
        if source_type.casefold() == "production":
            current_production = {
                "row_number": record["row_number"],
                "po_number": _text(po_number),
                "po_key": _join_key(po_number),
                "customer": _text(row.get("customer")),
                "part": _text(row.get("part")),
                "po_date": _text(row.get("po date")),
                "po_quantity": _number(row.get("po qty")),
                "dp_date": _text(row.get("dp date")),
                "fy25_26_carryover": _number(row.get("fy25-26 carryover")),
                "balance": _number(row.get("balance")),
            }
            parent = current_production
        elif source_type.casefold() == "dispatch":
            parent = current_production
        else:
            parent = None
            data_quality_warnings.append(
                f"Unrecognized source Type {source_type!r} at row "
                f"{record['row_number']}; retained as a separate plan row."
            )

        plans.append(
            {
                "row_number": record["row_number"],
                "parent_row_number": parent["row_number"] if parent else None,
                "po_number": _text(po_number),
                "po_key": _join_key(po_number),
                "parent_po_number": parent["po_number"] if parent else None,
                "customer": _text(row.get("customer"))
                or (
                    parent["customer"] if parent and source_type.casefold() == "dispatch" else None
                ),
                "part": _text(row.get("part"))
                or (parent["part"] if parent and source_type.casefold() == "dispatch" else None),
                "po_date": _text(row.get("po date"))
                or (parent.get("po_date") if parent and source_type.casefold() == "dispatch" else None),
                "po_quantity": _number(row.get("po qty"))
                if _number(row.get("po qty")) is not None
                else (parent.get("po_quantity") if parent and source_type.casefold() == "dispatch" else None),
                "dp_date": _text(row.get("dp date"))
                or (parent.get("dp_date") if parent and source_type.casefold() == "dispatch" else None),
                "fy25_26_carryover": _number(row.get("fy25-26 carryover"))
                if _number(row.get("fy25-26 carryover")) is not None
                else (parent.get("fy25_26_carryover") if parent and source_type.casefold() == "dispatch" else None),
                "balance": _number(row.get("balance"))
                if _number(row.get("balance")) is not None
                else (parent.get("balance") if parent and source_type.casefold() == "dispatch" else None),
                "source_type": source_type,
                "month_values": month_values,
                "month_total": month_total,
                "grand_total": _number(row.get("grand total")),
                "match_method": "unmatched",
                "order_row_number": None,
            }
        )

    calculated_production_po_qty = sum(
        plan["po_quantity"]
        for plan in plans
        if plan["source_type"].casefold() == "production" and plan["po_quantity"] is not None
    )
    return plans, {
        "source_total_order_qty": source_total_order_qty,
        "calculated_production_po_qty": calculated_production_po_qty,
        "formula_total_matches": (
            source_total_order_qty == calculated_production_po_qty
            if source_total_order_qty is not None
            else None
        ),
        "warnings": data_quality_warnings,
        "source_month_headers": raw_month_headers,
        "normalized_month_headers": month_headers,
    }


def _sum_known(values: list[int | float | None]) -> int | float | None:
    present = [value for value in values if value is not None]
    return sum(present) if present else None


def _order_book_summary(plans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for plan in plans:
        if plan["source_type"].casefold() == "production" and plan["customer"]:
            grouped[plan["customer"]].append(plan)
    return [
        {
            "customer": customer,
            "po_qty": _sum_known([row["po_quantity"] for row in rows]),
            "fy25_26_carryover": _sum_known([row["fy25_26_carryover"] for row in rows]),
            "balance": _sum_known([row["balance"] for row in rows]),
            "source_row_count": len(rows),
        }
        for customer, rows in sorted(grouped.items(), key=lambda item: item[0].casefold())
    ]


def _monthly_plan_summary(
    plans: list[dict[str, Any]], month_headers: list[str]
) -> list[dict[str, Any]]:
    return [
        {
            "month": month,
            "production": _sum_known([
                row["month_values"].get(month)
                for row in plans
                if row["source_type"].casefold() == "production"
            ]),
            "dispatch": _sum_known([
                row["month_values"].get(month)
                for row in plans
                if row["source_type"].casefold() == "dispatch"
            ]),
        }
        for month in month_headers
    ]


def _explicit_real_po_alias(notes: Any) -> str | None:
    text = _text(notes)
    if not text:
        return None
    match = re.search(r"\bReal PO No\.\s*([A-Za-z0-9-]+)", text, re.IGNORECASE)
    return match.group(1) if match else None


def _parse_orders(source: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    orders: list[dict[str, Any]] = []
    warnings: list[str] = []
    for record in source["records"]:
        row = _row_dict(source["headers"], record["values"])
        customer = _text(row.get("customer"))
        part = _text(row.get("part"))
        quantity = _number(row.get("order qty"))
        status = _text(row.get("status"))
        if not any((customer, part, quantity is not None, status)):
            continue
        order_number = _text(row.get("order nr"))
        if not order_number:
            warnings.append(
                f"Order row {record['row_number']} has no Order Nr and is shown without "
                "an identifier."
            )
        orders.append(
            {
                "row_number": record["row_number"],
                "order_number": order_number,
                "customer": customer,
                "order_date": _text(row.get("po date")),
                "order_quantity": quantity,
                "part": part,
                "dispatch_date": _text(row.get("dp date")),
                "assigned_rm_heat": _text(row.get("assigned rm heat nr")),
                "subsequent_lot": _text(row.get("subsequent lot nr")),
                "status": status,
                "notes": _text(row.get("notes")),
                "rm_requirement_mt": _number(row.get("rm requirment in mt")),
                "explicit_real_po_alias": _explicit_real_po_alias(row.get("notes")),
                "plan_link": None,
            }
        )
    return orders, warnings


def _link_order_plan(
    orders: list[dict[str, Any]],
    plans: list[dict[str, Any]],
) -> dict[str, Any]:
    by_order_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_alias_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for order in orders:
        if key := _join_key(order["order_number"]):
            by_order_key[key].append(order)
        if key := _join_key(order["explicit_real_po_alias"]):
            by_alias_key[key].append(order)

    production_plans = [plan for plan in plans if plan["source_type"].casefold() == "production"]
    for plan in production_plans:
        key = plan["po_key"]
        candidates = by_order_key.get(key, []) if key else []
        method: MatchMethod = "exact"
        if not candidates and key:
            candidates = by_alias_key.get(key, [])
            method = "note_alias"
        if len(candidates) > 1:
            plan["match_method"] = "ambiguous"
            continue
        if not candidates:
            plan["match_method"] = "unmatched"
            continue
        order = candidates[0]
        plan["match_method"] = method
        plan["order_row_number"] = order["row_number"]
        if order["plan_link"] is None:
            order["plan_link"] = {
                "match_method": method,
                "plans": [],
            }
        order["plan_link"]["plans"].append(plan)

    production_by_row = {plan["row_number"]: plan for plan in production_plans}
    for plan in plans:
        if plan["source_type"].casefold() != "dispatch":
            continue
        parent = production_by_row.get(plan["parent_row_number"])
        if parent:
            plan["match_method"] = parent["match_method"]
            plan["order_row_number"] = parent["order_row_number"]

    for order in orders:
        link = order["plan_link"]
        if not link:
            order["plan_production_total"] = None
            order["plan_dispatch_total"] = None
            continue
        production = [
            plan for plan in link["plans"] if plan["source_type"].casefold() == "production"
        ]
        dispatch = [
            plan
            for plan in plans
            if plan["source_type"].casefold() == "dispatch"
            and any(
                plan["parent_row_number"] == production_plan["row_number"]
                for production_plan in production
            )
        ]
        link["plans"] = production + dispatch
        order["plan_production_total"] = _sum_if_present(plan["month_total"] for plan in production)
        order["plan_dispatch_total"] = _sum_if_present(plan["month_total"] for plan in dispatch)

    for plan in plans:
        plan.pop("po_key", None)

    method_counts = Counter(plan["match_method"] for plan in production_plans)
    return {
        "plan_order_count": len(production_plans),
        "exact_match_count": method_counts["exact"],
        "note_alias_match_count": method_counts["note_alias"],
        "unmatched_count": method_counts["unmatched"],
        "ambiguous_count": method_counts["ambiguous"],
        "unmatched_po_numbers": [
            plan["po_number"] for plan in production_plans if plan["match_method"] == "unmatched"
        ],
        "ambiguous_po_numbers": [
            plan["po_number"] for plan in production_plans if plan["match_method"] == "ambiguous"
        ],
    }


def _sum_if_present(values: Any) -> int | float | None:
    present = [value for value in values if value is not None]
    return sum(present) if present else None


def _matches_search(record: dict[str, Any], search: str) -> bool:
    if not search:
        return True
    return (
        search.casefold()
        in " ".join(
            str(value)
            for key, value in record.items()
            if key not in {"plan_link"} and value is not None
        ).casefold()
    )


def _paginate_and_sort(
    rows: list[dict[str, Any]],
    *,
    page: int,
    page_size: int,
    sort_by: str,
    sort_order: str,
    sort_fields: dict[str, str],
) -> tuple[list[dict[str, Any]], int, int]:
    if page < 1:
        raise ValueError("Page number must be at least 1.")
    if not 1 <= page_size <= _MAX_PAGE_SIZE:
        raise ValueError(f"Page size must be between 1 and {_MAX_PAGE_SIZE}.")
    if sort_by not in sort_fields:
        raise ValueError(f"Unsupported sort field: {sort_by}.")
    if sort_order not in {"asc", "desc"}:
        raise ValueError("Sort order must be 'asc' or 'desc'.")

    field = sort_fields[sort_by]
    present = [row for row in rows if row.get(field) is not None]
    missing = [row for row in rows if row.get(field) is None]
    present.sort(
        key=lambda row: (row[field].casefold() if isinstance(row[field], str) else row[field]),
        reverse=sort_order == "desc",
    )
    sorted_rows = present + missing
    total = len(sorted_rows)
    start = (page - 1) * page_size
    return sorted_rows[start : start + page_size], total, (total + page_size - 1) // page_size


def _read_order_sources(refresh: bool) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    primary = _all_rows("production-order", refresh=refresh)
    copy = _all_rows("copy-of-production-order", refresh=refresh)
    monthly = _all_rows(_MONTH_PLAN_KEY, refresh=refresh)
    return primary, copy, monthly


def get_production_order_analytics(
    worksheet_key: str,
    *,
    page: int = 1,
    page_size: int = _DEFAULT_PAGE_SIZE,
    search: str = "",
    customer: str = "",
    part: str = "",
    status: str = "",
    sort_by: str = "order_number",
    sort_order: str = "asc",
    refresh: bool = False,
) -> dict[str, Any]:
    if worksheet_key not in _ORDER_KEYS:
        raise WorksheetNotFoundError(f"Unknown production-order worksheet key: {worksheet_key}.")
    primary_source, copy_source, monthly_source = _read_order_sources(refresh)
    orders_source = primary_source if worksheet_key == "production-order" else copy_source
    orders, warnings = _parse_orders(orders_source)
    plan_rows, _ = _parse_monthly_rows(monthly_source)

    primary_comparable = [
        (record["row_number"], _trim_row(record["values"])) for record in primary_source["records"]
    ]
    copy_comparable = [
        (record["row_number"], _trim_row(record["values"])) for record in copy_source["records"]
    ]
    duplicate_equal = (
        primary_source["headers"] == copy_source["headers"]
        and primary_comparable == copy_comparable
    )
    match_summary = _link_order_plan(orders, plan_rows)
    monthly_headers = _month_headers(monthly_source)
    filtered = [
        order
        for order in orders
        if _matches_search(order, search.strip())
        and (not customer or (order["customer"] or "").casefold() == customer.casefold())
        and (not part or (order["part"] or "").casefold() == part.casefold())
        and (not status or (order["status"] or "").casefold() == status.casefold())
    ]
    page_rows, filtered_count, page_count = _paginate_and_sort(
        filtered,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        sort_fields=_ORDER_SORT_FIELDS,
    )
    status_counts = dict(Counter(order["status"] for order in orders if order["status"]))
    rm_values = [
        order["rm_requirement_mt"] for order in orders if order["rm_requirement_mt"] is not None
    ]
    source_state = _source_state(
        orders=orders_source,
        duplicate=copy_source if worksheet_key == "production-order" else primary_source,
        monthly_plan=monthly_source,
    )
    return {
        **source_state,
        "worksheet": orders_source["worksheet"],
        "requested_worksheet_key": worksheet_key,
        "duplicate_comparison": {
            "status": "identical_live_values" if duplicate_equal else "distinct_snapshot",
            "cell_values_equal": duplicate_equal,
            "compared_nonempty_rows": len(primary_comparable),
            "primary_sheet_id": primary_source["worksheet"]["worksheet_id"],
            "copy_sheet_id": copy_source["worksheet"]["worksheet_id"],
            "combined_into_metrics": False,
        },
        "summary": {
            "order_count": len(orders),
            "status_counts": status_counts,
            "known_rm_requirement_count": len(rm_values),
            "known_rm_requirement_total_mt": sum(rm_values) if rm_values else None,
        },
        "order_book_summary": _order_book_summary(plan_rows),
        "monthly_plan_summary": _monthly_plan_summary(plan_rows, monthly_headers),
        "monthly_plan_headers": monthly_headers,
        "plan_overlap": match_summary,
        "filter_options": {
            "customers": sorted({order["customer"] for order in orders if order["customer"]}),
            "parts": sorted({order["part"] for order in orders if order["part"]}),
            "statuses": sorted({order["status"] for order in orders if order["status"]}),
        },
        "orders": page_rows,
        "record_count": len(orders),
        "filtered_record_count": filtered_count,
        "page": page,
        "page_size": page_size,
        "page_count": page_count,
        "validation_warnings": warnings,
    }


def get_monthly_order_plan(
    *,
    page: int = 1,
    page_size: int = _DEFAULT_PAGE_SIZE,
    search: str = "",
    customer: str = "",
    part: str = "",
    source_type: str = "",
    month: str = "",
    sort_by: str = "row_number",
    sort_order: str = "asc",
    refresh: bool = False,
) -> dict[str, Any]:
    source = _all_rows(_MONTH_PLAN_KEY, refresh=refresh)
    plans, formula_summary = _parse_monthly_rows(source)
    order_source = _all_rows("production-order", refresh=refresh)
    orders, order_warnings = _parse_orders(order_source)
    plan_overlap = _link_order_plan(orders, plans)
    raw_month_headers = source["headers"][9:21]
    month_headers = list(raw_month_headers)
    normalized_month_headers = [_normalise_month_header(header) for header in raw_month_headers]
    if month and month not in month_headers and month not in normalized_month_headers:
        raise ValueError("Month filter must match an exact source month header.")
    month_key = _normalise_month_header(month) if month else ""
    filtered = [
        plan
        for plan in plans
        if _matches_search(plan, search.strip())
        and (not customer or (plan["customer"] or "").casefold() == customer.casefold())
        and (not part or (plan["part"] or "").casefold() == part.casefold())
        and (not source_type or plan["source_type"].casefold() == source_type.casefold())
        and (not month or plan["month_values"].get(month_key) is not None)
    ]
    page_rows, filtered_count, page_count = _paginate_and_sort(
        filtered,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        sort_fields=_PLAN_SORT_FIELDS,
    )
    source_state = _source_state(monthly_plan=source, orders=order_source)
    return {
        **source_state,
        "worksheet": source["worksheet"],
        "source_title": next(
            (
                _text(value)
                for row in source.get("source_context_rows", [])
                for value in row["values"]
                if _text(value)
            ),
            None,
        ),
        "fiscal_period": _extract_fiscal_label(source),
        "month_headers": month_headers,
        "normalized_month_headers": normalized_month_headers,
        "raw_month_headers": raw_month_headers,
        "order_book_summary": _order_book_summary(plans),
        "monthly_plan_summary": _monthly_plan_summary(plans, month_headers),
        "formula_summary": formula_summary,
        "plan_overlap": plan_overlap,
        "filter_options": {
            "customers": sorted({plan["customer"] for plan in plans if plan["customer"]}),
            "parts": sorted({plan["part"] for plan in plans if plan["part"]}),
            "types": sorted({plan["source_type"] for plan in plans if plan["source_type"]}),
        },
        "plans": page_rows,
        "record_count": len(plans),
        "filtered_record_count": filtered_count,
        "page": page,
        "page_size": page_size,
        "page_count": page_count,
        "validation_warnings": formula_summary["warnings"] + order_warnings,
    }
