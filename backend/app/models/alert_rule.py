"""Alert rules — Stage A Migration 010 (audit / alerts / actions).

Configuration only — no evaluation engine, notification, or seed rules.
Severity is VARCHAR (not PG ENUM). Threshold / comparison and optional
freshness-or-condition payloads live in JSONB.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.alert import Alert
    from app.models.kpi_definition import KpiDefinition


class AlertRule(Base):
    """KPI / threshold / freshness rule definition (schema only)."""

    __tablename__ = "alert_rules"
    __table_args__ = (UniqueConstraint("code", name="uq_alert_rules_code"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Optional link to KPI registry; null for non-KPI / freshness-only rules.
    kpi_definition_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "kpi_definitions.id",
            name="fk_alert_rules_kpi_definition_id_kpi_definitions",
        ),
        nullable=True,
        index=True,
    )
    # Comparison / threshold payload (operator, value, window, etc.).
    threshold_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    # VARCHAR — not PG ENUM (app-validated severity labels).
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    # Optional freshness / extra condition JSONB when justified by rule type.
    condition_config: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
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

    kpi_definition: Mapped[KpiDefinition | None] = relationship("KpiDefinition")
    alerts: Mapped[list[Alert]] = relationship(
        "Alert",
        back_populates="alert_rule",
        cascade="all, delete-orphan",
    )
