"""Data source registry — Stage A Migration 007 (ingestion / lineage).

Channels + freshness SLA. config JSONB holds non-secret metadata only
(no credentials, tokens, or connection secrets).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DataSource(Base):
    """Registered ingestion channel identity + freshness SLA."""

    __tablename__ = "data_sources"
    __table_args__ = (
        UniqueConstraint("code", name="uq_data_sources_code"),
        CheckConstraint(
            "source_type IN ('excel', 'csv', 'form', 'sheets', 'manual', 'api')",
            name="ck_data_sources_source_type",
        ),
        CheckConstraint(
            "freshness_sla_minutes IS NULL OR freshness_sla_minutes > 0",
            name="ck_data_sources_freshness_sla_minutes_positive",
        ),
        Index("ix_data_sources_source_type", "source_type"),
        Index("ix_data_sources_is_active", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # Stable identity code (unique).
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # VARCHAR closed set (not PG ENUM): excel | csv | form | sheets | manual | api
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    # Non-secret metadata only (endpoints labels, sheet names, etc.) — no secrets.
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    freshness_sla_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
