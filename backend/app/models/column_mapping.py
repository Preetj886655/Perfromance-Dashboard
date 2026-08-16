"""Column mapping metadata between source fields and target production fields."""

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
    from app.models.field_configuration import FieldConfiguration
    from app.models.google_form_config import GoogleFormConfig
    from app.models.google_sheet_config import GoogleSheetConfig


class ColumnMapping(Base):
    """Maps an external source field to an internal target field."""

    __tablename__ = "column_mappings"
    __table_args__ = (
        CheckConstraint(
            "char_length(trim(source_field_name)) > 0",
            name="ck_column_mappings_source_field_name_not_blank",
        ),
        CheckConstraint(
            "char_length(trim(target_field_name)) > 0",
            name="ck_column_mappings_target_field_name_not_blank",
        ),
        Index(
            "ix_column_mappings_source_type_source_identifier",
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
    source_field_name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_field_name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_value: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    transform_expression: Mapped[str | None] = mapped_column(String(1024), nullable=True)
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
        ForeignKey("google_sheet_config.id", name="fk_column_mappings_google_sheet_config_id"),
        nullable=True,
        index=True,
    )
    google_form_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("google_form_config.id", name="fk_column_mappings_google_form_config_id"),
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
        back_populates="column_mappings",
        foreign_keys=[google_sheet_config_id],
    )
    google_form_config: Mapped[GoogleFormConfig | None] = relationship(
        "GoogleFormConfig",
        back_populates="column_mappings",
        foreign_keys=[google_form_config_id],
    )
    field_configurations: Mapped[list[FieldConfiguration]] = relationship(
        "FieldConfiguration",
        back_populates="column_mapping",
        foreign_keys="FieldConfiguration.column_mapping_id",
    )
