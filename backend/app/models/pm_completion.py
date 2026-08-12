"""PM completions — Stage A Migration 011 (maintenance).

Completed preventive maintenance against a pm_schedule. machine_id is
denormalized for history queries; app should copy schedule.machine_id at
insert time. No DB trigger enforcing machine_id == schedule.machine_id.

Schema only — no PM% stored column, no scheduling workers, no seed rows.
result_status is VARCHAR (not PG ENUM).
"""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.machine import Machine
    from app.models.pm_schedule import PmSchedule
    from app.models.user import User


class PmCompletion(Base):
    """Record that a preventive maintenance schedule item was completed."""

    __tablename__ = "pm_completions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    pm_schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "pm_schedules.id",
            name="fk_pm_completions_pm_schedule_id_pm_schedules",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    # Denormalized from pm_schedules.machine_id for history queries.
    # Consistency with schedule.machine_id is an application expectation.
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("machines.id", name="fk_pm_completions_machine_id_machines"),
        nullable=False,
        index=True,
    )
    completed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            name="fk_pm_completions_completed_by_users",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    due_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    # VARCHAR — not PG ENUM (app-validated result labels).
    result_status: Mapped[str] = mapped_column(String(32), nullable=False)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
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

    pm_schedule: Mapped[PmSchedule] = relationship(
        "PmSchedule", back_populates="completions"
    )
    machine: Mapped[Machine] = relationship(
        "Machine", back_populates="pm_completions"
    )
    completed_by_user: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[completed_by],
        back_populates="pm_completions",
    )
