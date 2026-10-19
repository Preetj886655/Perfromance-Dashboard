"""Analytics and data query tools for the Manufacturing AI Chatbot.

Grounded strictly in the live Google Sheets production dataset and the
Medchal maintenance breakdown dataset. All aggregations and calculations
mirror the dashboard formulas. No values are invented.
"""

from __future__ import annotations

from typing import Any

from app.services.google_sheets_service import fetch_google_sheet_dataset
from app.services.maintenance_sheets_service import fetch_maintenance_dataset


class ManufacturingDataUnavailable(RuntimeError):
    """Raised when the production source cannot be read."""


class UnsupportedMaterialField(RuntimeError):
    """Raised when the source schema cannot support a material filter."""


def _is_all_filter(val: Any) -> bool:
    if not val:
        return True
    s = str(val).strip().lower()
    return s in {
        "",
        "all",
        "all lines",
        "all shifts",
        "all stages",
        "all_stages",
        "all machines",
        "all materials",
        "all work centers",
    }


DEFAULT_PRODUCTION_STAGE = "Clip"


def _match_date_range(record_date: str | None, date_from: str | None, date_to: str | None) -> bool:
    if not record_date:
        return False
    # Normalize ISO yyyy-mm-dd
    r_date = str(record_date)[:10]
    if date_from and r_date < str(date_from)[:10]:
        return False
    if date_to and r_date > str(date_to)[:10]:
        return False
    return True


def _match_string(record_val: Any, filter_val: str | None) -> bool:
    if _is_all_filter(filter_val):
        return True
    if not record_val:
        return False
    rec_str = str(record_val).strip().lower()
    fil_str = str(filter_val).strip().lower()
    return rec_str == fil_str or fil_str in rec_str


def get_raw_manufacturing_records() -> list[dict[str, Any]]:
    """Fetch the latest manufacturing dataset from the sheets service."""
    res = fetch_google_sheet_dataset()
    source_status = res.get("connectionStatus") or res.get("status")
    if res.get("error") or source_status != "connected":
        raise ManufacturingDataUnavailable(
            "The manufacturing data source is currently unavailable."
        )
    return res.get("data") or []


def get_raw_maintenance_records() -> list[dict[str, Any]]:
    """Fetch the latest maintenance breakdown dataset from the sheets service."""
    res = fetch_maintenance_dataset()
    return res.get("data") or []


def filter_manufacturing_records(
    records: list[dict[str, Any]],
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    line: str | None = None,
    shift: str | None = None,
    stage: str | None = None,
    machine: str | None = None,
    material: str | None = None,
) -> list[dict[str, Any]]:
    """Filter manufacturing records using dashboard criteria."""
    if not _is_all_filter(material) and records and not any(
        any(field in record for field in ("part", "partName", "material"))
        for record in records
    ):
        raise UnsupportedMaterialField(
            "The manufacturing source does not expose a supported material field."
        )

    filtered: list[dict[str, Any]] = []
    for r in records:
        if date_from or date_to:
            if not _match_date_range(r.get("date"), date_from, date_to):
                continue
        if not _is_all_filter(line) and not _match_string(r.get("line"), line):
            continue
        if not _is_all_filter(shift) and not _match_string(r.get("shift"), shift):
            continue
        if not _is_all_filter(stage) and not _match_string(r.get("stage"), stage):
            continue
        if not _is_all_filter(machine) and not _match_string(
            r.get("machine") or r.get("machineName"), machine
        ):
            continue
        if not _is_all_filter(material) and not (
            _match_string(r.get("part"), material)
            or _match_string(r.get("partName"), material)
            or _match_string(r.get("material"), material)
        ):
            continue
        filtered.append(r)
    return filtered


