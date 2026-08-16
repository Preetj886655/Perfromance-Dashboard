"""017_data_architecture — track external source lineage and sync config.

Adds source-traceability columns to production_records and creates the Phase 1
Google Sheet / Google Form / column mapping / sync / field configuration tables
without altering the existing Excel DPR import or OEE calculation logic.

Revision ID: 017
Revises: 016_google_oauth_tokens
Create Date: 2026-08-16
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "017"
down_revision: Union[str, None] = "016_google_oauth_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "production_records",
        sa.Column("data_source", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "production_records",
        sa.Column("source_identifier", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "production_records",
        sa.Column(
            "imported_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "production_records",
        sa.Column("original_row_number", sa.Integer(), nullable=True),
    )
    op.add_column(
        "production_records",
        sa.Column(
            "is_duplicate",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    op.create_check_constraint(
        "ck_production_records_data_source_not_blank",
        "production_records",
        "(data_source IS NULL OR char_length(trim(data_source)) > 0)",
    )
    op.create_check_constraint(
        "ck_production_records_source_identifier_not_blank",
        "production_records",
        "(source_identifier IS NULL OR char_length(trim(source_identifier)) > 0)",
    )
    op.create_check_constraint(
        "ck_production_records_original_row_number_positive",
        "production_records",
        "(original_row_number IS NULL OR original_row_number >= 1)",
    )

    op.create_index(
        "ix_production_records_data_source",
        "production_records",
        ["data_source"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_source_identifier",
        "production_records",
        ["source_identifier"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_imported_at",
        "production_records",
        ["imported_at"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_is_duplicate",
        "production_records",
        ["is_duplicate"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_source_trace",
        "production_records",
        ["data_source", "source_identifier", "original_row_number"],
        unique=False,
    )
    op.create_index(
        "uq_production_records_data_source_source_identifier_row",
        "production_records",
        ["data_source", "source_identifier", "original_row_number"],
        unique=True,
        postgresql_where=sa.text(
            "is_duplicate IS FALSE AND source_identifier IS NOT NULL AND original_row_number IS NOT NULL"
        ),
    )

    op.create_table(
        "google_sheet_config",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("spreadsheet_id", sa.String(length=255), nullable=False),
        sa.Column("sheet_name", sa.String(length=255), nullable=False),
        sa.Column("worksheet_name", sa.String(length=255), nullable=True),
        sa.Column("sheet_url", sa.String(length=2048), nullable=True),
        sa.Column(
            "sync_frequency",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(trim(spreadsheet_id)) > 0",
            name="ck_google_sheet_config_spreadsheet_id_not_blank",
        ),
        sa.CheckConstraint(
            "char_length(trim(sheet_name)) > 0",
            name="ck_google_sheet_config_sheet_name_not_blank",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_google_sheet_config"),
        sa.UniqueConstraint(
            "spreadsheet_id",
            "sheet_name",
            name="uq_google_sheet_config_spreadsheet_sheet",
        ),
    )
    op.create_index(
        "ix_google_sheet_config_is_active",
        "google_sheet_config",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_google_sheet_config_last_synced_at",
        "google_sheet_config",
        ["last_synced_at"],
        unique=False,
    )

    op.create_table(
        "google_form_config",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("form_id", sa.String(length=255), nullable=False),
        sa.Column("form_name", sa.String(length=255), nullable=False),
        sa.Column("form_url", sa.String(length=2048), nullable=True),
        sa.Column("response_sheet_name", sa.String(length=255), nullable=True),
        sa.Column(
            "sync_frequency",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(trim(form_id)) > 0",
            name="ck_google_form_config_form_id_not_blank",
        ),
        sa.CheckConstraint(
            "char_length(trim(form_name)) > 0",
            name="ck_google_form_config_form_name_not_blank",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_google_form_config"),
        sa.UniqueConstraint("form_id", name="uq_google_form_config_form_id"),
    )
    op.create_index(
        "ix_google_form_config_is_active",
        "google_form_config",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_google_form_config_last_synced_at",
        "google_form_config",
        ["last_synced_at"],
        unique=False,
    )

    op.create_table(
        "column_mappings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("source_identifier", sa.String(length=255), nullable=True),
        sa.Column("source_field_name", sa.String(length=255), nullable=False),
        sa.Column("target_field_name", sa.String(length=255), nullable=False),
        sa.Column("default_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("transform_expression", sa.String(length=1024), nullable=True),
        sa.Column(
            "is_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "google_sheet_config_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "google_form_config_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(trim(source_field_name)) > 0",
            name="ck_column_mappings_source_field_name_not_blank",
        ),
        sa.CheckConstraint(
            "char_length(trim(target_field_name)) > 0",
            name="ck_column_mappings_target_field_name_not_blank",
        ),
        sa.ForeignKeyConstraint(
            ["google_sheet_config_id"],
            ["google_sheet_config.id"],
            name="fk_column_mappings_google_sheet_config_id",
        ),
        sa.ForeignKeyConstraint(
            ["google_form_config_id"],
            ["google_form_config.id"],
            name="fk_column_mappings_google_form_config_id",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_column_mappings"),
    )
    op.create_index(
        "ix_column_mappings_source_type_source_identifier",
        "column_mappings",
        ["source_type", "source_identifier"],
        unique=False,
    )
    op.create_index(
        "ix_column_mappings_google_sheet_config_id",
        "column_mappings",
        ["google_sheet_config_id"],
        unique=False,
    )
    op.create_index(
        "ix_column_mappings_google_form_config_id",
        "column_mappings",
        ["google_form_config_id"],
        unique=False,
    )

    op.create_table(
        "sync_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("source_identifier", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "records_processed",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "records_inserted",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "records_updated",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "records_skipped",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "sync_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "google_sheet_config_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "google_form_config_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["google_sheet_config_id"],
            ["google_sheet_config.id"],
            name="fk_sync_logs_google_sheet_config_id",
        ),
        sa.ForeignKeyConstraint(
            ["google_form_config_id"],
            ["google_form_config.id"],
            name="fk_sync_logs_google_form_config_id",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sync_logs"),
    )
    op.create_index(
        "ix_sync_logs_status_started_at",
        "sync_logs",
        ["status", "started_at"],
        unique=False,
    )
    op.create_index(
        "ix_sync_logs_source_type_source_identifier",
        "sync_logs",
        ["source_type", "source_identifier"],
        unique=False,
    )

    op.create_table(
        "field_configurations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("field_name", sa.String(length=255), nullable=False),
        sa.Column("source_field_name", sa.String(length=255), nullable=True),
        sa.Column("target_field_name", sa.String(length=255), nullable=True),
        sa.Column("data_type", sa.String(length=64), nullable=True),
        sa.Column("default_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "is_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "google_sheet_config_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "google_form_config_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "column_mapping_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(trim(entity_type)) > 0",
            name="ck_field_configurations_entity_type_not_blank",
        ),
        sa.CheckConstraint(
            "char_length(trim(field_name)) > 0",
            name="ck_field_configurations_field_name_not_blank",
        ),
        sa.ForeignKeyConstraint(
            ["google_sheet_config_id"],
            ["google_sheet_config.id"],
            name="fk_field_configurations_google_sheet_config_id",
        ),
        sa.ForeignKeyConstraint(
            ["google_form_config_id"],
            ["google_form_config.id"],
            name="fk_field_configurations_google_form_config_id",
        ),
        sa.ForeignKeyConstraint(
            ["column_mapping_id"],
            ["column_mappings.id"],
            name="fk_field_configurations_column_mapping_id",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_field_configurations"),
    )
    op.create_index(
        "ix_field_configurations_entity_type_field_name",
        "field_configurations",
        ["entity_type", "field_name"],
        unique=False,
    )
    op.create_index(
        "ix_field_configurations_google_sheet_config_id",
        "field_configurations",
        ["google_sheet_config_id"],
        unique=False,
    )
    op.create_index(
        "ix_field_configurations_google_form_config_id",
        "field_configurations",
        ["google_form_config_id"],
        unique=False,
    )
    op.create_index(
        "ix_field_configurations_column_mapping_id",
        "field_configurations",
        ["column_mapping_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_field_configurations_column_mapping_id", table_name="field_configurations")
    op.drop_index("ix_field_configurations_google_form_config_id", table_name="field_configurations")
    op.drop_index("ix_field_configurations_google_sheet_config_id", table_name="field_configurations")
    op.drop_index("ix_field_configurations_entity_type_field_name", table_name="field_configurations")
    op.drop_table("field_configurations")

    op.drop_index("ix_sync_logs_source_type_source_identifier", table_name="sync_logs")
    op.drop_index("ix_sync_logs_status_started_at", table_name="sync_logs")
    op.drop_table("sync_logs")

    op.drop_index("ix_column_mappings_google_form_config_id", table_name="column_mappings")
    op.drop_index("ix_column_mappings_google_sheet_config_id", table_name="column_mappings")
    op.drop_index("ix_column_mappings_source_type_source_identifier", table_name="column_mappings")
    op.drop_table("column_mappings")

    op.drop_index("ix_google_form_config_last_synced_at", table_name="google_form_config")
    op.drop_index("ix_google_form_config_is_active", table_name="google_form_config")
    op.drop_table("google_form_config")

    op.drop_index("ix_google_sheet_config_last_synced_at", table_name="google_sheet_config")
    op.drop_index("ix_google_sheet_config_is_active", table_name="google_sheet_config")
    op.drop_table("google_sheet_config")

    op.drop_index("uq_production_records_data_source_source_identifier_row", table_name="production_records")
    op.drop_index("ix_production_records_source_trace", table_name="production_records")
    op.drop_index("ix_production_records_is_duplicate", table_name="production_records")
    op.drop_index("ix_production_records_imported_at", table_name="production_records")
    op.drop_index("ix_production_records_source_identifier", table_name="production_records")
    op.drop_index("ix_production_records_data_source", table_name="production_records")
    op.drop_constraint(
        "ck_production_records_original_row_number_positive",
        "production_records",
        type_="check",
    )
    op.drop_constraint(
        "ck_production_records_source_identifier_not_blank",
        "production_records",
        type_="check",
    )
    op.drop_constraint(
        "ck_production_records_data_source_not_blank",
        "production_records",
        type_="check",
    )
    op.drop_column("production_records", "is_duplicate")
    op.drop_column("production_records", "original_row_number")
    op.drop_column("production_records", "imported_at")
    op.drop_column("production_records", "source_identifier")
    op.drop_column("production_records", "data_source")
