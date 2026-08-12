"""Customers — Stage A Migration 014 (SCM / logistics thin).

Thin customer master for dispatch (and optional later complaint link).
Does not alter customer_complaints from Migration 013.
Schema only — no CRM, credit limits, or seeds.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.dispatch_record import DispatchRecord


class Customer(Base):
    """Thin customer identity (code + name) for logistics dispatch."""

    __tablename__ = "customers"
    __table_args__ = (UniqueConstraint("code", name="uq_customers_code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
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

    dispatch_records: Mapped[list[DispatchRecord]] = relationship(
        "DispatchRecord", back_populates="customer"
    )