def filter_maintenance_records(
    records: list[dict[str, Any]],
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    machine: str | None = None,
    shift: str | None = None,
    breakdown_type: str | None = None,
    line: str | None = None,
) -> list[dict[str, Any]]:
    """Filter Medchal maintenance breakdown records."""
    filtered: list[dict[str, Any]] = []
    for r in records:
        if date_from or date_to:
            if not _match_date_range(r.get("date"), date_from, date_to):
                continue
        if not _is_all_filter(machine) and not _match_string(r.get("machine"), machine):
            continue
        if not _is_all_filter(line) and not _match_string(r.get("line"), line):
            continue
        if not _is_all_filter(shift) and not _match_string(r.get("shift"), shift):
            continue
        if not _is_all_filter(breakdown_type) and not _match_string(
            r.get("breakdownType"), breakdown_type
        ):
            continue
        filtered.append(r)
    return filtered


def get_manufacturing_kpis(
    date_from: str | None = None,
    date_to: str | None = None,
    line: str | None = None,
    shift: str | None = None,
    stage: str | None = None,
    machine: str | None = None,
    material: str | None = None,
    *,
    default_to_clip: bool = True,
) -> dict[str, Any]:
    """Calculate core manufacturing KPIs for the given filters.

    By default, production KPIs report final clip production (stage='Clip')
    to prevent multi-counting intermediate process stages (Cut Bar, Turned Bar,
    Deburring, MPI). To sum across all process stages, pass stage='all_stages'
    or default_to_clip=False.
    """
    effective_stage = stage
    if default_to_clip and (_is_all_filter(stage) or stage is None):
        if str(stage or "").strip().lower() not in {"all_stages", "all stages"}:
            effective_stage = DEFAULT_PRODUCTION_STAGE
        else:
            effective_stage = None
    elif _is_all_filter(stage):
        effective_stage = None

    all_records = get_raw_manufacturing_records()
    records = filter_manufacturing_records(
        all_records,
        date_from=date_from,
        date_to=date_to,
        line=line,
        shift=shift,
        stage=effective_stage,
        machine=machine,
        material=material,
    )

    if not records:
        return {
            "recordCount": 0,
            "stage": effective_stage or "all_stages",
            "message": "No manufacturing records found matching the specified filters.",
            "totalProduction": 0,
            "totalTarget": 0,
            "productionAchievementPercent": None,
            "productionGap": 0,
            "totalRejection": 0,
            "rejectionRatePercent": None,
            "goodQuantity": 0,
            "totalDowntimeMinutes": 0,
            "totalDowntimeHours": 0.0,
            "productionLoss": 0,
            "dateRange": {"start": date_from, "end": date_to},
            "dataQuality": {
                "missingProductionCount": 0,
                "missingTargetCount": 0,
                "zeroProductionCount": 0,
            },
        }

    missing_production_count = 0
    missing_target_count = 0
    zero_production_count = 0
    total_prod = 0.0
    total_target = 0.0
    total_rejection = 0.0
    total_downtime = 0.0
    total_loss = 0.0
    valid_dates: list[str] = []

    for r in records:
        has_production_value = (
            r.get("totalProduction") is not None or r.get("actualProductionQty") is not None
        )
        has_target_value = (
            r.get("productionTarget") is not None or r.get("targetProduction") is not None
        )
        if not has_production_value:
            missing_production_count += 1
        if not has_target_value:
            missing_target_count += 1
        p = r.get("totalProduction") or r.get("actualProductionQty") or 0.0
        t = r.get("productionTarget") or r.get("targetProduction") or 0.0
        if has_production_value and float(p) == 0:
            zero_production_count += 1
        rej = r.get("rejection") or r.get("totalRejectionQty") or 0.0
        dt = r.get("downtimeMinutes") or 0.0
        loss = r.get("productionLoss") or 0.0

        total_prod += float(p)
        total_target += float(t)
        total_rejection += float(rej)
        total_downtime += float(dt)
        total_loss += float(loss)

        d = r.get("date")
        if d:
            valid_dates.append(str(d)[:10])

    achievement = (total_prod / total_target * 100) if total_target > 0 else None
    gap = total_target - total_prod
    rejection_rate = (total_rejection / total_prod * 100) if total_prod > 0 else None
    good_qty = max(0.0, total_prod - total_rejection)

    min_date = min(valid_dates) if valid_dates else date_from
    max_date = max(valid_dates) if valid_dates else date_to

    return {
        "recordCount": len(records),
        "stage": effective_stage or "all_stages",
        "dateRange": {"start": min_date, "end": max_date},
        "totalProduction": round(total_prod),
        "totalTarget": round(total_target),
        "productionAchievementPercent": round(achievement, 2) if achievement is not None else None,
        "productionGap": round(gap),
        "totalRejection": round(total_rejection),
        "rejectionRatePercent": round(rejection_rate, 2) if rejection_rate is not None else None,
        "goodQuantity": round(good_qty),
        "totalDowntimeMinutes": round(total_downtime, 1),
        "totalDowntimeHours": round(total_downtime / 60.0, 1),
        "productionLoss": round(total_loss),
        "dataQuality": {
            "missingProductionCount": missing_production_count,
            "missingTargetCount": missing_target_count,
            "zeroProductionCount": zero_production_count,
        },
    }


