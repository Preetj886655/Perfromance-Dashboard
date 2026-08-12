"""Action links — Stage A Migration 010 (audit / alerts / actions).

Explicit soft links from a CAPA action to source entities via source_module +
source_entity_id. No polymorphic FKs to production/downtime/rejection/etc.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.action import Action


class ActionLink(Base):
    """Optional link from an action to a source module entity (soft ref)."""

    __tablename__ = "action_links"
    __table_args__ = (
        UniqueConstraint(
            "action_id",
            "source_module",
            "source_entity_id",
            name="uq_action_links_action_module_entity",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    action_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "actions.id",
            name="fk_action_links_action_id_actions",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    # VARCHAR module label (e.g. quality / rejection / downtime) — not PG ENUM;
    # not an FK to business tables.
    source_module: Mapped[str] = mapped_column(String(64), nullable=False)
    source_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    action: Mapped[Action] = relationship("Action", back_populates="links")
