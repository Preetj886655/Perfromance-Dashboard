"""Customer complaints — Stage A Migration 013 (quality extended).

Customer PPM numerator (returned_qty) and open/closed complaint counts.
Customer PPM / complaint KPIs are not stored — KPI engine computes them.
customers master is Migration 014 — store customer_name as free text until then.

Schema only — no quality APIs, seeds, or CAPA tables (use actions from 010).
status / severity are VARCHAR (not PG ENUM).
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
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.part import Part
    from app.models.user import User


class CustomerComplaint(Base):
    """Customer complaint / return record (feeds complaint count & Customer PPM)."""

    __tablename__ = "customer_complaints"
    __table_args__ = (
        UniqueConstraint(
            "complaint_code", name="uq_customer_complaints_complaint_code"
        ),
        CheckConstraint(
            "returned_qty IS NULL OR returned_qty >= 0",
            name="ck_customer_complaints_returned_qty_non_negative",
        ),
        Index(
            "ix_customer_complaints_part_id_complaint_date",
            "part_id",
            "complaint_date",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    complaint_date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    complaint_code: Mapped[str] = mapped_column(String(64), nullable=False)
    # customers master deferred to Migration 014.
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    part_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parts.id", name="fk_customer_complaints_part_id_parts"),
        nullable=True,
    )
    # Nullable: complaint counts do not require qty; Customer PPM does when present.
    returned_qty: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    # VARCHAR — open/closed concepts; not PG ENUM; no restrictive CHECK.
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            name="fk_customer_complaints_created_by_users",
            ondelete="SET NULL",
        ),
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

    part: Mapped[Part | None] = relationship(
        "Part", back_populates="customer_complaints"
    )
    creator: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[created_by],
        back_populates="customer_complaints",
    )
