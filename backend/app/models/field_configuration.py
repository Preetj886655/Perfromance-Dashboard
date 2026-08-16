"""Field configuration registry for imported records and KPI mappings."""

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
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.column_mapping import ColumnMapping
    from app.models.google_form_config import GoogleFormConfig
    from app.models.google_sheet_config import GoogleSheetConfig


class FieldConfiguration(Base):
    """Canonical field metadata used across external source mappings."""

    __tablename__ = "field_configurations"
    __table_args__ = (
        CheckConstraint(
            "char_length(trim(entity_type)) > 0",
            name="ck_field_configurations_entity_type_not_blank",
        ),
        CheckConstraint(
            "char_length(trim(field_name)) > 0",
            name="ck_field_configurations_field_name_not_blank",
        ),
        Index(
            "ix_field_configurations_entity_type_field_name",
            "entity_type",
            "field_name",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    field_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_field_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_field_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_value: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    is_required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )
    google_sheet_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("google_sheet_config.id", name="fk_field_configurations_google_sheet_config_id"),
        nullable=True,
        index=True,
    )
    google_form_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("google_form_config.id", name="fk_field_configurations_google_form_config_id"),
        nullable=True,
        index=True,
    )
    column_mapping_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("column_mappings.id", name="fk_field_configurations_column_mapping_id"),
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
        back_populates="field_configurations",
        foreign_keys=[google_sheet_config_id],
    )
    google_form_config: Mapped[GoogleFormConfig | None] = relationship(
        "GoogleFormConfig",
        back_populates="field_configurations",
        foreign_keys=[google_form_config_id],
    )
    column_mapping: Mapped[ColumnMapping | None] = relationship(
        "ColumnMapping",
        back_populates="field_configurations",
        foreign_keys=[column_mapping_id],
    )
