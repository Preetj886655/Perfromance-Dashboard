"""User identity — Stage A Migration 009 (security concepts).

Schema only — no login, signup, JWT, OAuth, sessions, password hashing service,
or seed users. password_hash is nullable for future auth; never store plaintext.

plant_id / department_id are nullable: Q11 multi-plant remains TBC; Stage A
enforcement intent is plant/department scoping, but admin / multi-plant users
must not be forced into a single plant until Q11 is resolved.
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
    from app.models.customer_complaint import CustomerComplaint
    from app.models.department import Department
    from app.models.maintenance_ticket import MaintenanceTicket
    from app.models.plant import Plant
    from app.models.pm_completion import PmCompletion
    from app.models.pm_schedule import PmSchedule
    from app.models.quality_inspection import QualityInspection
    from app.models.user_role import UserRole


class User(Base):
    """Application user identity (RBAC subject). No auth implementation here."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("employee_code", name="uq_users_employee_code"),
        UniqueConstraint("email", name="uq_users_email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    employee_code: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    # Future auth storage only — nullable; no plaintext password column.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Nullable: Q11 TBC — prefer flexible multi-plant / admin users.
    plant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", name="fk_users_plant_id_plants"),
        nullable=True,
        index=True,
    )
    # Nullable preferred for flexibility unless Stage A requires NOT NULL (it does not).
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", name="fk_users_department_id_departments"),
        nullable=True,
        index=True,
    )
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

    plant: Mapped[Plant | None] = relationship("Plant")
    department: Mapped[Department | None] = relationship("Department")
    user_roles: Mapped[list[UserRole]] = relationship(
        "UserRole",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    assigned_maintenance_tickets: Mapped[list[MaintenanceTicket]] = relationship(
        "MaintenanceTicket",
        back_populates="assignee",
        foreign_keys="MaintenanceTicket.assigned_to",
    )
    owned_pm_schedules: Mapped[list[PmSchedule]] = relationship(
        "PmSchedule",
        back_populates="owner",
        foreign_keys="PmSchedule.owner_id",
    )
    pm_completions: Mapped[list[PmCompletion]] = relationship(
        "PmCompletion",
        back_populates="completed_by_user",
        foreign_keys="PmCompletion.completed_by",
    )
    quality_inspections: Mapped[list[QualityInspection]] = relationship(
        "QualityInspection",
        back_populates="inspector",
        foreign_keys="QualityInspection.inspected_by",
    )
    customer_complaints: Mapped[list[CustomerComplaint]] = relationship(
        "CustomerComplaint",
        back_populates="creator",
        foreign_keys="CustomerComplaint.created_by",
    )
