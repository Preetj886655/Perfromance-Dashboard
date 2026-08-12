"""OEE snapshots — Stage A Migration 006 (calculated / OEE).

Precomputed rollups by polymorphic scope × period. Component sums support
RATIO-OF-SUMS aggregation (proposed default for Q6 — TBC, not confirmed).

Scope identity is scope_type + scope_id only — no parallel plant_id / line_id /
machine_id FK columns on this table (Stage A chosen design).
"""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    column,
    desc,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OeeSnapshot(Base):
    """Period rollup snapshot for machine | line | plant × day | week | month.

    Q6 TBC: component-sum + stored-ratio columns assume proposed default
    ratio-of-sums (run-time weighted Performance). Not business-confirmed.
    Q11 / Q13: plant and line scopes are schema-ready only; mapping unresolved.
    """

    __tablename__ = "oee_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "scope_type",
            "scope_id",
            "period_type",
            "period_start",
            "aggregation_rule_version",
            name="uq_oee_snapshots_scope_period_rule",
        ),
        Index(
            "ix_oee_snapshots_period_type_period_start_scope_type",
            "period_type",
            "period_start",
            "scope_type",
        ),
        Index(
            "ix_oee_snapshots_scope_type_scope_id_period_type_period_start",
            "scope_type",
            "scope_id",
            "period_type",
            desc(column("period_start")),
        ),
        CheckConstraint(
            "scope_type IN ('machine', 'line', 'plant')",
            name="ck_oee_snapshots_scope_type",
        ),
        CheckConstraint(
            "period_type IN ('day', 'week', 'month')",
            name="ck_oee_snapshots_period_type",
        ),
        CheckConstraint(
            "sum_run_time_min >= 0",
            name="ck_oee_snapshots_sum_run_time_min_nonneg",
        ),
        CheckConstraint(
            "sum_available_time_min >= 0",
            name="ck_oee_snapshots_sum_available_time_min_nonneg",
        ),
        CheckConstraint(
            "sum_produced_qty >= 0",
            name="ck_oee_snapshots_sum_produced_qty_nonneg",
        ),
        CheckConstraint(
            "sum_good_qty >= 0",
            name="ck_oee_snapshots_sum_good_qty_nonneg",
        ),
        CheckConstraint(
            "sum_rejection_qty >= 0",
            name="ck_oee_snapshots_sum_rejection_qty_nonneg",
        ),
        CheckConstraint(
            "sum_run_based_capacity >= 0",
            name="ck_oee_snapshots_sum_run_based_capacity_nonneg",
        ),
        CheckConstraint(
            "availability >= 0",
            name="ck_oee_snapshots_availability_nonneg",
        ),
        CheckConstraint(
            "performance >= 0",
            name="ck_oee_snapshots_performance_nonneg",
        ),
        CheckConstraint(
            "quality >= 0",
            name="ck_oee_snapshots_quality_nonneg",
        ),
        CheckConstraint(
            "oee >= 0",
            name="ck_oee_snapshots_oee_nonneg",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # VARCHAR codes (not PG ENUM): machine | line | plant
    scope_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # Polymorphic: machines.id / lines.id / plants.id per scope_type (app-enforced)
    scope_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # VARCHAR codes (not PG ENUM): day | week | month
    period_type: Mapped[str] = mapped_column(String(16), nullable=False)
    period_start: Mapped[dt.date] = mapped_column(Date, nullable=False)

    # --- Component sums for proposed RATIO-OF-SUMS (Q6 TBC — not confirmed) ---
    # A_period = sum_run_time_min / sum_available_time_min
    sum_run_time_min: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    sum_available_time_min: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    # Q_period = sum_good_qty / sum_produced_qty; also sum_rejection for Pareto/PPM
    sum_produced_qty: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)
    sum_good_qty: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)
    sum_rejection_qty: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)
    # P_period denominator: Σ (run_time_min/60 × target_qty_per_hr) — Q6 proposed
    sum_run_based_capacity: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)

    # Stored ratios for this grain (computed from component sums by engine)
    availability: Mapped[Decimal] = mapped_column(Numeric(12, 8), nullable=False)
    performance: Mapped[Decimal] = mapped_column(Numeric(12, 8), nullable=False)
    quality: Mapped[Decimal] = mapped_column(Numeric(12, 8), nullable=False)
    oee: Mapped[Decimal] = mapped_column(Numeric(12, 8), nullable=False)

    # Identifies which aggregation rule wrote this row (Q6 TBC placeholder)
    aggregation_rule_version: Mapped[int] = mapped_column(Integer, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
