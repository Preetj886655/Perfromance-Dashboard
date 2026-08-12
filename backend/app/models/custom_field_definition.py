"""Custom field definitions — Stage A Migration 007 (ingestion / lineage).

Metadata for DOCX customizable columns (Heat No., Stage, etc.). Values live in
production_records.custom_fields JSONB — not as mandatory columns.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.department import Department


class CustomFieldDefinition(Base):
    """Admin-configurable custom field metadata per entity (± department).

    Partial unique indexes (migration) avoid PostgreSQL NULL-duplicate quirk
    on department_id: one global (department_id IS NULL) and one per department.
    """

    __tablename__ = "custom_field_definitions"
    __table_args__ = (
        Index(
            "uq_custom_field_definitions_entity_field_global",
            "entity_type",
            "field_name",
            unique=True,
            postgresql_where=text("department_id IS NULL"),
        ),
        Index(
            "uq_custom_field_definitions_entity_field_department",
            "entity_type",
            "field_name",
            "department_id",
            unique=True,
            postgresql_where=text("department_id IS NOT NULL"),
        ),
        Index("ix_custom_field_definitions_entity_type", "entity_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # e.g. production_record — app-validated; not a PG ENUM.
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    field_name: Mapped[str] = mapped_column(String(128), nullable=False)
    # e.g. text | number | date | select — app-validated; not a PG ENUM.
    field_type: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    options: Mapped[Any] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "departments.id",
            name="fk_custom_field_definitions_department_id_departments",
        ),
        nullable=True,
        index=True,
    )
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
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

    department: Mapped[Department | None] = relationship("Department")
