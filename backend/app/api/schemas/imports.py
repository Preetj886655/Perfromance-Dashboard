"""Import job / DPR_OEE upload response models."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

_ALLOWED_SOURCE_TYPES = ("excel", "csv", "form", "sheets", "manual", "api")


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


class DataSourceResponse(BaseModel):
    """Stored ingestion source metadata."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    source_type: str
    config: dict[str, Any] = Field(default_factory=dict)
    freshness_sla_minutes: int | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class DataSourceListResponse(BaseModel):
    items: list[DataSourceResponse]
    count: int


class DataSourceCreateRequest(BaseModel):
    code: str
    name: str
    source_type: str
    config: dict[str, Any] = Field(default_factory=dict)
    freshness_sla_minutes: int | None = None
    is_active: bool = True


class ColumnMappingTemplateResponse(BaseModel):
    """Saved field mapping between a source header and the target schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    source_type: str
    department_id: UUID | None = None
    mapping: dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class ColumnMappingTemplateListResponse(BaseModel):
    items: list[ColumnMappingTemplateResponse]
    count: int


class ColumnMappingTemplateCreateRequest(BaseModel):
    name: str
    source_type: str
    department_id: UUID | None = None
    mapping: dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    is_active: bool = True


class ImportPreviewResponse(BaseModel):
    source_type: str
    headers: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    preview_limit: int = 25


class ImportMappingValidationRequest(BaseModel):
    source_type: str
    headers: list[str]
    mapping: dict[str, Any] = Field(default_factory=dict)


class ImportMappingValidationResponse(BaseModel):
    source_type: str
    valid: bool
    required_fields: list[str]
    missing_fields: list[str]
    mapped_fields: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
