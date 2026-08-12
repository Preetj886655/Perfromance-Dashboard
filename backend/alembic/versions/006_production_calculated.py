"""006_production_calculated — production_record_metrics, oee_snapshots.

Stage A Migration 006. Depends on 005 (production_records).

CALCULATED / OEE tables only — schema empty; no calculation engine, no seeds.
No calculated columns added to production_records (raw remains raw).

Q6 TBC: oee_snapshots component sums + stored ratios assume proposed default
RATIO-OF-SUMS (run-time weighted Performance). Not business-confirmed.
Q11 / Q13: plant/line scopes via scope_type + scope_id only; mapping unresolved.
No parallel plant_id / line_id / machine_id FKs on oee_snapshots (Stage A).

Revision ID: 006
Revises: 005
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- production_record_metrics (1:1 calculated row; Excel G/M/P/AB–AG/AR–AU) ---
    # AF = performance (OEE P). AG = machine_utilisation (separate). No PG generated cols.
    op.create_table(
        "production_record_metrics",
        sa.Column(
            "production_record_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("shift_time_min", sa.Numeric(12, 4), nullable=False),
        sa.Column("available_time_min", sa.Numeric(12, 4), nullable=False),
        sa.Column("total_idle_time_min", sa.Numeric(12, 4), nullable=False),
        sa.Column("run_time_min", sa.Numeric(12, 4), nullable=False),
        sa.Column("target_qty_per_hr", sa.Numeric(14, 4), nullable=False),
        sa.Column("actual_qty_per_hr", sa.Numeric(14, 4), nullable=False),
        sa.Column("availability", sa.Numeric(12, 8), nullable=False),
        sa.Column("performance", sa.Numeric(12, 8), nullable=False),
        sa.Column("machine_utilisation", sa.Numeric(12, 8), nullable=False),
        sa.Column("total_rejection_qty", sa.Numeric(14, 4), nullable=False),
        sa.Column("rejection_ppm", sa.Numeric(14, 4), nullable=False),
        sa.Column("quality", sa.Numeric(12, 8), nullable=False),
        sa.Column("oee", sa.Numeric(12, 8), nullable=False),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("formula_version", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "shift_time_min >= 0",
            name="ck_production_record_metrics_shift_time_min_nonneg",
        ),
        sa.CheckConstraint(
            "available_time_min >= 0",
            name="ck_production_record_metrics_available_time_min_nonneg",
        ),
        sa.CheckConstraint(
            "total_idle_time_min >= 0",
            name="ck_production_record_metrics_total_idle_time_min_nonneg",
        ),
        sa.CheckConstraint(
            "run_time_min >= 0",
            name="ck_production_record_metrics_run_time_min_nonneg",
        ),
        sa.CheckConstraint(
            "target_qty_per_hr >= 0",
            name="ck_production_record_metrics_target_qty_per_hr_nonneg",
        ),
        sa.CheckConstraint(
            "actual_qty_per_hr >= 0",
            name="ck_production_record_metrics_actual_qty_per_hr_nonneg",
        ),
        sa.CheckConstraint(
            "total_rejection_qty >= 0",
            name="ck_production_record_metrics_total_rejection_qty_nonneg",
        ),
        sa.CheckConstraint(
            "rejection_ppm >= 0",
            name="ck_production_record_metrics_rejection_ppm_nonneg",
        ),
        sa.CheckConstraint(
            "availability >= 0",
            name="ck_production_record_metrics_availability_nonneg",
        ),
        sa.CheckConstraint(
            "performance >= 0",
            name="ck_production_record_metrics_performance_nonneg",
        ),
        sa.CheckConstraint(
            "machine_utilisation >= 0",
            name="ck_production_record_metrics_machine_utilisation_nonneg",
        ),
        sa.CheckConstraint(
            "quality >= 0",
            name="ck_production_record_metrics_quality_nonneg",
        ),
        sa.CheckConstraint(
            "oee >= 0",
            name="ck_production_record_metrics_oee_nonneg",
        ),
        sa.ForeignKeyConstraint(
            ["production_record_id"],
            ["production_records.id"],
            name="fk_production_record_metrics_production_record_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "production_record_id",
            name="pk_production_record_metrics",
        ),
    )

    # --- oee_snapshots (polymorphic scope × period; Q6 proposed ratio-of-sums TBC) ---
    # No parallel plant_id / line_id / machine_id columns — scope_type + scope_id only.
    op.create_table(
        "oee_snapshots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("scope_type", sa.String(length=32), nullable=False),
        sa.Column("scope_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("period_type", sa.String(length=16), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        # Component sums — proposed RATIO-OF-SUMS default for Q6 (NOT confirmed)
        sa.Column("sum_run_time_min", sa.Numeric(14, 4), nullable=False),
        sa.Column("sum_available_time_min", sa.Numeric(14, 4), nullable=False),
        sa.Column("sum_produced_qty", sa.Numeric(16, 4), nullable=False),
        sa.Column("sum_good_qty", sa.Numeric(16, 4), nullable=False),
        sa.Column("sum_rejection_qty", sa.Numeric(16, 4), nullable=False),
        # Σ (run_time_min/60 × target_qty_per_hr) — P_period denominator (Q6 proposed)
        sa.Column("sum_run_based_capacity", sa.Numeric(16, 4), nullable=False),
        sa.Column("availability", sa.Numeric(12, 8), nullable=False),
        sa.Column("performance", sa.Numeric(12, 8), nullable=False),
        sa.Column("quality", sa.Numeric(12, 8), nullable=False),
        sa.Column("oee", sa.Numeric(12, 8), nullable=False),
        sa.Column("aggregation_rule_version", sa.Integer(), nullable=False),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "scope_type IN ('machine', 'line', 'plant')",
            name="ck_oee_snapshots_scope_type",
        ),
        sa.CheckConstraint(
            "period_type IN ('day', 'week', 'month')",
            name="ck_oee_snapshots_period_type",
        ),
        sa.CheckConstraint(
            "sum_run_time_min >= 0",
            name="ck_oee_snapshots_sum_run_time_min_nonneg",
        ),
        sa.CheckConstraint(
            "sum_available_time_min >= 0",
            name="ck_oee_snapshots_sum_available_time_min_nonneg",
        ),
        sa.CheckConstraint(
            "sum_produced_qty >= 0",
            name="ck_oee_snapshots_sum_produced_qty_nonneg",
        ),
        sa.CheckConstraint(
            "sum_good_qty >= 0",
            name="ck_oee_snapshots_sum_good_qty_nonneg",
        ),
        sa.CheckConstraint(
            "sum_rejection_qty >= 0",
            name="ck_oee_snapshots_sum_rejection_qty_nonneg",
        ),
        sa.CheckConstraint(
            "sum_run_based_capacity >= 0",
            name="ck_oee_snapshots_sum_run_based_capacity_nonneg",
        ),
        sa.CheckConstraint(
            "availability >= 0",
            name="ck_oee_snapshots_availability_nonneg",
        ),
        sa.CheckConstraint(
            "performance >= 0",
            name="ck_oee_snapshots_performance_nonneg",
        ),
        sa.CheckConstraint(
            "quality >= 0",
            name="ck_oee_snapshots_quality_nonneg",
        ),
        sa.CheckConstraint(
            "oee >= 0",
            name="ck_oee_snapshots_oee_nonneg",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_oee_snapshots"),
        sa.UniqueConstraint(
            "scope_type",
            "scope_id",
            "period_type",
            "period_start",
            "aggregation_rule_version",
            name="uq_oee_snapshots_scope_period_rule",
        ),
    )
    # Stage A indexes for period browse and scope drill-down.
    op.create_index(
        "ix_oee_snapshots_period_type_period_start_scope_type",
        "oee_snapshots",
        ["period_type", "period_start", "scope_type"],
        unique=False,
    )
    op.create_index(
        "ix_oee_snapshots_scope_type_scope_id_period_type_period_start",
        "oee_snapshots",
        ["scope_type", "scope_id", "period_type", "period_start"],
        unique=False,
        postgresql_ops={"period_start": "DESC"},
    )


def downgrade() -> None:
    op.drop_index(
        "ix_oee_snapshots_scope_type_scope_id_period_type_period_start",
        table_name="oee_snapshots",
    )
    op.drop_index(
        "ix_oee_snapshots_period_type_period_start_scope_type",
        table_name="oee_snapshots",
    )
    op.drop_table("oee_snapshots")
    op.drop_table("production_record_metrics")
