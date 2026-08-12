"""Materials — Stage A Migration 014 (SCM / logistics thin).

Thin material / SKU master for inventory snapshots and GRN. No supplier FK,
BOM, or purchasing fields. Schema only — no SCM APIs or seeds.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.grn_record import GrnRecord
    from app.models.inventory_snapshot import InventorySnapshot
    from app.models.plant import Plant


class Material(Base):
    """Thin SCM material / SKU identity (code + name)."""

    __tablename__ = "materials"
    __table_args__ = (UniqueConstraint("code", name="uq_materials_code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Unit of measure label — VARCHAR not PG ENUM.
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Q11 TBC — optional plant scope on thin stub.
    plant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", name="fk_materials_plant_id_plants"),
        nullable=True,
        index=True,
    )
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

    plant: Mapped[Plant | None] = relationship("Plant", back_populates="materials")
    inventory_snapshots: Mapped[list[InventorySnapshot]] = relationship(
        "InventorySnapshot", back_populates="material"
    )
    grn_records: Mapped[list[GrnRecord]] = relationship(
        "GrnRecord", back_populates="material"
    )
