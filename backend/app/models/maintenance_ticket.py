"""Maintenance tickets — Stage A Migration 011 (maintenance).

Breakdown / corrective work orders linked to machines, with optional real FKs
to production_records and downtime_events (no polymorphic refs).

Schema only — no MTTR/MTBF columns, no CMMS workflow, no seed tickets.
maintenance_type / priority / status are VARCHAR (not PG ENUM).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.downtime_event import DowntimeEvent
    from app.models.machine import Machine
    from app.models.production_record import ProductionRecord
    from app.models.user import User


class MaintenanceTicket(Base):
    """Breakdown / corrective maintenance ticket (feeds future MTTR/MTBF KPIs)."""

    __tablename__ = "maintenance_tickets"
    __table_args__ = (
        UniqueConstraint("ticket_code", name="uq_maintenance_tickets_ticket_code"),
        Index("ix_maintenance_tickets_machine_id_opened_at", "machine_id", "opened_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("machines.id", name="fk_maintenance_tickets_machine_id_machines"),
        nullable=False,
        index=True,
    )
    # Optional real FKs — not polymorphic; SET NULL if source row is removed.
    production_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "production_records.id",
            name="fk_maintenance_tickets_production_record_id_production_records",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    downtime_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "downtime_events.id",
            name="fk_maintenance_tickets_downtime_event_id_downtime_events",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    ticket_code: Mapped[str] = mapped_column(String(64), nullable=False)
    # VARCHAR — not PG ENUM (app-validated type / priority / status labels).
    maintenance_type: Mapped[str] = mapped_column(String(64), nullable=False)
    problem: Mapped[str] = mapped_column(Text, nullable=False)
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrective_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            name="fk_maintenance_tickets_assigned_to_users",
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

    machine: Mapped[Machine] = relationship(
        "Machine", back_populates="maintenance_tickets"
    )
    production_record: Mapped[ProductionRecord | None] = relationship(
        "ProductionRecord"
    )
    downtime_event: Mapped[DowntimeEvent | None] = relationship("DowntimeEvent")
    assignee: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[assigned_to],
        back_populates="assigned_maintenance_tickets",
    )
