"""Production record metrics — Stage A Migration 006 (calculated / OEE).

1:1 with production_records. Row-level Excel DPR_OEE calculated columns only.
No PG generated columns; values are written by the OEE calculation engine.

AF = performance (OEE P term). AG = machine_utilisation (parallel KPI, not OEE P).

Migration 015: ratio / derived columns that can be Excel blank (calculator None)
are nullable. Idle/rejection totals and metadata remain NOT NULL.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.production_record import ProductionRecord


class ProductionRecordMetrics(Base):
    """Calculated KPI row for one production_record (Excel G, M, P, AB–AG, AR–AU).

    production_record_id is both PK and FK (ON DELETE CASCADE) — strict 1:1.
    """

    __tablename__ = "production_record_metrics"
    __table_args__ = (
        CheckConstraint(
            "shift_time_min >= 0",
            name="ck_production_record_metrics_shift_time_min_nonneg",
        ),
        CheckConstraint(
            "available_time_min >= 0",
            name="ck_production_record_metrics_available_time_min_nonneg",
        ),
        CheckConstraint(
            "total_idle_time_min >= 0",
            name="ck_production_record_metrics_total_idle_time_min_nonneg",
        ),
        CheckConstraint(
            "run_time_min >= 0",
            name="ck_production_record_metrics_run_time_min_nonneg",
        ),
        CheckConstraint(
            "target_qty_per_hr >= 0",
            name="ck_production_record_metrics_target_qty_per_hr_nonneg",
        ),
        CheckConstraint(
            "actual_qty_per_hr >= 0",
            name="ck_production_record_metrics_actual_qty_per_hr_nonneg",
        ),
        CheckConstraint(
            "total_rejection_qty >= 0",
            name="ck_production_record_metrics_total_rejection_qty_nonneg",
        ),
        CheckConstraint(
            "rejection_ppm >= 0",
            name="ck_production_record_metrics_rejection_ppm_nonneg",
        ),
        CheckConstraint(
            "availability >= 0",
            name="ck_production_record_metrics_availability_nonneg",
        ),
        CheckConstraint(
            "performance >= 0",
            name="ck_production_record_metrics_performance_nonneg",
        ),
        CheckConstraint(
            "machine_utilisation >= 0",
            name="ck_production_record_metrics_machine_utilisation_nonneg",
        ),
        CheckConstraint(
            "quality >= 0",
            name="ck_production_record_metrics_quality_nonneg",
        ),
        CheckConstraint(
            "oee >= 0",
            name="ck_production_record_metrics_oee_nonneg",
        ),
    )

    production_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "production_records.id",
            name="fk_production_record_metrics_production_record_id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )
    # Excel G — (stop_at − start_at) in minutes; NULL when Q1 unresolved / missing
    shift_time_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    # Excel P — shift_time − planned_downtime; NULL when G unresolved
    available_time_min: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4), nullable=True
    )
    # Excel AB — Σ unplanned idle (blank reasons sum as 0; always defined)
    total_idle_time_min: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    # Excel AC — available − total idle; NULL when P unresolved
    run_time_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    # Excel M — NULL on zero/missing cavity or cycle
    target_qty_per_hr: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 4), nullable=True
    )
    # Excel AE — NULL when run_time undefined or zero
    actual_qty_per_hr: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 4), nullable=True
    )
    # Excel AD (Availability A) — NULL on div-by-zero / missing
    availability: Mapped[Decimal | None] = mapped_column(Numeric(12, 8), nullable=True)
    # Excel AF — OEE Performance term (P); NOT machine_utilisation
    performance: Mapped[Decimal | None] = mapped_column(Numeric(12, 8), nullable=True)
    # Excel AG — Machine Utilisation; parallel KPI, NOT the OEE P term
    machine_utilisation: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 8), nullable=True
    )
    # Excel AR — always defined (blank rejections sum as 0)
    total_rejection_qty: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    # Excel AS — NULL when produced_qty = 0
    rejection_ppm: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    # Excel AT (Quality Q) — NULL when produced_qty = 0
    quality: Mapped[Decimal | None] = mapped_column(Numeric(12, 8), nullable=True)
    # Excel AU — A × P × Q (P = performance / AF); NULL if any factor undefined
    oee: Mapped[Decimal | None] = mapped_column(Numeric(12, 8), nullable=True)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    # Version of the row-level calculator registry entry that wrote this row.
    formula_version: Mapped[int] = mapped_column(Integer, nullable=False)

    production_record: Mapped[ProductionRecord] = relationship(
        "ProductionRecord",
        back_populates="metrics",
    )
