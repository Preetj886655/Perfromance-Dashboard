"""Shift master — Stage A Migration 003 (asset/people masters).

Q1 TBC: crosses_midnight is a configurable flag only — does not encode
shift-date attribution rules.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.plant import Plant
    from app.models.shift_calendar import ShiftCalendar


class Shift(Base):
    """Named plant shift with start/end times (Excel col C)."""

    __tablename__ = "shifts"
    __table_args__ = (
        UniqueConstraint("plant_id", "code", name="uq_shifts_plant_id_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", name="fk_shifts_plant_id_plants"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    start_time: Mapped[dt.time] = mapped_column(Time, nullable=False)
    end_time: Mapped[dt.time] = mapped_column(Time, nullable=False)
    crosses_midnight: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    plant: Mapped[Plant] = relationship("Plant", back_populates="shifts")
    shift_calendars: Mapped[list[ShiftCalendar]] = relationship(
        "ShiftCalendar", back_populates="shift"
    )