def get_production_by_line(
    date_from: str | None = None,
    date_to: str | None = None,
    line: str | None = None,
    shift: str | None = None,
    stage: str | None = None,
    machine: str | None = None,
    material: str | None = None,
    *,
    default_to_clip: bool = True,
) -> list[dict[str, Any]]:
    """Calculate production, target, achievement %, and gap per production line."""
    effective_stage = stage
    if default_to_clip and (_is_all_filter(stage) or stage is None):
        if str(stage or "").strip().lower() not in {"all_stages", "all stages"}:
            effective_stage = DEFAULT_PRODUCTION_STAGE
        else:
            effective_stage = None
    elif _is_all_filter(stage):
        effective_stage = None

    all_records = get_raw_manufacturing_records()
    records = filter_manufacturing_records(
        all_records, date_from=date_from, date_to=date_to, line=line, shift=shift,
        stage=effective_stage, machine=machine, material=material,
    )

    lines_map: dict[str, dict[str, float]] = {}
    for r in records:
        line_name = str(r.get("line") or "Unassigned").strip()
        if line_name not in lines_map:
            lines_map[line_name] = {
                "production": 0.0,
                "target": 0.0,
                "rejection": 0.0,
                "downtime": 0.0,
                "loss": 0.0,
            }
        p = float(r.get("totalProduction") or r.get("actualProductionQty") or 0.0)
        t = float(r.get("productionTarget") or r.get("targetProduction") or 0.0)
        rej = float(r.get("rejection") or r.get("totalRejectionQty") or 0.0)
        dt = float(r.get("downtimeMinutes") or 0.0)
        loss = float(r.get("productionLoss") or 0.0)

        lines_map[line_name]["production"] += p
        lines_map[line_name]["target"] += t
        lines_map[line_name]["rejection"] += rej
        lines_map[line_name]["downtime"] += dt
        lines_map[line_name]["loss"] += loss

    result: list[dict[str, Any]] = []
    for line_name, data in lines_map.items():
        prod = round(data["production"])
        target = round(data["target"])
        gap = target - prod
        ach = (prod / target * 100) if target > 0 else None
        rej_rate = (data["rejection"] / prod * 100) if prod > 0 else None

        result.append(
            {
                "line": line_name,
                "production": prod,
                "target": target,
                "gap": gap,
                "achievementPercent": round(ach, 2) if ach is not None else None,
                "rejection": round(data["rejection"]),
                "rejectionRatePercent": round(rej_rate, 2) if rej_rate is not None else None,
                "downtimeMinutes": round(data["downtime"], 1),
                "downtimeHours": round(data["downtime"] / 60.0, 1),
            }
        )

    # Sort descending by production gap (largest gap first)
    result.sort(key=lambda x: x["gap"], reverse=True)
    return result


