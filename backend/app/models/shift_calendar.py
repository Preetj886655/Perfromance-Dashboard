"""Shift calendar — Stage A Migration 003 (asset/people masters)."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.plant import Plant
    from app.models.shift import Shift


class ShiftCalendar(Base):
    """Working-day / holiday / shift pattern entry per plant."""

    __tablename__ = "shift_calendars"
    __table_args__ = (
        UniqueConstraint(
            "plant_id",
            "calendar_date",
            "shift_id",
            name="uq_shift_calendars_plant_id_calendar_date_shift_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", name="fk_shift_calendars_plant_id_plants"),
        nullable=False,
        index=True,
    )
    calendar_date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shifts.id", name="fk_shift_calendars_shift_id_shifts"),
        nullable=False,
        index=True,
    )
    is_holiday: Mapped[bool] = mapped_column(
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

    plant: Mapped[Plant] = relationship("Plant", back_populates="shift_calendars")
    shift: Mapped[Shift] = relationship("Shift", back_populates="shift_calendars")
