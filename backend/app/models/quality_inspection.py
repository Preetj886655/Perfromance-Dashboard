"""Quality inspections — Stage A Migration 013 (quality extended).

In-process / final inspection lots for DOCX Inspection Pass Rate and Final PPM
inputs. Pass rate / PPM are not stored — KPI engine computes them.

Schema only — no quality APIs, seeds, or calculators.
inspection_type / result_status are VARCHAR (not PG ENUM).
"""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.machine import Machine
    from app.models.part import Part
    from app.models.production_record import ProductionRecord
    from app.models.user import User


class QualityInspection(Base):
    """Inspection lot (in-process / final) with inspected / passed / rejected qty."""

    __tablename__ = "quality_inspections"
    __table_args__ = (
        CheckConstraint(
            "inspected_qty >= 0",
            name="ck_quality_inspections_inspected_qty_non_negative",
        ),
        CheckConstraint(
            "passed_qty >= 0",
            name="ck_quality_inspections_passed_qty_non_negative",
        ),
        CheckConstraint(
            "rejected_qty >= 0",
            name="ck_quality_inspections_rejected_qty_non_negative",
        ),
        Index(
            "ix_quality_inspections_part_id_inspection_date",
            "part_id",
            "inspection_date",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    inspection_date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    # VARCHAR — in_process / final concepts; not PG ENUM; no restrictive CHECK.
    inspection_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    part_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parts.id", name="fk_quality_inspections_part_id_parts"),
        nullable=False,
    )
    machine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("machines.id", name="fk_quality_inspections_machine_id_machines"),
        nullable=True,
        index=True,
    )
    production_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "production_records.id",
            name="fk_quality_inspections_production_record_id_production_records",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    lot_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    inspected_qty: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    passed_qty: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    rejected_qty: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    # Optional outcome label — VARCHAR not PG ENUM.
    result_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    inspected_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            name="fk_quality_inspections_inspected_by_users",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    part: Mapped[Part] = relationship("Part", back_populates="quality_inspections")
    machine: Mapped[Machine | None] = relationship(
        "Machine", back_populates="quality_inspections"
    )
    production_record: Mapped[ProductionRecord | None] = relationship(
        "ProductionRecord", back_populates="quality_inspections"
    )
    inspector: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[inspected_by],
        back_populates="quality_inspections",
    )
