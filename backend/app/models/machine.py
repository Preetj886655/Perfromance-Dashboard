"""Machine master — Stage A Migration 003 (asset/people masters).

Q13 TBC: line_id remains nullable — no hard-coded machine→line mappings.
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
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.line import Line
    from app.models.machine_part_standard import MachinePartStandard
    from app.models.machine_status import MachineStatus
    from app.models.machine_type import MachineType
    from app.models.maintenance_ticket import MaintenanceTicket
    from app.models.plant import Plant
    from app.models.pm_completion import PmCompletion
    from app.models.pm_schedule import PmSchedule
    from app.models.production_plan import ProductionPlan
    from app.models.quality_inspection import QualityInspection


class Machine(Base):
    """Plant asset identity for DPR / OEE (Excel col D)."""

    __tablename__ = "machines"
    __table_args__ = (
        UniqueConstraint("plant_id", "code", name="uq_machines_plant_id_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", name="fk_machines_plant_id_plants"),
        nullable=False,
        index=True,
    )
    # Q13 TBC — optional line grouping only when mapping is known.
    line_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lines.id", name="fk_machines_line_id_lines"),
        nullable=True,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    machine_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("machine_types.id", name="fk_machines_machine_type_id_machine_types"),
        nullable=False,
        index=True,
    )
    status_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("machine_statuses.id", name="fk_machines_status_id_machine_statuses"),
        nullable=False,
        index=True,
    )
    ideal_cycle_time_sec: Mapped[Decimal | None] = mapped_column(
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

    plant: Mapped[Plant] = relationship("Plant", back_populates="machines")
    line: Mapped[Line | None] = relationship("Line", back_populates="machines")
    machine_type: Mapped[MachineType] = relationship(
        "MachineType", back_populates="machines"
    )
    status: Mapped[MachineStatus] = relationship(
        "MachineStatus", back_populates="machines"
    )
    machine_part_standards: Mapped[list[MachinePartStandard]] = relationship(
        "MachinePartStandard", back_populates="machine"
    )
    maintenance_tickets: Mapped[list[MaintenanceTicket]] = relationship(
        "MaintenanceTicket", back_populates="machine"
    )
    pm_schedules: Mapped[list[PmSchedule]] = relationship(
        "PmSchedule", back_populates="machine"
    )
    pm_completions: Mapped[list[PmCompletion]] = relationship(
        "PmCompletion", back_populates="machine"
    )
    production_plans: Mapped[list[ProductionPlan]] = relationship(
        "ProductionPlan", back_populates="machine"
    )
    quality_inspections: Mapped[list[QualityInspection]] = relationship(
        "QualityInspection", back_populates="machine"
    )
