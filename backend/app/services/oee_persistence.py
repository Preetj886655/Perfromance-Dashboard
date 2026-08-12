"""Persist row-level OEE metrics into production_record_metrics.

Calls the approved ``calculate_oee_metrics()`` calculator — formulas are not
duplicated here.

Formula registry
----------------
- ``FORMULA_KEY`` = ``dpr_oee_v1`` (service/calculator constant only)
- ``FORMULA_VERSION`` = ``1`` → stored in ``production_record_metrics.formula_version``

Migration 006 has **no** ``formula_key`` column on ``production_record_metrics``;
do not invent one. Callers that need the string key should read
``app.services.oee_calculator.FORMULA_KEY`` (re-exported below).

Column mapping (calculator → existing DB columns only)
------------------------------------------------------
Raw inputs stay on ``production_records`` / child events — **not** written to
metrics:

- ``planned_downtime_min``, ``produced_qty`` (on production_records)
- per-reason rejection qty / ``rejected_qty`` (on rejection_events; metrics
  stores ``total_rejection_qty`` = Excel AR only)

Persisted metrics columns:

| Calculator field       | Excel | DB column              |
|------------------------|-------|------------------------|
| shift_time_min         | G     | shift_time_min         |
| available_time_min     | P     | available_time_min      |
| total_idle_time_min    | AB    | total_idle_time_min     |
| run_time_min           | AC    | run_time_min            |
| target_qty_per_hr      | M     | target_qty_per_hr       |
| actual_qty_per_hr      | AE    | actual_qty_per_hr       |
| availability           | AD    | availability            |
| performance            | AF    | performance             |
| machine_utilisation    | AG    | machine_utilisation     |
| total_rejection_qty    | AR    | total_rejection_qty     |
| rejection_ppm          | AS    | rejection_ppm           |
| quality                | AT    | quality                 |
| oee                    | AU    | oee                     |
| formula_version        | —     | formula_version (=1)    |
| (computed now UTC)     | —     | computed_at             |

NULL / Q1 behaviour
-------------------
- Calculator ``None`` (Excel IFERROR blank / div-by-zero) is **not** coerced to 0.
- Q1 TBC: when ``stop_at < start_at``, the calculator sets
  ``q1_midnight_unresolved=True`` and leaves time-derived metrics ``None``.
  This layer does **not** invent +24h. Those ``None`` values are assigned to
  the ORM row as SQL NULL.
- **Schema note (Migration 015):** undefined-capable metric columns are
  nullable so Excel-blank calculator outputs persist as SQL NULL. Idle and
  rejection totals plus ``computed_at`` / ``formula_version`` remain NOT NULL.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.downtime_event import DowntimeEvent
from app.models.production_record import ProductionRecord
from app.models.production_record_metrics import ProductionRecordMetrics
from app.models.rejection_event import RejectionEvent
from app.services.oee_calculator import (
    FORMULA_KEY,
    FORMULA_VERSION,
    OeeMetrics,
    calculate_oee_metrics,
)

# Re-export registry identity for callers / tests (no DB formula_key column).
__all__ = [
    "FORMULA_KEY",
    "FORMULA_VERSION",
    "persist_production_record_metrics",
]

T = TypeVar("T")


def _as_list(items: Sequence[T] | None) -> list[T] | None:
    if items is None:
        return None
    return list(items)


def _resolve_downtime_events(
    session: Session,
    production_record: ProductionRecord,
    downtime_events: Sequence[DowntimeEvent] | None,
) -> list[DowntimeEvent]:
    if downtime_events is not None:
        return list(downtime_events)
    # Prefer already-loaded relationship; otherwise query by FK.
    if production_record.id is not None:
        loaded = select(DowntimeEvent).where(
            DowntimeEvent.production_record_id == production_record.id
        )
        return list(session.scalars(loaded).all())
    return list(production_record.downtime_events or [])


def _resolve_rejection_events(
    session: Session,
    production_record: ProductionRecord,
    rejection_events: Sequence[RejectionEvent] | None,
) -> list[RejectionEvent]:
    if rejection_events is not None:
        return list(rejection_events)
    if production_record.id is not None:
        loaded = select(RejectionEvent).where(
            RejectionEvent.production_record_id == production_record.id
        )
        return list(session.scalars(loaded).all())
    return list(production_record.rejection_events or [])


def _apply_metrics_to_row(
    row: ProductionRecordMetrics,
    calculated: OeeMetrics,
    *,
    computed_at: datetime,
) -> None:
    """Map calculator outputs onto existing columns only. None stays None."""
    row.shift_time_min = calculated.shift_time_min
    row.available_time_min = calculated.available_time_min
    row.total_idle_time_min = calculated.total_idle_time_min
    row.run_time_min = calculated.run_time_min
    row.target_qty_per_hr = calculated.target_qty_per_hr
    row.actual_qty_per_hr = calculated.actual_qty_per_hr
    row.availability = calculated.availability
    row.performance = calculated.performance
    row.machine_utilisation = calculated.machine_utilisation
    row.total_rejection_qty = calculated.total_rejection_qty
    row.rejection_ppm = calculated.rejection_ppm
    row.quality = calculated.quality
    row.oee = calculated.oee
    row.computed_at = computed_at
    row.formula_version = FORMULA_VERSION
    # formula_key intentionally not set — column does not exist on this table.


def persist_production_record_metrics(
    session: Session,
    production_record: ProductionRecord,
    downtime_events: Sequence[DowntimeEvent] | None = None,
    rejection_events: Sequence[RejectionEvent] | None = None,
) -> ProductionRecordMetrics:
    """Compute OEE for one production record and upsert ``production_record_metrics``.

    Idempotent on ``production_record_id`` (PK): insert if missing, else update
    calculated columns in place. Does not commit — uses the caller's session.

    Parameters
    ----------
    session:
        Active SQLAlchemy ``Session`` (same pattern as ``app.db.session``).
    production_record:
        Raw production row (must already have a persistent ``id`` for upsert).
    downtime_events / rejection_events:
        Optional explicit child collections. When omitted, loaded from the
        session by ``production_record_id`` (or the ORM relationship).
    """
    if production_record.id is None:
        raise ValueError(
            "production_record.id is required before persisting metrics "
            "(flush the production record first)"
        )

    dt_events = _resolve_downtime_events(
        session, production_record, _as_list(downtime_events)
    )
    rj_events = _resolve_rejection_events(
        session, production_record, _as_list(rejection_events)
    )

    calculated = calculate_oee_metrics(
        start_at=production_record.start_at,
        stop_at=production_record.stop_at,
        cavity_count=production_record.cavity_count,
        cycle_time_sec=production_record.cycle_time_sec,
        produced_qty=production_record.produced_qty,
        planned_downtime_min=production_record.planned_downtime_min,
        downtime_minutes=[e.minutes for e in dt_events],
        rejection_qtys=[e.qty for e in rj_events],
    )

    computed_at = datetime.now(timezone.utc)

    existing = session.get(ProductionRecordMetrics, production_record.id)
    if existing is None:
        row = ProductionRecordMetrics(production_record_id=production_record.id)
        _apply_metrics_to_row(row, calculated, computed_at=computed_at)
        session.add(row)
    else:
        row = existing
        _apply_metrics_to_row(row, calculated, computed_at=computed_at)

    # Caller flushes/commits. Auto-flush is off so callers can inspect the
    # mapped row (including SQL NULL for undefined metrics) before flush.
    return row
