"""Import job batch metadata — Stage A Migration 007 (ingestion / lineage).

Uploader FK to users is deferred until Migration 009 — nullable UUID only.
No secrets stored. Source types are VARCHAR + CHECK (not PG ENUM).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    column,
    desc,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.import_job_row import ImportJobRow
    from app.models.production_record import ProductionRecord


class ImportJob(Base):
    """One ingestion batch (Excel/CSV/form/sheets/manual/api).

    uploaded_by: nullable UUID without FK until users exist (Migration 009).
    """

    __tablename__ = "import_jobs"
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('excel', 'csv', 'form', 'sheets', 'manual', 'api')",
            name="ck_import_jobs_source_type",
        ),
        CheckConstraint(
            "row_count >= 0",
            name="ck_import_jobs_row_count_nonneg",
        ),
        CheckConstraint(
            "success_count >= 0",
            name="ck_import_jobs_success_count_nonneg",
        ),
        CheckConstraint(
            "error_count >= 0",
            name="ck_import_jobs_error_count_nonneg",
        ),
        Index(
            "ix_import_jobs_created_at",
            desc(column("created_at")),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # VARCHAR closed set (not PG ENUM): excel | csv | form | sheets | manual | api
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    # Object/file URI or path reference — nullable for form/manual/api without a file.
    file_uri: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # Deferred FK → users (Migration 009); nullable UUID only until then.
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    # App-validated job lifecycle (e.g. pending / validating / committed / failed).
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    row_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )
    success_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )
    error_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )
    mapping_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    rows: Mapped[list[ImportJobRow]] = relationship(
        "ImportJobRow",
        back_populates="import_job",
        cascade="all, delete-orphan",
    )
    production_records: Mapped[list[ProductionRecord]] = relationship(
        "ProductionRecord",
        back_populates="source_import",
        foreign_keys="ProductionRecord.source_import_id",
    )
