"""Audit log — Stage A Migration 010 (audit / alerts / actions).

Immutable field-level change trail. No app update/delete of audit rows;
no polymorphic FK to business tables (entity_type + entity_id are soft refs).

user_id ON DELETE SET NULL: retain the audit row if the actor user is deleted
(prefer over RESTRICT so identity cleanup does not block or erase history).
Timestamp column is ``at`` per Stage A Step 13 / Step 19 (not created_at).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, column, desc, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class AuditLog(Base):
    """Who changed what field on which entity, with optional reason.

    entity_type + entity_id are application-resolved references only —
    no FK to production_records / downtime_events / etc.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index(
            "ix_audit_logs_entity_type_entity_id_at",
            "entity_type",
            "entity_id",
            desc(column("at")),
        ),
        Index(
            "ix_audit_logs_user_id_at",
            "user_id",
            desc(column("at")),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # Nullable actor; SET NULL preserves history when user row is removed.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            name="fk_audit_logs_user_id_users",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    # Soft polymorphic identity — NOT a database FK to business tables.
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    field: Mapped[str] = mapped_column(String(128), nullable=False)
    old_value: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Stage A column name ``at`` (Step 13 / Step 19 indexes).
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user: Mapped[User | None] = relationship("User", foreign_keys=[user_id])
