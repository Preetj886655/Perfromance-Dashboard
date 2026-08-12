"""Production record / metrics / events response models (row-level only)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_serializer


def _decimal_or_null(value: Decimal | None) -> float | None:
    """Serialize Decimal as JSON number; preserve SQL NULL as JSON null."""
    if value is None:
        return None
    return float(value)


class ProductionRecordRawResponse(BaseModel):
    """RAW production record + lineage. No calculated OEE fields."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    production_date: date
    start_at: datetime
    stop_at: datetime
    plant_id: UUID
    machine_id: UUID
    shift_id: UUID
    operator_id: UUID | None = None
    part_id: UUID
    cavity_count: Decimal
    cycle_time_sec: Decimal
    produced_qty: Decimal
    planned_downtime_min: Decimal
    remarks: str | None = None
    custom_fields: dict[str, Any] = {}
    source_import_id: UUID | None = None
    source_type: str | None = None
    external_row_key: str | None = None
    status: str
    created_by: UUID | None = None
    approved_by: UUID | None = None
    created_at: datetime
    updated_at: datetime

    @field_serializer(
        "cavity_count",
        "cycle_time_sec",
        "produced_qty",
        "planned_downtime_min",
    )
    def serialize_decimal(self, value: Decimal) -> float:
        return float(value)


class ProductionRecordMetricsResponse(BaseModel):
    """Persisted row-level OEE metrics. SQL NULL → JSON null (not zero)."""

    model_config = ConfigDict(from_attributes=True)

    production_record_id: UUID
    shift_time_min: Decimal | None = None
    available_time_min: Decimal | None = None
    total_idle_time_min: Decimal
    run_time_min: Decimal | None = None
    target_qty_per_hr: Decimal | None = None
    actual_qty_per_hr: Decimal | None = None
    availability: Decimal | None = None
    performance: Decimal | None = None
    machine_utilisation: Decimal | None = None
    total_rejection_qty: Decimal
    rejection_ppm: Decimal | None = None
    quality: Decimal | None = None
    oee: Decimal | None = None
    computed_at: datetime
    formula_version: int

    @field_serializer(
        "shift_time_min",
        "available_time_min",
        "total_idle_time_min",
        "run_time_min",
        "target_qty_per_hr",
        "actual_qty_per_hr",
        "availability",
        "performance",
        "machine_utilisation",
        "total_rejection_qty",
        "rejection_ppm",
        "quality",
        "oee",
    )
    def serialize_metric(self, value: Decimal | None) -> float | None:
        return _decimal_or_null(value)


class DowntimeEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    production_record_id: UUID
    downtime_reason_id: UUID
    minutes: Decimal
    created_at: datetime
    updated_at: datetime

    @field_serializer("minutes")
    def serialize_minutes(self, value: Decimal) -> float:
        return float(value)


class RejectionEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    production_record_id: UUID
    rejection_reason_id: UUID
    qty: Decimal
    created_at: datetime
    updated_at: datetime

    @field_serializer("qty")
    def serialize_qty(self, value: Decimal) -> float:
        return float(value)


class ProductionRecordEventsResponse(BaseModel):
    """Downtime and rejection as separate collections."""

    downtime_events: list[DowntimeEventResponse]
    rejection_events: list[RejectionEventResponse]
