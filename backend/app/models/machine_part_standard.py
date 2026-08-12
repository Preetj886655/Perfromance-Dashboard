"""Machine×part defaults — Stage A Migration 004 (part/reason masters).

RECOMMENDED defaults for cycle time / cavities when a machine runs a part.
Does not change Excel OEE formulas; production_records still store row values.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Numeric,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.machine import Machine
    from app.models.part import Part


class MachinePartStandard(Base):
    """Optional per-machine defaults for a part (cycle time, cavity count)."""

    __tablename__ = "machine_part_standards"
    __table_args__ = (
        UniqueConstraint(
            "machine_id",
            "part_id",
            name="uq_machine_part_standards_machine_id_part_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("machines.id", name="fk_machine_part_standards_machine_id_machines"),
        nullable=False,
        index=True,
    )
    part_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parts.id", name="fk_machine_part_standards_part_id_parts"),
        nullable=False,
        index=True,
    )
    cycle_time_sec: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4),
        nullable=True,
    )
    cavity_count: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
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

    machine: Mapped[Machine] = relationship(
        "Machine", back_populates="machine_part_standards"
    )
    part: Mapped[Part] = relationship(
        "Part", back_populates="machine_part_standards"
    )
