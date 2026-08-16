"""Production raw record — Stage A Migration 005 (production raw).

Excel DPR_OEE raw inputs only. Calculated OEE columns belong in Migration 006
(production_record_metrics), not here.

Q1 TBC: production_date is stored separately from start_at/stop_at — no
midnight attribution rule is encoded in schema.

Migration 007 adds FK source_import_id → import_jobs and partial unique on
external_row_key for idempotent upserts.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.downtime_event import DowntimeEvent
    from app.models.import_job import ImportJob
    from app.models.machine import Machine
    from app.models.operator import Operator
    from app.models.part import Part
    from app.models.plant import Plant
    from app.models.production_record_metrics import ProductionRecordMetrics
    from app.models.quality_inspection import QualityInspection
    from app.models.rejection_event import RejectionEvent
    from app.models.shift import Shift


class ProductionRecord(Base):
    """One machine × shift × date × part run (Excel practice grain).

    Deferred FKs (documented):
    - created_by / approved_by → users (Migration 009) — nullable UUID, no FK yet

    Lineage (Migration 007): source_import_id → import_jobs (nullable).
    """

    __tablename__ = "production_records"
    __table_args__ = (
        UniqueConstraint(
            "machine_id",
            "shift_id",
            "production_date",
            "part_id",
            "start_at",
            name="uq_production_records_machine_shift_date_part_start",
        ),
        Index(
            "uq_production_records_external_row_key",
            "external_row_key",
            unique=True,
            postgresql_where=text("external_row_key IS NOT NULL"),
        ),
        Index(
            "ix_production_records_plant_id_production_date_shift_id",
            "plant_id",
            "production_date",
            "shift_id",
        ),
        Index(
            "ix_production_records_machine_id_production_date_shift_id",
            "machine_id",
            "production_date",
            "shift_id",
        ),
        Index(
            "ix_production_records_part_id_production_date",
            "part_id",
            "production_date",
        ),
        Index(
            "ix_production_records_data_source",
            "data_source",
        ),
        Index(
            "ix_production_records_source_identifier",
            "source_identifier",
        ),
        Index(
            "ix_production_records_imported_at",
            "imported_at",
        ),
        Index(
            "ix_production_records_is_duplicate",
            "is_duplicate",
        ),
        Index(
            "ix_production_records_source_trace",
            "data_source",
            "source_identifier",
            "original_row_number",
        ),
        Index(
            "uq_production_records_data_source_source_identifier_row",
            "data_source",
            "source_identifier",
            "original_row_number",
            unique=True,
            postgresql_where=text(
                "is_duplicate IS FALSE AND source_identifier IS NOT NULL AND original_row_number IS NOT NULL"
            ),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", name="fk_production_records_plant_id_plants"),
        nullable=False,
        index=True,
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("machines.id", name="fk_production_records_machine_id_machines"),
        nullable=False,
        index=True,
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shifts.id", name="fk_production_records_shift_id_shifts"),
        nullable=False,
        index=True,
    )
    # Nullable when import allows unknown operator (Stage A column map).
    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("operators.id", name="fk_production_records_operator_id_operators"),
        nullable=True,
        index=True,
    )
    part_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parts.id", name="fk_production_records_part_id_parts"),
        nullable=False,
        index=True,
    )
    # Business/shift attribution date — Q1 midnight policy remains TBC.
    production_date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    start_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    stop_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    cavity_count: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    cycle_time_sec: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    produced_qty: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    planned_downtime_min: Mapped[Decimal] = mapped_column(
        Numeric(12, 4),
        nullable=False,
        server_default=text("0"),
    )
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    custom_fields: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    # Lineage — FK to import_jobs added in Migration 007.
    source_import_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "import_jobs.id",
            name="fk_production_records_source_import_id_import_jobs",
        ),
        nullable=True,
        index=True,
    )
    # VARCHAR classifier (not PG ENUM) — e.g. excel, csv, form, sheets, manual, api.
    source_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # External-source lineage for traceability during imports and syncs.
    data_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_identifier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    imported_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    original_row_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_duplicate: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    external_row_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Soft approval: draft → submitted → approved (VARCHAR, not PG ENUM).
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'draft'"),
    )
    # FKs to users deferred to Migration 009.
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    plant: Mapped[Plant] = relationship("Plant")
    machine: Mapped[Machine] = relationship("Machine")
    shift: Mapped[Shift] = relationship("Shift")
    operator: Mapped[Operator | None] = relationship("Operator")
    part: Mapped[Part] = relationship("Part")
    downtime_events: Mapped[list[DowntimeEvent]] = relationship(
        "DowntimeEvent",
        back_populates="production_record",
        cascade="all, delete-orphan",
    )
    rejection_events: Mapped[list[RejectionEvent]] = relationship(
        "RejectionEvent",
        back_populates="production_record",
        cascade="all, delete-orphan",
    )
    # 1:1 calculated row (Migration 006) — optional until engine writes metrics.
    metrics: Mapped[ProductionRecordMetrics | None] = relationship(
        "ProductionRecordMetrics",
        back_populates="production_record",
        uselist=False,
        cascade="all, delete-orphan",
    )
    source_import: Mapped[ImportJob | None] = relationship(
        "ImportJob",
        back_populates="production_records",
        foreign_keys=[source_import_id],
    )
    quality_inspections: Mapped[list[QualityInspection]] = relationship(
        "QualityInspection", back_populates="production_record"
    )
