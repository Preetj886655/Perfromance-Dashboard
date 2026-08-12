"""Column mapping templates — Stage A Migration 007 (ingestion / lineage).

Saved Excel/CSV → field maps per department/source. Source type VARCHAR + CHECK
(not PG ENUM). Mapping stored as JSONB only — no import execution here.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.department import Department


class ColumnMappingTemplate(Base):
    """Reusable source-column → system-field map for recurring imports."""

    __tablename__ = "column_mapping_templates"
    __table_args__ = (
        UniqueConstraint(
            "name",
            "source_type",
            "version",
            name="uq_column_mapping_templates_name_source_type_version",
        ),
        CheckConstraint(
            "source_type IN ('excel', 'csv', 'form', 'sheets', 'manual', 'api')",
            name="ck_column_mapping_templates_source_type",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_column_mapping_templates_version_positive",
        ),
        Index("ix_column_mapping_templates_source_type", "source_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "departments.id",
            name="fk_column_mapping_templates_department_id_departments",
        ),
        nullable=True,
        index=True,
    )
    mapping: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("1"),
    )
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
