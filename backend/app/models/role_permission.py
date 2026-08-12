"""Role permissions — Stage A Migration 009 (security concepts).

Schema only — no permission catalog seed, no frontend/API enforcement.
module and action are VARCHAR (not PG ENUM); full grant catalog deferred.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.role import Role


class RolePermission(Base):
    """Module × action grant row for a role (schema only; no seeds)."""

    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint(
            "role_id",
            "module",
            "action",
            name="uq_role_permissions_role_module_action",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "roles.id",
            name="fk_role_permissions_role_id_roles",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    # VARCHAR classifiers — not PostgreSQL ENUMs; catalog not invented here.
    module: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    is_allowed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
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

    role: Mapped[Role] = relationship("Role", back_populates="permissions")
