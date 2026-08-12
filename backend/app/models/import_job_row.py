"""Import job staging rows — Stage A Migration 007 (ingestion / lineage)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
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
    from app.models.import_job import ImportJob
    from app.models.production_record import ProductionRecord


class ImportJobRow(Base):
    """Optional per-row staging: raw payload, validation errors, target record."""

    __tablename__ = "import_job_rows"
    __table_args__ = (
        UniqueConstraint(
            "import_job_id",
            "row_number",
            name="uq_import_job_rows_import_job_id_row_number",
        ),
        CheckConstraint(
            "row_number >= 1",
            name="ck_import_job_rows_row_number_positive",
        ),
        Index("ix_import_job_rows_external_row_key", "external_row_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    import_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "import_jobs.id",
            name="fk_import_job_rows_import_job_id_import_jobs",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    external_row_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_row_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    validation_errors: Mapped[Any] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    # Nullable until row is committed to a production_record.
    production_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "production_records.id",
            name="fk_import_job_rows_production_record_id_production_records",
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

    import_job: Mapped[ImportJob] = relationship(
        "ImportJob",
        back_populates="rows",
    )
    production_record: Mapped[ProductionRecord | None] = relationship(
        "ProductionRecord",
        foreign_keys=[production_record_id],
    )
