"""KPI definitions — Stage A Migration 008 (KPI registry).

Configuration registry only. Calculation is keyed by formula_key + formula_version
into a versioned backend calculator registry — no executable user-entered
formula_expression / SQL columns.

Weights are admin-configurable (Q17 TBC); no CHECK forcing equal weights.
owner_role_id FK → roles.id added in Migration 009.
"""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.kpi_result import KpiResult
    from app.models.role import Role


class KpiDefinition(Base):
    """Admin-configurable KPI registry entry (non-OEE department KPIs).

    OEE remains on production_record_metrics / oee_snapshots — do not duplicate here.
    Q17 TBC: weight is configurable; equal weights are an app-level placeholder only.
    """

    __tablename__ = "kpi_definitions"
    __table_args__ = (
        UniqueConstraint(
            "code",
            "version",
            name="uq_kpi_definitions_code_version",
        ),
        Index(
            "ix_kpi_definitions_formula_key_formula_version",
            "formula_key",
            "formula_version",
        ),
        Index(
            "ix_kpi_definitions_is_active_effective_from",
            "is_active",
            "effective_from",
        ),
        CheckConstraint(
            "aggregation_method IN ("
            "'SUM', 'RATIO_OF_SUMS', 'COUNT', 'LATEST', 'WAVG'"
            ")",
            name="ck_kpi_definitions_aggregation_method",
        ),
        CheckConstraint(
            "formula_version >= 1",
            name="ck_kpi_definitions_formula_version_positive",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_kpi_definitions_version_positive",
        ),
        CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_kpi_definitions_effective_range",
        ),
        # weight intentionally unconstrained (Q17 TBC — no fixed-equal-weight CHECK)
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "departments.id",
            name="fk_kpi_definitions_department_id_departments",
        ),
        nullable=False,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Stable key into versioned backend calculation registry (not executable SQL).
    formula_key: Mapped[str] = mapped_column(String(128), nullable=False)
    formula_version: Mapped[int] = mapped_column(Integer, nullable=False)
    # VARCHAR + CHECK (not PG ENUM): Stage A aggregation methods.
    aggregation_method: Mapped[str] = mapped_column(String(32), nullable=False)
    target: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    warning_threshold: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6), nullable=True
    )
    critical_threshold: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6), nullable=True
    )
    # Q17 TBC — admin-configurable; no DB CHECK forcing equal weights.
    weight: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    # App-validated frequency label (e.g. shift/day/week/month) — not PG ENUM.
    frequency: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # FK → roles (attached in Migration 009); nullable ownership role.
    owner_role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "roles.id",
            name="fk_kpi_definitions_owner_role_id_roles",
        ),
        nullable=True,
        index=True,
    )
    # Definition configuration version (distinct from formula_version).
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("1"),
    )
    effective_from: Mapped[dt.date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
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

    department: Mapped[Department] = relationship("Department")
    owner_role: Mapped[Role | None] = relationship(
        "Role",
        back_populates="owned_kpi_definitions",
    )
    results: Mapped[list[KpiResult]] = relationship(
        "KpiResult",
        back_populates="kpi_definition",
        cascade="all, delete-orphan",
    )
