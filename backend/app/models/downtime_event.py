"""Downtime event (raw) — Stage A Migration 005 (production raw).

Normalized Excel Q–AA idle minutes: one row per reason per production_record.
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
    from app.models.downtime_reason import DowntimeReason
    from app.models.production_record import ProductionRecord


class DowntimeEvent(Base):
    """Raw idle minutes for one downtime_reason on one production_record.

    Stage A: UNIQUE(production_record_id, downtime_reason_id);
    CHECK minutes > 0 (store only non-zero; zero-fill not persisted).
    """

    __tablename__ = "downtime_events"
    __table_args__ = (
        UniqueConstraint(
            "production_record_id",
            "downtime_reason_id",
            name="uq_downtime_events_production_record_id_downtime_reason_id",
        ),
        CheckConstraint(
            "minutes > 0",
            name="ck_downtime_events_minutes_positive",
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
            name="fk_downtime_events_production_record_id_production_records",
        ),
        nullable=False,
        index=True,
    )
    downtime_reason_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "downtime_reasons.id",
            name="fk_downtime_events_downtime_reason_id_downtime_reasons",
        ),
        nullable=False,
        index=True,
    )
    minutes: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
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
        back_populates="downtime_events",
    )
    downtime_reason: Mapped[DowntimeReason] = relationship("DowntimeReason")