def get_production_by_shift(
    date_from: str | None = None,
    date_to: str | None = None,
    line: str | None = None,
    shift: str | None = None,
    stage: str | None = None,
    machine: str | None = None,
    material: str | None = None,
    *,
    default_to_clip: bool = True,
) -> list[dict[str, Any]]:
    """Compare performance across shifts (e.g. Day vs Night, Shift 1 vs Shift 2)."""
    effective_stage = stage
    if default_to_clip and (_is_all_filter(stage) or stage is None):
        if str(stage or "").strip().lower() not in {"all_stages", "all stages"}:
            effective_stage = DEFAULT_PRODUCTION_STAGE
        else:
            effective_stage = None
    elif _is_all_filter(stage):
        effective_stage = None

    all_records = get_raw_manufacturing_records()
    records = filter_manufacturing_records(
        all_records, date_from=date_from, date_to=date_to, line=line, shift=shift,
        stage=effective_stage, machine=machine, material=material,
    )

    shifts_map: dict[str, dict[str, float]] = {}
    for r in records:
        shift_name = str(r.get("shift") or "Unspecified").strip()
        if shift_name not in shifts_map:
            shifts_map[shift_name] = {
                "production": 0.0,
                "target": 0.0,
                "rejection": 0.0,
                "downtime": 0.0,
            }
        p = float(r.get("totalProduction") or 0.0)
        t = float(r.get("productionTarget") or 0.0)
        rej = float(r.get("rejection") or 0.0)
        dt = float(r.get("downtimeMinutes") or 0.0)

        shifts_map[shift_name]["production"] += p
        shifts_map[shift_name]["target"] += t
        shifts_map[shift_name]["rejection"] += rej
        shifts_map[shift_name]["downtime"] += dt

    result: list[dict[str, Any]] = []
    for shift_name, data in shifts_map.items():
        prod = round(data["production"])
        target = round(data["target"])
        ach = (prod / target * 100) if target > 0 else None
        rej_rate = (data["rejection"] / prod * 100) if prod > 0 else None

        result.append(
            {
                "shift": shift_name,
                "production": prod,
                "target": target,
                "achievementPercent": round(ach, 2) if ach is not None else None,
                "rejection": round(data["rejection"]),
                "rejectionRatePercent": round(rej_rate, 2) if rej_rate is not None else None,
                "downtimeMinutes": round(data["downtime"], 1),
                "downtimeHours": round(data["downtime"] / 60.0, 1),
            }
        )

    result.sort(key=lambda x: x["production"], reverse=True)
    return result


