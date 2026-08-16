"""Pydantic schemas for the Phase 1 data architecture tables."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GoogleSheetConfigBase(BaseModel):
    spreadsheet_id: str
    sheet_name: str
    worksheet_name: str | None = None
    sheet_url: str | None = None
    sync_frequency: str = "manual"
    config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    last_synced_at: datetime | None = None


class GoogleSheetConfigCreate(GoogleSheetConfigBase):
    pass


class GoogleSheetConfigRead(GoogleSheetConfigBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class GoogleFormConfigBase(BaseModel):
    form_id: str
    form_name: str
    form_url: str | None = None
    response_sheet_name: str | None = None
    sync_frequency: str = "manual"
    config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    last_synced_at: datetime | None = None


class GoogleFormConfigCreate(GoogleFormConfigBase):
    pass


class GoogleFormConfigRead(GoogleFormConfigBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class ColumnMappingBase(BaseModel):
    source_type: str
    source_identifier: str | None = None
    source_field_name: str
    target_field_name: str
    default_value: Any | None = None
    transform_expression: str | None = None
    is_required: bool = False
    is_active: bool = True
    google_sheet_config_id: UUID | None = None
    google_form_config_id: UUID | None = None


class ColumnMappingCreate(ColumnMappingBase):
    pass


class ColumnMappingRead(ColumnMappingBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class SyncLogBase(BaseModel):
    source_type: str
    source_identifier: str | None = None
    status: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
    records_processed: int = 0
    records_inserted: int = 0
    records_updated: int = 0
    records_skipped: int = 0
    error_message: str | None = None
    sync_metadata: dict[str, Any] = Field(default_factory=dict)
    google_sheet_config_id: UUID | None = None
    google_form_config_id: UUID | None = None


class SyncLogCreate(SyncLogBase):
    pass


class SyncLogRead(SyncLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class FieldConfigurationBase(BaseModel):
    entity_type: str
    field_name: str
    source_field_name: str | None = None
    target_field_name: str | None = None
    data_type: str | None = None
    default_value: Any | None = None
    is_required: bool = False
    is_active: bool = True
    google_sheet_config_id: UUID | None = None
    google_form_config_id: UUID | None = None
    column_mapping_id: UUID | None = None


class FieldConfigurationCreate(FieldConfigurationBase):
    pass


class FieldConfigurationRead(FieldConfigurationBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
