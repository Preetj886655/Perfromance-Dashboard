"""Import job / DPR_OEE upload response models."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DprOeeImportResponse(BaseModel):
    """Summary returned after POST /imports/dpr-oee (no full dataset)."""

    import_job_id: UUID
    status: str
    total_rows: int = Field(description="Processed business rows (non-empty)")
    success_count: int
    error_count: int
    message: str | None = None


class ImportJobSummaryResponse(BaseModel):
    """GET /imports/{import_id} summary."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_type: str
    status: str
    file_uri: str | None = None
    total_rows: int
    processed_rows: int
    success_count: int
    error_count: int
    error_summary: str | None = None
    uploaded_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class ImportJobRowResponse(BaseModel):
    """One staging row from import_job_rows (no secrets)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    row_number: int
    external_row_key: str | None = None
    validation_errors: Any = None
    production_record_id: UUID | None = None
    status: str = Field(
        description="Derived: success | error (no status column on import_job_rows)"
    )


class ImportJobRowsPageResponse(BaseModel):
    """Paginated import job rows."""

    items: list[ImportJobRowResponse]
    total: int
    limit: int
    offset: int
