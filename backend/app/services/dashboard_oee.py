"""Read-only dashboard queries over ``oee_snapshots``.

Never recalculates OEE, never averages child percentages, never calls rollup
upsert/recompute. Filters default to ``AGGREGATION_RULE_VERSION`` from the
rollup module.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.line import Line
from app.models.machine import Machine
from app.models.oee_snapshot import OeeSnapshot
from app.services.oee_rollup import (
    AGGREGATION_RULE_VERSION,
    PERIOD_TYPES,
    SCOPE_LINE,
    SCOPE_MACHINE,
    SCOPE_PLANT,
    SCOPE_TYPES,
)

__all__ = [
    "AGGREGATION_RULE_VERSION",
    "PERIOD_TYPES",
    "SCOPE_TYPES",
    "validate_scope_type",
    "validate_period_type",
    "get_oee_snapshot",
    "get_oee_summary",
    "list_oee_trend",
    "list_machine_oee_for_plant",
    "list_line_oee_for_plant",
    "list_plant_oee",
]


def validate_scope_type(value: str) -> str:
    """Return normalized scope_type or raise ValueError."""
    normalized = value.strip().lower()
    if normalized not in SCOPE_TYPES:
        raise ValueError(
            f"Invalid scope_type={value!r}; expected one of "
            f"{sorted(SCOPE_TYPES)}"
        )
    return normalized


def validate_period_type(value: str) -> str:
    """Return normalized period_type or raise ValueError."""
    normalized = value.strip().lower()
    if normalized not in PERIOD_TYPES:
        raise ValueError(
            f"Invalid period_type={value!r}; expected one of "
            f"{sorted(PERIOD_TYPES)}"
        )
    return normalized


def _base_filter(
    *,
    aggregation_rule_version: int = AGGREGATION_RULE_VERSION,
) -> list:
    return [OeeSnapshot.aggregation_rule_version == aggregation_rule_version]


def get_oee_snapshot(
    session: Session,
    *,
    scope_type: str,
    scope_id: UUID,
    period_type: str,
    period_start: date,
    aggregation_rule_version: int = AGGREGATION_RULE_VERSION,
) -> OeeSnapshot | None:
    """Exact scope × period snapshot, or None if absent."""
    stmt = (
        select(OeeSnapshot)
        .where(
            OeeSnapshot.scope_type == scope_type,
            OeeSnapshot.scope_id == scope_id,
            OeeSnapshot.period_type == period_type,
            OeeSnapshot.period_start == period_start,
            *_base_filter(aggregation_rule_version=aggregation_rule_version),
        )
        .limit(1)
    )
    return session.scalars(stmt).first()


def get_oee_summary(
    session: Session,
    *,
    scope_type: str,
    scope_id: UUID,
    period_type: str | None = None,
    aggregation_rule_version: int = AGGREGATION_RULE_VERSION,
) -> OeeSnapshot | None:
    """Latest snapshot for scope (optional period_type), by period_start then computed_at."""
    conditions = [
        OeeSnapshot.scope_type == scope_type,
        OeeSnapshot.scope_id == scope_id,
        *_base_filter(aggregation_rule_version=aggregation_rule_version),
    ]
    if period_type is not None:
        conditions.append(OeeSnapshot.period_type == period_type)

    stmt = (
        select(OeeSnapshot)
        .where(*conditions)
        .order_by(
            OeeSnapshot.period_start.desc(),
            OeeSnapshot.computed_at.desc(),
        )
        .limit(1)
    )
    return session.scalars(stmt).first()


def list_oee_trend(
    session: Session,
    *,
    scope_type: str,
    scope_id: UUID,
    period_type: str,
    period_start_from: date,
    period_start_to: date,
    aggregation_rule_version: int = AGGREGATION_RULE_VERSION,
) -> list[OeeSnapshot]:
    """Chronological snapshots for inclusive period_start range."""
    stmt = (
        select(OeeSnapshot)
        .where(
            OeeSnapshot.scope_type == scope_type,
            OeeSnapshot.scope_id == scope_id,
            OeeSnapshot.period_type == period_type,
            OeeSnapshot.period_start >= period_start_from,
            OeeSnapshot.period_start <= period_start_to,
            *_base_filter(aggregation_rule_version=aggregation_rule_version),
        )
        .order_by(OeeSnapshot.period_start.asc(), OeeSnapshot.computed_at.asc())
    )
    return list(session.scalars(stmt).all())


def list_machine_oee_for_plant(
    session: Session,
    *,
    plant_id: UUID,
    period_type: str,
    period_start: date,
    aggregation_rule_version: int = AGGREGATION_RULE_VERSION,
) -> list[OeeSnapshot]:
    """Machine-scope snapshots whose machine belongs to ``plant_id``."""
    machine_ids = select(Machine.id).where(Machine.plant_id == plant_id)
    stmt: Select[tuple[OeeSnapshot]] = (
        select(OeeSnapshot)
        .where(
            OeeSnapshot.scope_type == SCOPE_MACHINE,
            OeeSnapshot.scope_id.in_(machine_ids),
            OeeSnapshot.period_type == period_type,
            OeeSnapshot.period_start == period_start,
            *_base_filter(aggregation_rule_version=aggregation_rule_version),
        )
        .order_by(OeeSnapshot.scope_id.asc())
    )
    return list(session.scalars(stmt).all())


def list_line_oee_for_plant(
    session: Session,
    *,
    plant_id: UUID,
    period_type: str,
    period_start: date,
    aggregation_rule_version: int = AGGREGATION_RULE_VERSION,
) -> list[OeeSnapshot]:
    """Line-scope snapshots whose line belongs to ``plant_id``."""
    line_ids = select(Line.id).where(Line.plant_id == plant_id)
    stmt = (
        select(OeeSnapshot)
        .where(
            OeeSnapshot.scope_type == SCOPE_LINE,
            OeeSnapshot.scope_id.in_(line_ids),
            OeeSnapshot.period_type == period_type,
            OeeSnapshot.period_start == period_start,
            *_base_filter(aggregation_rule_version=aggregation_rule_version),
        )
        .order_by(OeeSnapshot.scope_id.asc())
    )
    return list(session.scalars(stmt).all())


def list_plant_oee(
    session: Session,
    *,
    period_type: str,
    period_start: date,
    plant_id: UUID | None = None,
    aggregation_rule_version: int = AGGREGATION_RULE_VERSION,
) -> list[OeeSnapshot]:
    """Plant-scope snapshots for a period (optional single-plant filter)."""
    conditions = [
        OeeSnapshot.scope_type == SCOPE_PLANT,
        OeeSnapshot.period_type == period_type,
        OeeSnapshot.period_start == period_start,
        *_base_filter(aggregation_rule_version=aggregation_rule_version),
    ]
    if plant_id is not None:
        conditions.append(OeeSnapshot.scope_id == plant_id)

    stmt = (
        select(OeeSnapshot)
        .where(*conditions)
        .order_by(OeeSnapshot.scope_id.asc())
    )
    return list(session.scalars(stmt).all())
