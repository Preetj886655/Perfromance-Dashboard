"""Rejection reason catalog — Stage A Migration 004 (part/reason masters).

Excel AH–AQ codes A–J are the canonical code set (UNIQUE on code).
No seed in this migration; schema must store exact Excel codes/labels.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RejectionReason(Base):
    """In-process rejection reason master (Excel A–J).

    Canonical Excel code → label mapping the schema is designed to hold
    (seed authorized later — not inserted by Migration 004):
    A Short Moulding, B Shrinkage Mark, C Silver Streak, D Flow Mark,
    E Weld Line, F Dent Mark, G Power Cut, H Black Marks, I Crack Marks,
    J Others.
    """

    __tablename__ = "rejection_reasons"
    __table_args__ = (UniqueConstraint("code", name="uq_rejection_reasons_code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
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
