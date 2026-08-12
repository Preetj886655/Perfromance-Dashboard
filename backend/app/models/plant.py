"""Plant master — Stage A Migration 002 (org masters)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.dispatch_record import DispatchRecord
    from app.models.grn_record import GrnRecord
    from app.models.inventory_snapshot import InventorySnapshot
    from app.models.line import Line
    from app.models.machine import Machine
    from app.models.material import Material
    from app.models.shift import Shift
    from app.models.shift_calendar import ShiftCalendar


class Plant(Base):
    """Site / plant scope (Q11 multi-plant readiness; seed later)."""

    __tablename__ = "plants"
    __table_args__ = (UniqueConstraint("code", name="uq_plants_code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
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

    lines: Mapped[list[Line]] = relationship("Line", back_populates="plant")
    machines: Mapped[list[Machine]] = relationship("Machine", back_populates="plant")
    shifts: Mapped[list[Shift]] = relationship("Shift", back_populates="plant")
    shift_calendars: Mapped[list[ShiftCalendar]] = relationship(
        "ShiftCalendar", back_populates="plant"
    )
    materials: Mapped[list[Material]] = relationship(
        "Material", back_populates="plant"
    )
    inventory_snapshots: Mapped[list[InventorySnapshot]] = relationship(
        "InventorySnapshot", back_populates="plant"
    )
    grn_records: Mapped[list[GrnRecord]] = relationship(
        "GrnRecord", back_populates="plant"
    )
    dispatch_records: Mapped[list[DispatchRecord]] = relationship(
        "DispatchRecord", back_populates="plant"
    )
