"""007_ingestion_lineage — import_jobs, import_job_rows, templates, sources, custom fields.

Stage A Migration 007. Depends on 006 (and transitively 005 production_records).

Ingestion / lineage schema only — no import APIs, Excel/CSV processors, or seeds.
Adds deferred FK: production_records.source_import_id → import_jobs.id.

uploaded_by on import_jobs is nullable UUID without FK to users (Migration 009).
source_type uses VARCHAR + CHECK (excel|csv|form|sheets|manual|api) — not PG ENUM.
data_sources.config is non-secret metadata only.
Heat No./Stage etc. remain via custom_field_definitions + production_records.custom_fields JSONB.

Revision ID: 007
Revises: 006
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SOURCE_TYPE_CHECK = "source_type IN ('excel', 'csv', 'form', 'sheets', 'manual', 'api')"


def upgrade() -> None:
    # --- 1. import_jobs (create first so deferred lineage FK can attach) ---
    op.create_table(
        "import_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("file_uri", sa.String(length=1024), nullable=True),
        # Deferred FK → users (Migration 009): nullable UUID, no FK yet.
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "row_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "success_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "error_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "mapping_config",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("error_summary", sa.Text(), nullable=True),
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
            _SOURCE_TYPE_CHECK,
            name="ck_import_jobs_source_type",
        ),
        sa.CheckConstraint(
            "row_count >= 0",
            name="ck_import_jobs_row_count_nonneg",
        ),
        sa.CheckConstraint(
            "success_count >= 0",
            name="ck_import_jobs_success_count_nonneg",
        ),
        sa.CheckConstraint(
            "error_count >= 0",
            name="ck_import_jobs_error_count_nonneg",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_import_jobs"),
    )
    # Stage A indexes: (created_at DESC), (status)
    op.create_index(
        "ix_import_jobs_created_at",
        "import_jobs",
        ["created_at"],
        unique=False,
        postgresql_ops={"created_at": "DESC"},
    )
    op.create_index(
        "ix_import_jobs_status",
        "import_jobs",
        ["status"],
        unique=False,
    )

    # --- 2. Deferred lineage FK from production_records (Migration 005 column) ---
    op.create_foreign_key(
        "fk_production_records_source_import_id_import_jobs",
        "production_records",
        "import_jobs",
        ["source_import_id"],
        ["id"],
    )
    op.create_index(
        "ix_production_records_source_import_id",
        "production_records",
        ["source_import_id"],
        unique=False,
    )
    # Idempotent upsert support (Stage A lineage): unique when key present.
    op.create_index(
        "uq_production_records_external_row_key",
        "production_records",
        ["external_row_key"],
        unique=True,
        postgresql_where=sa.text("external_row_key IS NOT NULL"),
    )

    # --- 3. import_job_rows (staging; depends on import_jobs + production_records) ---
    op.create_table(
        "import_job_rows",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("import_job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("external_row_key", sa.String(length=255), nullable=True),
        sa.Column(
            "raw_row_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "validation_errors",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "production_record_id",
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
            "row_number >= 1",
            name="ck_import_job_rows_row_number_positive",
        ),
        sa.ForeignKeyConstraint(
            ["import_job_id"],
            ["import_jobs.id"],
            name="fk_import_job_rows_import_job_id_import_jobs",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["production_record_id"],
            ["production_records.id"],
            name="fk_import_job_rows_production_record_id_production_records",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_import_job_rows"),
        sa.UniqueConstraint(
            "import_job_id",
            "row_number",
            name="uq_import_job_rows_import_job_id_row_number",
        ),
    )
    op.create_index(
        "ix_import_job_rows_import_job_id",
        "import_job_rows",
        ["import_job_id"],
        unique=False,
    )
    op.create_index(
        "ix_import_job_rows_production_record_id",
        "import_job_rows",
        ["production_record_id"],
        unique=False,
    )
    op.create_index(
        "ix_import_job_rows_external_row_key",
        "import_job_rows",
        ["external_row_key"],
        unique=False,
    )

    # --- 4. column_mapping_templates ---
    op.create_table(
        "column_mapping_templates",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "mapping",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
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
            _SOURCE_TYPE_CHECK,
            name="ck_column_mapping_templates_source_type",
        ),
        sa.CheckConstraint(
            "version >= 1",
            name="ck_column_mapping_templates_version_positive",
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name="fk_column_mapping_templates_department_id_departments",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_column_mapping_templates"),
        sa.UniqueConstraint(
            "name",
            "source_type",
            "version",
            name="uq_column_mapping_templates_name_source_type_version",
        ),
    )
    op.create_index(
        "ix_column_mapping_templates_department_id",
        "column_mapping_templates",
        ["department_id"],
        unique=False,
    )
    op.create_index(
        "ix_column_mapping_templates_source_type",
        "column_mapping_templates",
        ["source_type"],
        unique=False,
    )

    # --- 5. data_sources (registry + freshness SLA; config has NO secrets) ---
    op.create_table(
        "data_sources",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("freshness_sla_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
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
            _SOURCE_TYPE_CHECK,
            name="ck_data_sources_source_type",
        ),
        sa.CheckConstraint(
            "freshness_sla_minutes IS NULL OR freshness_sla_minutes > 0",
            name="ck_data_sources_freshness_sla_minutes_positive",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_data_sources"),
        sa.UniqueConstraint("code", name="uq_data_sources_code"),
    )
    op.create_index(
        "ix_data_sources_source_type",
        "data_sources",
        ["source_type"],
        unique=False,
    )
    op.create_index(
        "ix_data_sources_is_active",
        "data_sources",
        ["is_active"],
        unique=False,
    )

    # --- 6. custom_field_definitions (Heat No./Stage metadata; values in JSONB) ---
    op.create_table(
        "custom_field_definitions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("field_name", sa.String(length=128), nullable=False),
        sa.Column("field_type", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column(
            "is_required",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "options",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
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
            ["department_id"],
            ["departments.id"],
            name="fk_custom_field_definitions_department_id_departments",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_custom_field_definitions"),
    )
    # Partial uniques: avoid PG NULL-duplicate quirk on department_id.
    op.create_index(
        "uq_custom_field_definitions_entity_field_global",
        "custom_field_definitions",
        ["entity_type", "field_name"],
        unique=True,
        postgresql_where=sa.text("department_id IS NULL"),
    )
    op.create_index(
        "uq_custom_field_definitions_entity_field_department",
        "custom_field_definitions",
        ["entity_type", "field_name", "department_id"],
        unique=True,
        postgresql_where=sa.text("department_id IS NOT NULL"),
    )
    op.create_index(
        "ix_custom_field_definitions_department_id",
        "custom_field_definitions",
        ["department_id"],
        unique=False,
    )
    op.create_index(
        "ix_custom_field_definitions_entity_type",
        "custom_field_definitions",
        ["entity_type"],
        unique=False,
    )


def downgrade() -> None:
    # Drop dependents before import_jobs; drop lineage FK before import_jobs.
    op.drop_index(
        "ix_custom_field_definitions_entity_type",
        table_name="custom_field_definitions",
    )
    op.drop_index(
        "ix_custom_field_definitions_department_id",
        table_name="custom_field_definitions",
    )
    op.drop_index(
        "uq_custom_field_definitions_entity_field_department",
        table_name="custom_field_definitions",
    )
    op.drop_index(
        "uq_custom_field_definitions_entity_field_global",
        table_name="custom_field_definitions",
    )
    op.drop_table("custom_field_definitions")

    op.drop_index("ix_data_sources_is_active", table_name="data_sources")
    op.drop_index("ix_data_sources_source_type", table_name="data_sources")
    op.drop_table("data_sources")

    op.drop_index(
        "ix_column_mapping_templates_source_type",
        table_name="column_mapping_templates",
    )
    op.drop_index(
        "ix_column_mapping_templates_department_id",
        table_name="column_mapping_templates",
    )
    op.drop_table("column_mapping_templates")

    op.drop_index(
        "ix_import_job_rows_external_row_key",
        table_name="import_job_rows",
    )
    op.drop_index(
        "ix_import_job_rows_production_record_id",
        table_name="import_job_rows",
    )
    op.drop_index(
        "ix_import_job_rows_import_job_id",
        table_name="import_job_rows",
    )
    op.drop_table("import_job_rows")

    op.drop_index(
        "uq_production_records_external_row_key",
        table_name="production_records",
    )
    op.drop_index(
        "ix_production_records_source_import_id",
        table_name="production_records",
    )
    op.drop_constraint(
        "fk_production_records_source_import_id_import_jobs",
        "production_records",
        type_="foreignkey",
    )

    op.drop_index("ix_import_jobs_status", table_name="import_jobs")
    op.drop_index("ix_import_jobs_created_at", table_name="import_jobs")
    op.drop_table("import_jobs")
