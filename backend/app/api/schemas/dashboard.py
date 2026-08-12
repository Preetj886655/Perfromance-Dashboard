"""Dashboard OEE response models — read-only snapshot fields.

``machine_utilisation`` is NOT a column on ``oee_snapshots`` (AG is row-level
only on ``production_record_metrics``). Responses expose it as JSON null so
clients see a stable shape without inventing or recalculating AG in the API.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer


def _decimal_or_null(value: Decimal | None) -> float | None:
    """Serialize Decimal as JSON number; preserve SQL NULL as JSON null."""
    if value is None:
        return None
    return float(value)


class OeeSnapshotResponse(BaseModel):
    """One ``oee_snapshots`` row (existing columns only + null AG placeholder)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scope_type: str
    scope_id: UUID
    period_type: str
    period_start: date
    sum_run_time_min: Decimal
    sum_available_time_min: Decimal
    sum_produced_qty: Decimal
    sum_good_qty: Decimal
    sum_rejection_qty: Decimal
    sum_run_based_capacity: Decimal
    availability: Decimal
    performance: Decimal
    machine_utilisation: Decimal | None = Field(
        default=None,
        description=(
            "Always null at snapshot grain — column does not exist on "
            "oee_snapshots; AG is not part of period OEE and is not computed here."
        ),
    )
    quality: Decimal
    oee: Decimal
    aggregation_rule_version: int
    computed_at: datetime

    @field_serializer(
        "sum_run_time_min",
        "sum_available_time_min",
        "sum_produced_qty",
        "sum_good_qty",
        "sum_rejection_qty",
        "sum_run_based_capacity",
        "availability",
        "performance",
        "machine_utilisation",
        "quality",
        "oee",
    )
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        return _decimal_or_null(value)


class OeeBreakdownResponse(BaseModel):
    """A/P/Q/OEE plus component sums from an existing snapshot row."""

    model_config = ConfigDict(from_attributes=True)

    scope_type: str
    scope_id: UUID
    period_type: str
    period_start: date
    availability: Decimal
    performance: Decimal
    machine_utilisation: Decimal | None = Field(
        default=None,
        description="Always null — not stored on oee_snapshots; not computed in API.",
    )
    quality: Decimal
    oee: Decimal
    sum_run_time_min: Decimal
    sum_available_time_min: Decimal
    sum_produced_qty: Decimal
    sum_good_qty: Decimal
    sum_rejection_qty: Decimal
    sum_run_based_capacity: Decimal
    aggregation_rule_version: int
    computed_at: datetime

    @field_serializer(
        "availability",
        "performance",
        "machine_utilisation",
        "quality",
        "oee",
        "sum_run_time_min",
        "sum_available_time_min",
        "sum_produced_qty",
        "sum_good_qty",
        "sum_rejection_qty",
        "sum_run_based_capacity",
    )
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        return _decimal_or_null(value)


class OeeSnapshotListResponse(BaseModel):
    """List wrapper for trend / machines / lines / plants endpoints."""

    items: list[OeeSnapshotResponse]
    count: int
