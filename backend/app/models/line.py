"""Line master — Stage A Migration 002 (org masters).

Q13 TBC: machine→line mapping remains optional (machines.line_id nullable).
This table exists so lines can be defined under a plant when mapping is known.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.machine import Machine
    from app.models.plant import Plant
    from app.models.production_plan import ProductionPlan


class Line(Base):
    """Optional machine grouping within a plant."""

    __tablename__ = "lines"
    __table_args__ = (
        UniqueConstraint("plant_id", "code", name="uq_lines_plant_id_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", name="fk_lines_plant_id_plants"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
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

    plant: Mapped[Plant] = relationship("Plant", back_populates="lines")
    machines: Mapped[list[Machine]] = relationship("Machine", back_populates="line")
    production_plans: Mapped[list[ProductionPlan]] = relationship(
        "ProductionPlan", back_populates="line"
    )
