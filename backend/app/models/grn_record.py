"""GRN records — Stage A Migration 014 (SCM / logistics thin).

Thin goods-receipt rows for DOCX GRN count/value. Free-text supplier_name —
no supplier master table. Schema only — no receiving workflow or seeds.
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
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.material import Material
    from app.models.plant import Plant


class GrnRecord(Base):
    """Thin goods receipt note (material + qty received)."""

    __tablename__ = "grn_records"
    __table_args__ = (
        UniqueConstraint("grn_number", name="uq_grn_records_grn_number"),
        CheckConstraint(
            "quantity_received >= 0",
            name="ck_grn_records_quantity_received_non_negative",
        ),
        Index("ix_grn_records_material_id_grn_date", "material_id", "grn_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    grn_date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    # Document identity — unique like ticket_code / complaint_code.
    grn_number: Mapped[str] = mapped_column(String(64), nullable=False)
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("materials.id", name="fk_grn_records_material_id_materials"),
        nullable=False,
    )
    quantity_received: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    # No supplier master in Stage A — free-text only.
    supplier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    plant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", name="fk_grn_records_plant_id_plants"),
        nullable=True,
        index=True,
    )
    # VARCHAR — not PG ENUM.
    status: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
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

    material: Mapped[Material] = relationship("Material", back_populates="grn_records")
    plant: Mapped[Plant | None] = relationship("Plant", back_populates="grn_records")
