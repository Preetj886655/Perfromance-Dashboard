"""Production plans — Stage A Migration 012 (PPC / planning).

Plan qty by part for a plan_date and horizon (n / n+1 / n+2 concepts as
configurable VARCHAR — not PG ENUM, no restrictive CHECK). Optional machine
and line FKs (Q13 TBC: line remains optional only).

Schema only — no MRP/BOM/work orders, no stored actual_qty / variance /
achievement%, no PPC APIs or seed plans. Plan vs Actual is a join to
production_records at query time.
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
    from app.models.line import Line
    from app.models.machine import Machine
    from app.models.part import Part


class ProductionPlan(Base):
    """PPC production plan row (part ± machine/line, horizon, plan_qty)."""

    __tablename__ = "production_plans"
    __table_args__ = (
        CheckConstraint(
            "plan_qty >= 0",
            name="ck_production_plans_plan_qty_non_negative",
        ),
        Index("ix_production_plans_part_id_plan_date", "part_id", "plan_date"),
        Index("ix_production_plans_machine_id_plan_date", "machine_id", "plan_date"),
        Index("ix_production_plans_line_id_plan_date", "line_id", "plan_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    plan_date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    # VARCHAR — configurable horizon labels (Stage A n / n+1 / n+2 concepts);
    # not PG ENUM and no restrictive CHECK so values stay extensible.
    horizon: Mapped[str] = mapped_column(String(32), nullable=False)
    part_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parts.id", name="fk_production_plans_part_id_parts"),
        nullable=False,
    )
    # Optional grain — plan may be part-only or part+machine / part+line.
    machine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("machines.id", name="fk_production_plans_machine_id_machines"),
        nullable=True,
    )
    # Q13 TBC — line optional only; do not require machine→line mapping.
    line_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lines.id", name="fk_production_plans_line_id_lines"),
        nullable=True,
    )
    plan_qty: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    # Optional lifecycle label — VARCHAR not PG ENUM.
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    part: Mapped[Part] = relationship("Part", back_populates="production_plans")
    machine: Mapped[Machine | None] = relationship(
        "Machine", back_populates="production_plans"
    )
    line: Mapped[Line | None] = relationship("Line", back_populates="production_plans")