def get_top_downtime_causes(
    date_from: str | None = None,
    date_to: str | None = None,
    line: str | None = None,
    shift: str | None = None,
    stage: str | None = None,
    machine: str | None = None,
    material: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Retrieve top downtime causes / reasons sorted by total duration."""
    all_records = get_raw_manufacturing_records()
    records = filter_manufacturing_records(
        all_records, date_from=date_from, date_to=date_to, line=line, shift=shift,
        stage=stage, machine=machine, material=material,
    )

    causes_map: dict[str, float] = {}
    total_dt = 0.0
    for r in records:
        dt = float(r.get("downtimeMinutes") or 0.0)
        if dt <= 0:
            continue
        cause = str(
            r.get("downtimeType") or r.get("description") or r.get("idleReason") or "Other / General"
        ).strip()
        causes_map[cause] = causes_map.get(cause, 0.0) + dt
        total_dt += dt

    sorted_causes = sorted(causes_map.items(), key=lambda x: x[1], reverse=True)[:limit]
    result: list[dict[str, Any]] = []
    for cause, minutes in sorted_causes:
        share = (minutes / total_dt * 100) if total_dt > 0 else 0.0
        result.append(
            {
                "cause": cause,
                "downtimeMinutes": round(minutes, 1),
                "downtimeHours": round(minutes / 60.0, 1),
                "sharePercent": round(share, 1),
            }
        )
    return result


def get_top_downtime_machines(
    date_from: str | None = None,
    date_to: str | None = None,
    line: str | None = None,
    shift: str | None = None,
    stage: str | None = None,
    machine: str | None = None,
    material: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Retrieve top machines by downtime duration in manufacturing."""
    all_records = get_raw_manufacturing_records()
    records = filter_manufacturing_records(
        all_records, date_from=date_from, date_to=date_to, line=line, shift=shift,
        stage=stage, machine=machine, material=material,
    )

    machines_map: dict[str, float] = {}
    total_dt = 0.0
    for r in records:
        dt = float(r.get("downtimeMinutes") or 0.0)
        if dt <= 0:
            continue
        m = str(r.get("machine") or r.get("machineName") or "Unknown").strip()
        machines_map[m] = machines_map.get(m, 0.0) + dt
        total_dt += dt

    sorted_machines = sorted(machines_map.items(), key=lambda x: x[1], reverse=True)[:limit]
    result: list[dict[str, Any]] = []
    for machine_name, minutes in sorted_machines:
        share = (minutes / total_dt * 100) if total_dt > 0 else 0.0
        result.append(
            {
                "machine": machine_name,
                "downtimeMinutes": round(minutes, 1),
                "downtimeHours": round(minutes / 60.0, 1),
                "sharePercent": round(share, 1),
            }
        )
    return result


def get_quality_and_rejection_analysis(
    date_from: str | None = None,
    date_to: str | None = None,
    line: str | None = None,
    shift: str | None = None,
    stage: str | None = None,
    machine: str | None = None,
    material: str | None = None,
) -> dict[str, Any]:
    """Calculate rejection rate, quantity, and top rejected materials/machines."""
    all_records = get_raw_manufacturing_records()
    records = filter_manufacturing_records(
        all_records, date_from=date_from, date_to=date_to, line=line, shift=shift,
        stage=stage, machine=machine, material=material,
    )

    total_prod = 0.0
    total_rej = 0.0
    by_machine: dict[str, float] = {}
    by_part: dict[str, float] = {}

    for r in records:
        p = float(r.get("totalProduction") or 0.0)
        rej = float(r.get("rejection") or 0.0)
        total_prod += p
        total_rej += rej

        if rej > 0:
            m = str(r.get("machine") or "Unknown").strip()
            part = str(r.get("part") or r.get("partName") or "Unknown").strip()
            by_machine[m] = by_machine.get(m, 0.0) + rej
            by_part[part] = by_part.get(part, 0.0) + rej

    top_machines = sorted(by_machine.items(), key=lambda x: x[1], reverse=True)[:5]
    top_parts = sorted(by_part.items(), key=lambda x: x[1], reverse=True)[:5]

    rate = (total_rej / total_prod * 100) if total_prod > 0 else None

    return {
        "totalProduction": round(total_prod),
        "totalRejection": round(total_rej),
        "rejectionRatePercent": round(rate, 2) if rate is not None else None,
        "topRejectionMachines": [
            {"machine": k, "rejectionQuantity": round(v)} for k, v in top_machines
        ],
        "topRejectionParts": [{"part": k, "rejectionQuantity": round(v)} for k, v in top_parts],
    }


def get_maintenance_breakdown_summary(
    date_from: str | None = None,
    date_to: str | None = None,
    line: str | None = None,
    machine: str | None = None,
    shift: str | None = None,
    breakdown_type: str | None = None,
) -> dict[str, Any]:
    """Calculate Medchal maintenance breakdown KPIs, types, MTTR, and top machines."""
    all_records = get_raw_maintenance_records()
    records = filter_maintenance_records(
        all_records,
        date_from=date_from,
        date_to=date_to,
        machine=machine,
        shift=shift,
        breakdown_type=breakdown_type,
        line=line,
    )

    if not records:
        return {
            "totalBreakdowns": 0,
            "message": "No maintenance breakdown records found matching the specified filters.",
            "totalDowntimeMinutes": 0,
            "totalDowntimeHours": 0.0,
            "mttrMinutes": 0.0,
            "mttrHours": 0.0,
            "byType": [],
            "topBreakdownMachines": [],
            "dateRange": {"start": date_from, "end": date_to},
        }

    total_dt = 0.0
    type_map: dict[str, dict[str, float]] = {}
    machine_map: dict[str, dict[str, float]] = {}
    valid_dates: list[str] = []

    for r in records:
        dt = float(r.get("downtimeMinutes") or 0.0)
        total_dt += dt
        b_type = str(r.get("breakdownType") or "Uncategorized").strip()
        m_name = str(r.get("machine") or "Unknown").strip()

        if b_type not in type_map:
            type_map[b_type] = {"count": 0, "minutes": 0.0}
        type_map[b_type]["count"] += 1
        type_map[b_type]["minutes"] += dt

        if m_name not in machine_map:
            machine_map[m_name] = {"count": 0, "minutes": 0.0}
        machine_map[m_name]["count"] += 1
        machine_map[m_name]["minutes"] += dt

        d = r.get("date")
        if d:
            valid_dates.append(str(d)[:10])

    count = len(records)
    mttr_mins = total_dt / count if count > 0 else 0.0
    mttr_hrs = mttr_mins / 60.0

    by_type = [
        {
            "type": k,
            "incidentCount": int(v["count"]),
            "downtimeMinutes": round(v["minutes"], 1),
            "downtimeHours": round(v["minutes"] / 60.0, 1),
            "sharePercent": round((v["minutes"] / total_dt * 100), 1) if total_dt > 0 else 0.0,
        }
        for k, v in sorted(type_map.items(), key=lambda x: x[1]["minutes"], reverse=True)
    ]

    top_machines = [
        {
            "machine": k,
            "incidentCount": int(v["count"]),
            "downtimeMinutes": round(v["minutes"], 1),
            "downtimeHours": round(v["minutes"] / 60.0, 1),
        }
        for k, v in sorted(machine_map.items(), key=lambda x: x[1]["minutes"], reverse=True)[:5]
    ]

    min_date = min(valid_dates) if valid_dates else date_from
    max_date = max(valid_dates) if valid_dates else date_to

    return {
        "totalBreakdowns": count,
        "totalDowntimeMinutes": round(total_dt, 1),
        "totalDowntimeHours": round(total_dt / 60.0, 1),
        "mttrMinutes": round(mttr_mins, 1),
        "mttrHours": round(mttr_hrs, 2),
        "byType": by_type,
        "topBreakdownMachines": top_machines,
        "dateRange": {"start": min_date, "end": max_date},
    }


def get_maintenance_corrective_actions(
    date_from: str | None = None,
    date_to: str | None = None,
    line: str | None = None,
    machine: str | None = None,
    shift: str | None = None,
    breakdown_type: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Retrieve Medchal breakdown incidents with documented root causes and corrective actions."""
    all_records = get_raw_maintenance_records()
    records = filter_maintenance_records(
        all_records, date_from=date_from, date_to=date_to, machine=machine,
        shift=shift, breakdown_type=breakdown_type, line=line,
    )

    with_actions: list[dict[str, Any]] = []
    for r in records:
        root = r.get("rootCause")
        action = r.get("correctiveAction")
        counter = r.get("counterMeasure")
        if root or action or counter:
            with_actions.append(
                {
                    "id": r.get("id"),
                    "date": r.get("date"),
                    "machine": r.get("machine"),
                    "breakdownType": r.get("breakdownType"),
                    "downtimeMinutes": r.get("downtimeMinutes"),
                    "description": r.get("description"),
                    "rootCause": root,
                    "counterMeasure": counter,
                    "correctiveAction": action,
                    "attendedBy": r.get("attendedBy"),
                    "spareParts": r.get("spareParts"),
                }
            )

    # Sort descending by downtimeMinutes (most impactful incidents first)
    with_actions.sort(key=lambda x: float(x.get("downtimeMinutes") or 0.0), reverse=True)
    return with_actions[:limit]


def get_operational_summary(
    date_from: str | None = None,
    date_to: str | None = None,
    line: str | None = None,
    shift: str | None = None,
    stage: str | None = None,
    machine: str | None = None,
    material: str | None = None,
    *,
    default_to_clip: bool = True,
) -> dict[str, Any]:
    """Provide a synthesized executive operational summary."""
    mfg_kpis = get_manufacturing_kpis(
        date_from=date_from, date_to=date_to, line=line, shift=shift,
        stage=stage, machine=machine, material=material,
        default_to_clip=default_to_clip,
    )
    lines_breakdown = get_production_by_line(
        date_from=date_from, date_to=date_to, line=line, shift=shift,
        stage=stage, machine=machine, material=material,
        default_to_clip=default_to_clip,
    )
    top_dt_causes = get_top_downtime_causes(
        date_from=date_from, date_to=date_to, line=line, shift=shift,
        stage=stage, machine=machine, material=material, limit=3,
    )
    top_dt_machines = get_top_downtime_machines(
        date_from=date_from, date_to=date_to, line=line, shift=shift,
        stage=stage, machine=machine, material=material, limit=3,
    )
    maint_kpis = get_maintenance_breakdown_summary(
        date_from=date_from, date_to=date_to, line=line, machine=machine, shift=shift,
    )

    largest_gap_line = lines_breakdown[0] if lines_breakdown else None

    return {
        "manufacturingKpis": mfg_kpis,
        "largestGapLine": largest_gap_line,
        "topDowntimeCauses": top_dt_causes,
        "topDowntimeMachines": top_dt_machines,
        "maintenanceSummary": {
            "totalBreakdowns": maint_kpis.get("totalBreakdowns"),
            "totalDowntimeHours": maint_kpis.get("totalDowntimeHours"),
            "mttrHours": maint_kpis.get("mttrHours"),
            "topBreakdownType": maint_kpis.get("byType", [{}])[0].get("type") if maint_kpis.get("byType") else None,
            "topBreakdownMachine": maint_kpis.get("topBreakdownMachines", [{}])[0].get("machine") if maint_kpis.get("topBreakdownMachines") else None,
        },
    }


def get_latest_data_date() -> str | None:
    """Return the latest available date (YYYY-MM-DD) present in the manufacturing records."""
    records = get_raw_manufacturing_records()
    valid_dates = [str(r.get("date"))[:10] for r in records if r.get("date")]
    return max(valid_dates) if valid_dates else None


def get_daily_production(
    target_date: str,
    line: str | None = None,
    shift: str | None = None,
    stage: str | None = None,
    machine: str | None = None,
    material: str | None = None,
    *,
    default_to_clip: bool = True,
) -> dict[str, Any]:
    """Calculate production KPIs for a single specific day.

    target_date must be an ISO yyyy-mm-dd string.
    Returns standard manufacturing KPIs plus targetDate.
    If no records exist for that date, recordCount will be 0 and message indicates missing data.
    """
    iso_date = str(target_date)[:10]
    res = get_manufacturing_kpis(
        date_from=iso_date,
        date_to=iso_date,
        line=line,
        shift=shift,
        stage=stage,
        machine=machine,
        material=material,
        default_to_clip=default_to_clip,
    )
    res["targetDate"] = iso_date
    return res


def compare_date_ranges(
    period_a_from: str,
    period_a_to: str,
    period_b_from: str,
    period_b_to: str,
    line: str | None = None,
    shift: str | None = None,
    stage: str | None = None,
    machine: str | None = None,
    material: str | None = None,
    *,
    default_to_clip: bool = True,
) -> dict[str, Any]:
    """Compare production KPIs between two date ranges (period A vs period B)."""
    filters: dict[str, Any] = {"line": line, "shift": shift, "default_to_clip": default_to_clip}
    filters.update(
        {
            key: value
            for key, value in {"stage": stage, "machine": machine, "material": material}.items()
            if value is not None
        }
    )
    kpis_a = get_manufacturing_kpis(date_from=period_a_from, date_to=period_a_to, **filters)
    kpis_b = get_manufacturing_kpis(date_from=period_b_from, date_to=period_b_to, **filters)
    prod_a = kpis_a.get("totalProduction", 0) or 0
    prod_b = kpis_b.get("totalProduction", 0) or 0
    diff = prod_b - prod_a
    pct_change = round((diff / prod_a * 100), 2) if prod_a > 0 else None

    return {
        "periodA": {"dateRange": {"start": period_a_from, "end": period_a_to}, "kpis": kpis_a},
        "periodB": {"dateRange": {"start": period_b_from, "end": period_b_to}, "kpis": kpis_b},
        "productionDifference": diff,
        "productionChangePercent": pct_change,
    }


def get_line_tracker_order_status(
    order_number: str | None = None,
    customer: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    """Retrieve production order fulfillment, balance, DP date, and risk status from ERC Mk-V Line Tracker."""
    from app.services.line_tracker_service import get_line_tracker_ppc_orders
    res = get_line_tracker_ppc_orders(refresh=False)
    orders = res.get("orders", [])
    filtered = orders
    if order_number and not _is_all_filter(order_number):
        target = order_number.strip().lower()
        filtered = [
            o for o in filtered
            if target in (o.get("order_number") or "").lower()
            or target in (o.get("notes") or "").lower()
            or target in (o.get("assigned_rm_heat_number") or "").lower()
        ]
    if customer and not _is_all_filter(customer):
        c_target = customer.strip().lower()
        filtered = [
            o for o in filtered
            if c_target in (o.get("customer") or "").lower()
        ]
    if status and not _is_all_filter(status):
        s_target = status.strip().lower()
        filtered = [
            o for o in filtered
            if s_target in (o.get("fulfillment_status") or "").lower()
            or s_target in (o.get("status") or "").lower()
            or s_target in (o.get("risk_level") or "").lower()
        ]
    return {
        "summary": res.get("summary", {}),
        "orders": filtered,
        "count": len(filtered),
        "total_orders_in_catalog": len(orders),
    }


def get_line_tracker_oee_breakdown(
    work_center: str | None = None,
    machine: str | None = None,
    shift: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Calculate component-weighted OEE, Availability, Performance, Quality, and speed loss from ERC Mk-V Line Tracker."""
    from app.services.line_tracker_service import get_line_tracker_oee_breakdown as _get_oee
    return _get_oee(
        work_center=None if _is_all_filter(work_center) else work_center,
        machine=None if _is_all_filter(machine) else machine,
        shift=None if _is_all_filter(shift) else shift,
        date_from=date_from,
        date_to=date_to,
        refresh=False,
    )


def get_line_tracker_reliability(
    category: str | None = None,
    machine: str | None = None,
    stage: str | None = None,
    shift: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Calculate historical Downtime Pareto, planned vs unplanned loss, and machine MTTR/MTBF from ERC Mk-V Line Tracker."""
    from app.services.line_tracker_service import get_line_tracker_reliability_analysis as _get_rel
    return _get_rel(
        category=None if _is_all_filter(category) else category,
        machine=None if _is_all_filter(machine) else machine,
        stage=None if _is_all_filter(stage) else stage,
        shift=None if _is_all_filter(shift) else shift,
        date_from=date_from,
        date_to=date_to,
        refresh=False,
    )


def get_line_tracker_traceability(
    heat_number: str | None = None,
) -> dict[str, Any]:
    """Retrieve raw material heat conversion funnel and order-to-lot traceability from ERC Mk-V Line Tracker."""
    from app.services.line_tracker_service import get_line_tracker_traceability as _get_trace
    data = _get_trace(refresh=False)
    if heat_number and not _is_all_filter(heat_number):
        h_target = heat_number.strip().lower()
        heats = [
            h for h in data.get("heats", [])
            if h_target in (h.get("heat_number") or "").lower()
        ]
        return {**data, "heats": heats}
    return data


