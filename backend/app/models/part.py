"""Part master — Stage A Migration 004 (part/reason masters).

Excel cols I/J (Part Name / Part No.); defaults for K/L (cavity / cycle time).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Numeric, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.customer_complaint import CustomerComplaint
    from app.models.dispatch_record import DispatchRecord
    from app.models.machine_part_standard import MachinePartStandard
    from app.models.production_plan import ProductionPlan
    from app.models.quality_inspection import QualityInspection


class Part(Base):
    """Part identity (code + name) with optional default cavity / cycle time."""

    __tablename__ = "parts"
    __table_args__ = (UniqueConstraint("code", name="uq_parts_code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_cavity: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )
    default_cycle_time_sec: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4),
        nullable=True,
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

    machine_part_standards: Mapped[list[MachinePartStandard]] = relationship(
        "MachinePartStandard", back_populates="part"
    )
    production_plans: Mapped[list[ProductionPlan]] = relationship(
        "ProductionPlan", back_populates="part"
    )
    quality_inspections: Mapped[list[QualityInspection]] = relationship(
        "QualityInspection", back_populates="part"
    )
    customer_complaints: Mapped[list[CustomerComplaint]] = relationship(
        "CustomerComplaint", back_populates="part"
    )
    dispatch_records: Mapped[list[DispatchRecord]] = relationship(
        "DispatchRecord", back_populates="part"
    )
