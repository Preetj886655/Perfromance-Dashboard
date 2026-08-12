"""CAPA actions — Stage A Migration 010 (audit / alerts / actions).

Corrective / preventive action records only — no overdue boolean, no workflow
engine, no seed rows. Status / priority are VARCHAR (not PG ENUM) with an
optional CHECK listing Stage A recommended statuses.
"""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.action_link import ActionLink
    from app.models.department import Department
    from app.models.user import User


# Stage A Step 15 recommended statuses (display codes; not PG ENUM).
_ACTION_STATUS_CHECK = (
    "status IN ("
    "'Open', 'In Progress', 'On Hold', 'Completed', 'Verified', 'Closed'"
    ")"
)


class Action(Base):
    """CAPA action (problem → root cause → corrective / preventive)."""

    __tablename__ = "actions"
    __table_args__ = (
        CheckConstraint(
            _ACTION_STATUS_CHECK,
            name="ck_actions_status",
        ),
        Index("ix_actions_status_due_date", "status", "due_date"),
        Index("ix_actions_department_id", "department_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    problem: Mapped[str] = mapped_column(Text, nullable=False)
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrective: Mapped[str | None] = mapped_column(Text, nullable=True)
    preventive: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            name="fk_actions_owner_id_users",
        ),
        nullable=False,
        index=True,
    )
    # VARCHAR — not PG ENUM (app-validated priority labels).
    priority: Mapped[str] = mapped_column(String(32), nullable=False)
    # VARCHAR + CHECK — Stage A statuses; not irreversible PG ENUM.
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    due_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    # Structured evidence payload (links, notes, attachment refs) — not overdue flag.
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "departments.id",
            name="fk_actions_department_id_departments",
        ),
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

    owner: Mapped[User] = relationship("User", foreign_keys=[owner_id])
    department: Mapped[Department | None] = relationship("Department")
    links: Mapped[list[ActionLink]] = relationship(
        "ActionLink",
        back_populates="action",
        cascade="all, delete-orphan",
    )
