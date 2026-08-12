"""PM schedules — Stage A Migration 011 (maintenance).

Preventive maintenance schedule per machine. frequency_config is JSONB so
interval / cadence stays configurable without a rigid interval schema.

Schema only — no scheduling engine, reminders, workers, or seed schedules.
MTTR / MTBF / PM% are derived KPIs (not stored columns).
"""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.machine import Machine
    from app.models.pm_completion import PmCompletion
    from app.models.user import User


class PmSchedule(Base):
    """Preventive maintenance schedule definition for one machine."""

    __tablename__ = "pm_schedules"
    __table_args__ = (
        UniqueConstraint("machine_id", "code", name="uq_pm_schedules_machine_id_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("machines.id", name="fk_pm_schedules_machine_id_machines"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Flexible frequency (e.g. interval days, calendar rules) — not a rigid model.
    frequency_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    next_due_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
        index=True,
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            name="fk_pm_schedules_owner_id_users",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
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

    machine: Mapped[Machine] = relationship("Machine", back_populates="pm_schedules")
    owner: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[owner_id],
        back_populates="owned_pm_schedules",
    )
    completions: Mapped[list[PmCompletion]] = relationship(
        "PmCompletion",
        back_populates="pm_schedule",
        cascade="all, delete-orphan",
    )
