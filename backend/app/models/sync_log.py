"""Detailed sync execution audit log for source integrations."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.google_form_config import GoogleFormConfig
    from app.models.google_sheet_config import GoogleSheetConfig


class SyncLog(Base):
    """One sync execution with summary counts and payload metadata."""

    __tablename__ = "sync_logs"
    __table_args__ = (
        Index("ix_sync_logs_status_started_at", "status", "started_at"),
        Index(
            "ix_sync_logs_source_type_source_identifier",
            "source_type",
            "source_identifier",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_identifier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    records_processed: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )
    records_inserted: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )
    records_updated: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )
    records_skipped: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    sync_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    google_sheet_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("google_sheet_config.id", name="fk_sync_logs_google_sheet_config_id"),
        nullable=True,
        index=True,
    )
    google_form_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("google_form_config.id", name="fk_sync_logs_google_form_config_id"),
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

    google_sheet_config: Mapped[GoogleSheetConfig | None] = relationship(
        "GoogleSheetConfig",
        back_populates="sync_logs",
        foreign_keys=[google_sheet_config_id],
    )
    google_form_config: Mapped[GoogleFormConfig | None] = relationship(
        "GoogleFormConfig",
        back_populates="sync_logs",
        foreign_keys=[google_form_config_id],
    )
