"""Rejection event (raw) — Stage A Migration 005 (production raw).

Normalized Excel AH–AQ rejection qty: one row per reason per production_record.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.production_record import ProductionRecord
    from app.models.rejection_reason import RejectionReason


class RejectionEvent(Base):
    """Raw rejection quantity for one rejection_reason on one production_record.

    Stage A grain: qty per reason per production_record →
    UNIQUE(production_record_id, rejection_reason_id); CHECK qty > 0.
    """

    __tablename__ = "rejection_events"
    __table_args__ = (
        UniqueConstraint(
            "production_record_id",
            "rejection_reason_id",
            name="uq_rejection_events_production_record_id_rejection_reason_id",
        ),
        CheckConstraint(
            "qty > 0",
            name="ck_rejection_events_qty_positive",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    production_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "production_records.id",
            name="fk_rejection_events_production_record_id_production_records",
        ),
        nullable=False,
        index=True,
    )
    rejection_reason_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "rejection_reasons.id",
            name="fk_rejection_events_rejection_reason_id_rejection_reasons",
        ),
        nullable=False,
        index=True,
    )
    qty: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
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

    production_record: Mapped[ProductionRecord] = relationship(
        "ProductionRecord",
        back_populates="rejection_events",
    )
    rejection_reason: Mapped[RejectionReason] = relationship("RejectionReason")
