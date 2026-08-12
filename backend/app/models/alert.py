"""Alerts — Stage A Migration 010 (audit / alerts / actions).

Fired alert instances only — no generation, notification, or seed rows.
Severity is VARCHAR (not PG ENUM). Escalation timestamps/actor are nullable
schema hooks from Stage A Step 15 ("ack, escalate").
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.alert_rule import AlertRule
    from app.models.user import User


class Alert(Base):
    """One fired alert from an alert_rule (inbox row)."""

    __tablename__ = "alerts"
    __table_args__ = (
        # Inbox: unacknowledged rows (partial).
        Index(
            "ix_alerts_unacknowledged_created_at",
            "created_at",
            postgresql_where=text("acknowledged_at IS NULL"),
        ),
        Index("ix_alerts_severity", "severity"),
        Index("ix_alerts_created_at", "created_at"),
        Index("ix_alerts_alert_rule_id", "alert_rule_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    alert_rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "alert_rules.id",
            name="fk_alerts_alert_rule_id_alert_rules",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    # VARCHAR — not PG ENUM.
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            name="fk_alerts_acknowledged_by_users",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    # Stage A escalation hooks (no workflow engine).
    escalated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    escalated_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            name="fk_alerts_escalated_to_users",
            ondelete="SET NULL",
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

    alert_rule: Mapped[AlertRule] = relationship(
        "AlertRule",
        back_populates="alerts",
    )
    acknowledger: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[acknowledged_by],
    )
    escalatee: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[escalated_to],
    )
