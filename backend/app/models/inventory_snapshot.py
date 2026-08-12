"""Inventory snapshots — Stage A Migration 014 (SCM / logistics thin).

Point-in-time stock on hand (DOCX FG stock / reorder). Snapshots only —
no inventory ledger, stock movements, or warehouse transactions.
Schema only — no inventory APIs or seeds.
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
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.material import Material
    from app.models.plant import Plant


class InventorySnapshot(Base):
    """Daily (or periodic) on-hand quantity for a material (± plant)."""

    __tablename__ = "inventory_snapshots"
    __table_args__ = (
        CheckConstraint(
            "quantity_on_hand >= 0",
            name="ck_inventory_snapshots_quantity_on_hand_non_negative",
        ),
        CheckConstraint(
            "reorder_point IS NULL OR reorder_point >= 0",
            name="ck_inventory_snapshots_reorder_point_non_negative",
        ),
        Index(
            "ix_inventory_snapshots_material_id_snapshot_date",
            "material_id",
            "snapshot_date",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    snapshot_date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "materials.id",
            name="fk_inventory_snapshots_material_id_materials",
        ),
        nullable=False,
    )
    plant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", name="fk_inventory_snapshots_plant_id_plants"),
        nullable=True,
        index=True,
    )
    quantity_on_hand: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    # Optional reorder threshold for stock-below-minimum alerts later.
    reorder_point: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
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

    material: Mapped[Material] = relationship(
        "Material", back_populates="inventory_snapshots"
    )
    plant: Mapped[Plant | None] = relationship(
        "Plant", back_populates="inventory_snapshots"
    )
