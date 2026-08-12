"""008_kpi_registry — kpi_definitions, kpi_results.

Stage A Migration 008. Depends on 007 (and transitively 002 departments).

KPI registry schema only — no calculation engine, dashboard APIs, alerts, or seeds.
Uses formula_key + formula_version (versioned backend calculator registry).
No executable formula_expression / SQL columns.

owner_role_id is nullable UUID without FK to roles (Migration 009).
weight is unconstrained (Q17 TBC — no fixed-equal-weight CHECK).
OEE remains on production_record_metrics / oee_snapshots — not duplicated here.

Revision ID: 008
Revises: 007
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_AGGREGATION_METHOD_CHECK = (
    "aggregation_method IN ("
    "'SUM', 'RATIO_OF_SUMS', 'COUNT', 'LATEST', 'WAVG'"
    ")"
)
_SCOPE_TYPE_CHECK = "scope_type IN ('plant', 'department', 'line', 'machine')"
_PERIOD_TYPE_CHECK = "period_type IN ('day', 'week', 'month')"


def upgrade() -> None:
    # --- 1. kpi_definitions (registry config; calculator via formula_key) ---
    op.create_table(
        "kpi_definitions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(length=64), nullable=True),
        # Versioned backend calculator key — NOT executable user SQL/expression.
        sa.Column("formula_key", sa.String(length=128), nullable=False),
        sa.Column("formula_version", sa.Integer(), nullable=False),
        sa.Column("aggregation_method", sa.String(length=32), nullable=False),
        sa.Column("target", sa.Numeric(18, 6), nullable=True),
        sa.Column("warning_threshold", sa.Numeric(18, 6), nullable=True),
        sa.Column("critical_threshold", sa.Numeric(18, 6), nullable=True),
        # Q17 TBC: admin-configurable; no CHECK forcing equal weights.
        sa.Column("weight", sa.Numeric(12, 6), nullable=True),
        sa.Column("frequency", sa.String(length=64), nullable=True),
        # Deferred FK → roles (Migration 009): nullable UUID, no FK yet.
        sa.Column("owner_role_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
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
            _AGGREGATION_METHOD_CHECK,
            name="ck_kpi_definitions_aggregation_method",
        ),
        sa.CheckConstraint(
            "formula_version >= 1",
            name="ck_kpi_definitions_formula_version_positive",
        ),
        sa.CheckConstraint(
            "version >= 1",
            name="ck_kpi_definitions_version_positive",
        ),
        sa.CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_kpi_definitions_effective_range",
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name="fk_kpi_definitions_department_id_departments",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_kpi_definitions"),
        sa.UniqueConstraint(
            "code",
            "version",
            name="uq_kpi_definitions_code_version",
        ),
    )
    op.create_index(
        "ix_kpi_definitions_department_id",
        "kpi_definitions",
        ["department_id"],
        unique=False,
    )
    op.create_index(
        "ix_kpi_definitions_formula_key_formula_version",
        "kpi_definitions",
        ["formula_key", "formula_version"],
        unique=False,
    )
    op.create_index(
        "ix_kpi_definitions_is_active_effective_from",
        "kpi_definitions",
        ["is_active", "effective_from"],
        unique=False,
    )

    # --- 2. kpi_results (non-OEE snapshots; scope_type + scope_id like oee_snapshots) ---
    op.create_table(
        "kpi_results",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("kpi_definition_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scope_type", sa.String(length=32), nullable=False),
        sa.Column("scope_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("period_type", sa.String(length=16), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("result_value", sa.Numeric(18, 6), nullable=False),
        sa.Column("target_value", sa.Numeric(18, 6), nullable=True),
        sa.Column("achievement", sa.Numeric(18, 6), nullable=True),
        sa.Column("formula_key", sa.String(length=128), nullable=False),
        sa.Column("formula_version", sa.Integer(), nullable=False),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
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
            _SCOPE_TYPE_CHECK,
            name="ck_kpi_results_scope_type",
        ),
        sa.CheckConstraint(
            _PERIOD_TYPE_CHECK,
            name="ck_kpi_results_period_type",
        ),
        sa.CheckConstraint(
            "formula_version >= 1",
            name="ck_kpi_results_formula_version_positive",
        ),
        sa.ForeignKeyConstraint(
            ["kpi_definition_id"],
            ["kpi_definitions.id"],
            name="fk_kpi_results_kpi_definition_id_kpi_definitions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_kpi_results"),
        sa.UniqueConstraint(
            "kpi_definition_id",
            "scope_type",
            "scope_id",
            "period_type",
            "period_start",
            "formula_version",
            name="uq_kpi_results_definition_scope_period_formula",
        ),
    )
    op.create_index(
        "ix_kpi_results_kpi_definition_id",
        "kpi_results",
        ["kpi_definition_id"],
        unique=False,
    )
    op.create_index(
        "ix_kpi_results_period_type_period_start_scope_type",
        "kpi_results",
        ["period_type", "period_start", "scope_type"],
        unique=False,
    )
    op.create_index(
        "ix_kpi_results_scope_type_scope_id_period_type_period_start",
        "kpi_results",
        ["scope_type", "scope_id", "period_type", "period_start"],
        unique=False,
        postgresql_ops={"period_start": "DESC"},
    )


def downgrade() -> None:
    # Drop kpi_results first (FK dependent), then kpi_definitions.
    op.drop_index(
        "ix_kpi_results_scope_type_scope_id_period_type_period_start",
        table_name="kpi_results",
    )
    op.drop_index(
        "ix_kpi_results_period_type_period_start_scope_type",
        table_name="kpi_results",
    )
    op.drop_index(
        "ix_kpi_results_kpi_definition_id",
        table_name="kpi_results",
    )
    op.drop_table("kpi_results")

    op.drop_index(
        "ix_kpi_definitions_is_active_effective_from",
        table_name="kpi_definitions",
    )
    op.drop_index(
        "ix_kpi_definitions_formula_key_formula_version",
        table_name="kpi_definitions",
    )
    op.drop_index(
        "ix_kpi_definitions_department_id",
        table_name="kpi_definitions",
    )
    op.drop_table("kpi_definitions")
