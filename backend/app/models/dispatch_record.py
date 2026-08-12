"""Dispatch records — Stage A Migration 014 (SCM / logistics thin).

Thin logistics rows for DOCX Delivery Accuracy (planned vs actual dispatch).
No workflow engine, carrier master, or seeds. Schema only.
"""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.part import Part
    from app.models.plant import Plant


class DispatchRecord(Base):
    """Thin dispatch / shipment plan vs actual for a customer × part."""

    __tablename__ = "dispatch_records"
    __table_args__ = (
        CheckConstraint(
            "planned_qty IS NULL OR planned_qty >= 0",
            name="ck_dispatch_records_planned_qty_non_negative",
        ),
        CheckConstraint(
            "dispatched_qty IS NULL OR dispatched_qty >= 0",
            name="ck_dispatch_records_dispatched_qty_non_negative",
        ),
        Index(
            "ix_dispatch_records_part_id_planned_dispatch_date",
            "part_id",
            "planned_dispatch_date",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # Actual dispatch date — nullable until shipped.
    dispatch_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True, index=True)
    planned_dispatch_date: Mapped[dt.date | None] = mapped_column(
        Date, nullable=True, index=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "customers.id",
            name="fk_dispatch_records_customer_id_customers",
        ),
        nullable=False,
        index=True,
    )
    part_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parts.id", name="fk_dispatch_records_part_id_parts"),
        nullable=False,
    )
    planned_qty: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    dispatched_qty: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    # VARCHAR — not PG ENUM.
    status: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    plant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", name="fk_dispatch_records_plant_id_plants"),
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

    customer: Mapped[Customer] = relationship(
        "Customer", back_populates="dispatch_records"
    )
    part: Mapped[Part] = relationship("Part", back_populates="dispatch_records")
    plant: Mapped[Plant | None] = relationship(
        "Plant", back_populates="dispatch_records"
    )
