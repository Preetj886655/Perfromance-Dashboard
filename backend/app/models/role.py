"""Role master — Stage A Migration 009 (security concepts).

Schema only — no auth enforcement, JWT, sessions, or seed roles.
Role codes are VARCHAR (not PG ENUM). Intended conceptual codes (not seeded):
  SUPER_ADMIN, MANAGEMENT, PLANT_HEAD, DEPT_HEAD, SUPERVISOR, OPERATOR,
  ENGINEER, VIEWER (Stage A Step 14).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.kpi_definition import KpiDefinition
    from app.models.role_permission import RolePermission
    from app.models.user_role import UserRole


class Role(Base):
    """RBAC role catalog entry (schema only; no seed rows in Migration 009)."""

    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("code", name="uq_roles_code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # VARCHAR business code — not a PostgreSQL ENUM.
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
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

    permissions: Mapped[list[RolePermission]] = relationship(
        "RolePermission",
        back_populates="role",
        cascade="all, delete-orphan",
    )
    user_roles: Mapped[list[UserRole]] = relationship(
        "UserRole",
        back_populates="role",
        cascade="all, delete-orphan",
    )
    owned_kpi_definitions: Mapped[list[KpiDefinition]] = relationship(
        "KpiDefinition",
        back_populates="owner_role",
    )
