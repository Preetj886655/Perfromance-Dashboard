"""Period OEE rollups — ratio-of-sums (run-time weighted Performance).

Q6 aggregation (approved for implementation): never average row-level A/P/Q/OEE %.
At every machine | line | plant × day | week | month grain:

    A = Σ run_time_min / Σ available_time_min
    P = Σ produced_qty / Σ (run_time_min/60 × target_qty_per_hr)   # AF path — NOT AG
    Q = Σ (produced − rejection) / Σ produced
    OEE = A × P × Q

Sources
-------
- ``production_record_metrics``: run_time_min, available_time_min, target_qty_per_hr,
  total_rejection_qty, formula_version
- ``production_records``: produced_qty, production_date, plant_id, machine_id
- Join on ``production_record_id``; line scope joins ``machines`` (non-null line_id only)

Registry
--------
- Row calculator: ``FORMULA_VERSION`` (from ``oee_calculator``) — only mix matching rows
- Rollup rule: ``AGGREGATION_RULE_KEY`` / ``AGGREGATION_RULE_VERSION`` →
  ``oee_snapshots.aggregation_rule_version``

NULL / empty policy
-------------------
Exclude a source row if ANY required component is NULL (all-or-nothing). Do not
coerce NULL→0. If no valid rows remain, or any period denominator is zero, **skip
writing** a snapshot (``oee_snapshots`` ratio columns are NOT NULL — ratios are
never stored as NULL; empty periods simply have no row).

Q1: overnight / ``stop_at < start_at`` rows keep NULL time metrics from the
calculator — not repaired here; excluded via NULL policy.

Week boundaries: ISO week Monday as ``period_start`` (ASSUMED helper — not Q1 /
plant-week business approval).

No department OEE. No Migration 016 / schema changes. No average of child OEEs —
always sum components then recompute ratios.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Iterable, Literal

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.machine import Machine
from app.models.oee_snapshot import OeeSnapshot
from app.models.production_record import ProductionRecord
from app.models.production_record_metrics import ProductionRecordMetrics
from app.services.oee_calculator import FORMULA_VERSION

# --- Aggregation rule identity (application constants — not a migration) ---

AGGREGATION_RULE_KEY = "ratio_of_sums_runtime"
AGGREGATION_RULE_VERSION = 1

SCOPE_MACHINE = "machine"
SCOPE_LINE = "line"
SCOPE_PLANT = "plant"
SCOPE_TYPES = frozenset({SCOPE_MACHINE, SCOPE_LINE, SCOPE_PLANT})

PERIOD_DAY = "day"
PERIOD_WEEK = "week"
PERIOD_MONTH = "month"
PERIOD_TYPES = frozenset({PERIOD_DAY, PERIOD_WEEK, PERIOD_MONTH})

ScopeType = Literal["machine", "line", "plant"]
PeriodType = Literal["day", "week", "month"]

_ZERO = Decimal("0")
_SIXTY = Decimal("60")

__all__ = [
    "AGGREGATION_RULE_KEY",
    "AGGREGATION_RULE_VERSION",
    "FORMULA_VERSION",
    "SCOPE_MACHINE",
    "SCOPE_LINE",
    "SCOPE_PLANT",
    "PERIOD_DAY",
    "PERIOD_WEEK",
    "PERIOD_MONTH",
    "OeeRollupComponents",
    "OeeRollupSourceRow",
    "iso_week_period_start",
    "month_period_start",
    "period_start_for",
    "period_date_bounds",
    "compute_oee_components",
    "upsert_oee_snapshot",
    "rollup_for_period",
    "rollup_plant_day",
    "rollup_machine_day",
    "rollup_line_day",
]


@dataclass(frozen=True, slots=True)
class OeeRollupSourceRow:
    """One candidate production row + metrics fields needed for ROS."""

    run_time_min: Decimal | None
    available_time_min: Decimal | None
    target_qty_per_hr: Decimal | None
    produced_qty: Decimal | None
    total_rejection_qty: Decimal | None


@dataclass(frozen=True, slots=True)
class OeeRollupComponents:
    """Component sums + ratios for one scope × period (ratio-of-sums)."""

    sum_run_time_min: Decimal
    sum_available_time_min: Decimal
    sum_produced_qty: Decimal
    sum_good_qty: Decimal
    sum_rejection_qty: Decimal
    sum_run_based_capacity: Decimal
    availability: Decimal
    performance: Decimal
    quality: Decimal
    oee: Decimal
    row_count: int


def iso_week_period_start(production_date: date) -> date:
    """Return the Monday of the ISO week containing ``production_date``.

    ASSUMPTION (not Q1 / plant-week business approval): ISO-8601 weeks
    (Monday start). Isolated here so a future plant calendar can replace it.
    """
    return production_date - dt.timedelta(days=production_date.weekday())


def month_period_start(production_date: date) -> date:
    """First calendar day of the month of ``production_date``."""
    return production_date.replace(day=1)


def period_start_for(production_date: date, period_type: str) -> date:
    """Map a production_date to the snapshot ``period_start`` for ``period_type``."""
    if period_type == PERIOD_DAY:
        return production_date
    if period_type == PERIOD_WEEK:
        return iso_week_period_start(production_date)
    if period_type == PERIOD_MONTH:
        return month_period_start(production_date)
    raise ValueError(f"unsupported period_type: {period_type!r}")


def period_date_bounds(period_type: str, period_start: date) -> tuple[date, date]:
    """Inclusive ``[start, end]`` production_date window for a period snapshot.

    - day:   [period_start, period_start]
    - week:  [ISO Monday, Monday+6]  (ASSUMED ISO week)
    - month: [1st of month, last calendar day of that month]
    """
    if period_type == PERIOD_DAY:
        return period_start, period_start
    if period_type == PERIOD_WEEK:
        # period_start must be the ISO Monday (caller responsibility for upsert key).
        return period_start, period_start + dt.timedelta(days=6)
    if period_type == PERIOD_MONTH:
        if period_start.day != 1:
            raise ValueError(
                f"month period_start must be the 1st of the month, got {period_start}"
            )
        if period_start.month == 12:
            next_month = period_start.replace(year=period_start.year + 1, month=1, day=1)
        else:
            next_month = period_start.replace(month=period_start.month + 1, day=1)
        return period_start, next_month - dt.timedelta(days=1)
    raise ValueError(f"unsupported period_type: {period_type!r}")


def _to_decimal(value: Decimal | int | float | str | None) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _row_is_complete(row: OeeRollupSourceRow) -> bool:
    """True when all required rollup components are non-NULL (all-or-nothing)."""
    return (
        row.run_time_min is not None
        and row.available_time_min is not None
        and row.target_qty_per_hr is not None
        and row.produced_qty is not None
        and row.total_rejection_qty is not None
    )


def compute_oee_components(
    rows: Iterable[OeeRollupSourceRow],
) -> OeeRollupComponents | None:
    """Sum complete rows and compute A/P/Q/OEE via ratio-of-sums.

    Incomplete (any required NULL) rows are skipped. Returns ``None`` when no
    valid rows remain, or when any ratio denominator is zero (cannot store NULL
    ratios on ``oee_snapshots`` — callers should skip the write).
    """
    sum_run = _ZERO
    sum_available = _ZERO
    sum_produced = _ZERO
    sum_rejection = _ZERO
    sum_capacity = _ZERO
    count = 0

    for raw in rows:
        if not _row_is_complete(raw):
            continue
        run = _to_decimal(raw.run_time_min)
        available = _to_decimal(raw.available_time_min)
        target = _to_decimal(raw.target_qty_per_hr)
        produced = _to_decimal(raw.produced_qty)
        rejection = _to_decimal(raw.total_rejection_qty)
        assert (
            run is not None
            and available is not None
            and target is not None
            and produced is not None
            and rejection is not None
        )
        sum_run += run
        sum_available += available
        sum_produced += produced
        sum_rejection += rejection
        # AF / run-time capacity — NOT AG (available/60 × target)
        sum_capacity += (run / _SIXTY) * target
        count += 1

    if count == 0:
        return None

    sum_good = sum_produced - sum_rejection

    # Zero denominators → undefined ratios; do not fabricate 0% OEE.
    if sum_available == _ZERO or sum_capacity == _ZERO or sum_produced == _ZERO:
        return None

    availability = sum_run / sum_available
    performance = sum_produced / sum_capacity
    quality = sum_good / sum_produced
    oee = availability * performance * quality

    return OeeRollupComponents(
        sum_run_time_min=sum_run,
        sum_available_time_min=sum_available,
        sum_produced_qty=sum_produced,
        sum_good_qty=sum_good,
        sum_rejection_qty=sum_rejection,
        sum_run_based_capacity=sum_capacity,
        availability=availability,
        performance=performance,
        quality=quality,
        oee=oee,
        row_count=count,
    )


def upsert_oee_snapshot(
    session: Session,
    *,
    scope_type: str,
    scope_id: uuid.UUID,
    period_type: str,
    period_start: date,
    components: OeeRollupComponents,
    aggregation_rule_version: int = AGGREGATION_RULE_VERSION,
    computed_at: datetime | None = None,
) -> OeeSnapshot:
    """Insert or update ``oee_snapshots`` for the unique scope×period×rule key.

    Does not commit — caller owns the transaction. Updates ``computed_at`` on
    every write.
    """
    if scope_type not in SCOPE_TYPES:
        raise ValueError(f"unsupported scope_type: {scope_type!r}")
    if period_type not in PERIOD_TYPES:
        raise ValueError(f"unsupported period_type: {period_type!r}")

    when = computed_at or datetime.now(timezone.utc)

    existing = session.scalars(
        select(OeeSnapshot).where(
            OeeSnapshot.scope_type == scope_type,
            OeeSnapshot.scope_id == scope_id,
            OeeSnapshot.period_type == period_type,
            OeeSnapshot.period_start == period_start,
            OeeSnapshot.aggregation_rule_version == aggregation_rule_version,
        )
    ).first()

    if existing is None:
        row = OeeSnapshot(
            scope_type=scope_type,
            scope_id=scope_id,
            period_type=period_type,
            period_start=period_start,
            aggregation_rule_version=aggregation_rule_version,
        )
        session.add(row)
    else:
        row = existing

    row.sum_run_time_min = components.sum_run_time_min
    row.sum_available_time_min = components.sum_available_time_min
    row.sum_produced_qty = components.sum_produced_qty
    row.sum_good_qty = components.sum_good_qty
    row.sum_rejection_qty = components.sum_rejection_qty
    row.sum_run_based_capacity = components.sum_run_based_capacity
    row.availability = components.availability
    row.performance = components.performance
    row.quality = components.quality
    row.oee = components.oee
    row.computed_at = when
    return row


def _build_source_query(
    *,
    scope_type: str,
    scope_id: uuid.UUID,
    period_type: str,
    period_start: date,
    formula_version: int,
) -> Select[tuple[ProductionRecord, ProductionRecordMetrics]]:
    date_from, date_to = period_date_bounds(period_type, period_start)

    stmt = (
        select(ProductionRecord, ProductionRecordMetrics)
        .join(
            ProductionRecordMetrics,
            ProductionRecordMetrics.production_record_id == ProductionRecord.id,
        )
        .where(
            ProductionRecord.production_date >= date_from,
            ProductionRecord.production_date <= date_to,
            ProductionRecordMetrics.formula_version == formula_version,
        )
    )

    if scope_type == SCOPE_MACHINE:
        stmt = stmt.where(ProductionRecord.machine_id == scope_id)
    elif scope_type == SCOPE_PLANT:
        stmt = stmt.where(ProductionRecord.plant_id == scope_id)
    elif scope_type == SCOPE_LINE:
        # Q13: only machines with non-null line_id matching scope (no invented maps).
        stmt = stmt.join(Machine, Machine.id == ProductionRecord.machine_id).where(
            Machine.line_id == scope_id,
            Machine.line_id.is_not(None),
        )
    else:
        raise ValueError(f"unsupported scope_type: {scope_type!r}")

    return stmt


def _load_source_rows(
    session: Session,
    *,
    scope_type: str,
    scope_id: uuid.UUID,
    period_type: str,
    period_start: date,
    formula_version: int,
) -> list[OeeRollupSourceRow]:
    stmt = _build_source_query(
        scope_type=scope_type,
        scope_id=scope_id,
        period_type=period_type,
        period_start=period_start,
        formula_version=formula_version,
    )
    pairs = session.execute(stmt).all()
    rows: list[OeeRollupSourceRow] = []
    for record, metrics in pairs:
        rows.append(
            OeeRollupSourceRow(
                run_time_min=metrics.run_time_min,
                available_time_min=metrics.available_time_min,
                target_qty_per_hr=metrics.target_qty_per_hr,
                produced_qty=record.produced_qty,
                total_rejection_qty=metrics.total_rejection_qty,
            )
        )
    return rows


def rollup_for_period(
    session: Session,
    scope_type: str,
    scope_id: uuid.UUID,
    period_type: str,
    period_start: date,
    formula_version: int = FORMULA_VERSION,
    *,
    aggregation_rule_version: int = AGGREGATION_RULE_VERSION,
) -> OeeSnapshot | None:
    """Compute ratio-of-sums OEE for one scope×period and upsert ``oee_snapshots``.

    Returns the snapshot row, or ``None`` when there are no valid source rows /
    zero denominators (no snapshot written — document: empty ≠ 0% OEE).

    Does not commit. Does not support ``scope_type='department'``.
    """
    if scope_type == "department":
        raise ValueError(
            "department OEE is not supported on oee_snapshots "
            "(scope_type must be machine|line|plant)"
        )
    if scope_type not in SCOPE_TYPES:
        raise ValueError(f"unsupported scope_type: {scope_type!r}")
    if period_type not in PERIOD_TYPES:
        raise ValueError(f"unsupported period_type: {period_type!r}")

    source_rows = _load_source_rows(
        session,
        scope_type=scope_type,
        scope_id=scope_id,
        period_type=period_type,
        period_start=period_start,
        formula_version=formula_version,
    )
    components = compute_oee_components(source_rows)
    if components is None:
        return None

    return upsert_oee_snapshot(
        session,
        scope_type=scope_type,
        scope_id=scope_id,
        period_type=period_type,
        period_start=period_start,
        components=components,
        aggregation_rule_version=aggregation_rule_version,
    )


def rollup_plant_day(
    session: Session,
    plant_id: uuid.UUID,
    production_date: date,
    formula_version: int = FORMULA_VERSION,
) -> OeeSnapshot | None:
    """Convenience: plant × day rollup for ``production_date``."""
    return rollup_for_period(
        session,
        SCOPE_PLANT,
        plant_id,
        PERIOD_DAY,
        production_date,
        formula_version=formula_version,
    )


def rollup_machine_day(
    session: Session,
    machine_id: uuid.UUID,
    production_date: date,
    formula_version: int = FORMULA_VERSION,
) -> OeeSnapshot | None:
    """Convenience: machine × day rollup for ``production_date``."""
    return rollup_for_period(
        session,
        SCOPE_MACHINE,
        machine_id,
        PERIOD_DAY,
        production_date,
        formula_version=formula_version,
    )


def rollup_line_day(
    session: Session,
    line_id: uuid.UUID,
    production_date: date,
    formula_version: int = FORMULA_VERSION,
) -> OeeSnapshot | None:
    """Convenience: line × day (mapped machines only — Q13)."""
    return rollup_for_period(
        session,
        SCOPE_LINE,
        line_id,
        PERIOD_DAY,
        production_date,
        formula_version=formula_version,
    )
