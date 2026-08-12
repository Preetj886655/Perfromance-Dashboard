"""Downtime reason catalog — Stage A Migration 004 (part/reason masters).

Excel Q–AA (codes 1–11 via code+label). category is VARCHAR (Q2 TBC) — not a PG ENUM.
No seed in this migration; catalog rows are authorized later.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DowntimeReason(Base):
    """Idle-reason master for downtime_events (Excel buckets 1–11).

    Expected Excel code+label capability (seed later, not in 004):
    1 Manpower Shortage, 2 Mould Trial, 3 Bin Shortage, 4 Material Shortage,
    5 M/c Under BD, 6 Nozzle Block, 7 Mould Problem, 8 Crystal/Insert Shortage,
    9 Power Failure, 10 Process Setting, 11 Others.
    """

    __tablename__ = "downtime_reasons"
    __table_args__ = (UniqueConstraint("code", name="uq_downtime_reasons_code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    # Q2 TBC — planned vs unplanned remains configurable; do not use PG ENUM.
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    excel_column: Mapped[str | None] = mapped_column(String(8), nullable=True)
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
