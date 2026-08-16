"""Google Sheet configuration for external source syncs.

This is a Phase 1 data architecture table used to register a Google Sheet as a
source without implementing the actual Google integration yet.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.column_mapping import ColumnMapping
    from app.models.field_configuration import FieldConfiguration
    from app.models.sync_log import SyncLog


class GoogleSheetConfig(Base):
    """Registered Google Sheet source and sync metadata."""

    __tablename__ = "google_sheet_config"
    __table_args__ = (
        UniqueConstraint(
            "spreadsheet_id",
            "sheet_name",
            name="uq_google_sheet_config_spreadsheet_sheet",
        ),
        CheckConstraint(
            "char_length(trim(spreadsheet_id)) > 0",
            name="ck_google_sheet_config_spreadsheet_id_not_blank",
        ),
        CheckConstraint(
            "char_length(trim(sheet_name)) > 0",
            name="ck_google_sheet_config_sheet_name_not_blank",
        ),
        Index("ix_google_sheet_config_is_active", "is_active"),
        Index("ix_google_sheet_config_last_synced_at", "last_synced_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    spreadsheet_id: Mapped[str] = mapped_column(String(255), nullable=False)
    sheet_name: Mapped[str] = mapped_column(String(255), nullable=False)
    worksheet_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sheet_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    sync_frequency: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'manual'"),
    )
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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

    column_mappings: Mapped[list[ColumnMapping]] = relationship(
        "ColumnMapping",
        back_populates="google_sheet_config",
        foreign_keys="ColumnMapping.google_sheet_config_id",
    )
    field_configurations: Mapped[list[FieldConfiguration]] = relationship(
        "FieldConfiguration",
        back_populates="google_sheet_config",
        foreign_keys="FieldConfiguration.google_sheet_config_id",
    )
    sync_logs: Mapped[list[SyncLog]] = relationship(
        "SyncLog",
        back_populates="google_sheet_config",
        foreign_keys="SyncLog.google_sheet_config_id",
    )
