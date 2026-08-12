"""KPI results — Stage A Migration 008 (KPI registry).

Non-OEE KPI snapshots keyed by definition × polymorphic scope × period.
Scope pattern matches oee_snapshots (scope_type + scope_id); department added
as a known org dimension for department KPIs. Does not duplicate OEE storage.
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.kpi_definition import KpiDefinition


class KpiResult(Base):
    """Stored KPI result for a definition at a scope × period grain.

    formula_key / formula_version snapshot which registered calculator produced
    the value (historical integrity when definitions change).
    """

    __tablename__ = "kpi_results"
    __table_args__ = (
        UniqueConstraint(
            "kpi_definition_id",
            "scope_type",
            "scope_id",
            "period_type",
            "period_start",
            "formula_version",
            name="uq_kpi_results_definition_scope_period_formula",
        ),
        Index(
            "ix_kpi_results_period_type_period_start_scope_type",
            "period_type",
            "period_start",
            "scope_type",
        ),
        Index(
            "ix_kpi_results_scope_type_scope_id_period_type_period_start",
            "scope_type",
            "scope_id",
            "period_type",
            desc(column("period_start")),
        ),
        CheckConstraint(
            "scope_type IN ('plant', 'department', 'line', 'machine')",
            name="ck_kpi_results_scope_type",
        ),
        CheckConstraint(
            "period_type IN ('day', 'week', 'month')",
            name="ck_kpi_results_period_type",
        ),
        CheckConstraint(
            "formula_version >= 1",
            name="ck_kpi_results_formula_version_positive",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    kpi_definition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "kpi_definitions.id",
            name="fk_kpi_results_kpi_definition_id_kpi_definitions",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    # VARCHAR codes (not PG ENUM): plant | department | line | machine
    scope_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # Polymorphic: plants/departments/lines/machines.id per scope_type (app-enforced)
    scope_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # VARCHAR codes (not PG ENUM): day | week | month — aligned with oee_snapshots
    period_type: Mapped[str] = mapped_column(String(16), nullable=False)
    period_start: Mapped[dt.date] = mapped_column(Date, nullable=False)

    result_value: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    # Snapshot of target / achievement at compute time (Overall KPI points).
    target_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    achievement: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)

    # Calculator identity that produced this row (may lag definition updates).
    formula_key: Mapped[str] = mapped_column(String(128), nullable=False)
    formula_version: Mapped[int] = mapped_column(Integer, nullable=False)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
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

    kpi_definition: Mapped[KpiDefinition] = relationship(
        "KpiDefinition",
        back_populates="results",
    )
