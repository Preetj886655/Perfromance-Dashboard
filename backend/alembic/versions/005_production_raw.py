"""005_production_raw — production_records, downtime_events, rejection_events.

Stage A Migration 005. Depends on 004 (parts, downtime_reasons, rejection_reasons)
and 003 (machines, operators, shifts, plants).

RAW operational tables only — NO calculated OEE columns (Migration 006).
No seed / sample production data.

Deferred FKs (documented):
- production_records.source_import_id → import_jobs (Migration 007): nullable UUID, no FK
- production_records.created_by / approved_by → users (Migration 009): nullable UUID, no FK

Q1 TBC: production_date separate from start_at/stop_at; no midnight policy.
Q2 TBC: downtime category remains on downtime_reasons (VARCHAR); not hard-coded here.

Revision ID: 005
Revises: 004
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- production_records (RAW only) ---
    # Stage A: production_date DATE + start_at/stop_at TIMESTAMPTZ;
    # no availability/performance/quality/oee/run_time calculated columns.
    op.create_table(
        "production_records",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("plant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("machine_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("shift_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operator_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("part_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("production_date", sa.Date(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stop_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cavity_count", sa.Numeric(10, 2), nullable=False),
        sa.Column("cycle_time_sec", sa.Numeric(12, 4), nullable=False),
        sa.Column("produced_qty", sa.Numeric(14, 4), nullable=False),
        sa.Column(
            "planned_downtime_min",
            sa.Numeric(12, 4),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column(
            "custom_fields",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        # FK to import_jobs deferred until Migration 007.
        sa.Column("source_import_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_type", sa.String(length=64), nullable=True),
        sa.Column("external_row_key", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            server_default=sa.text("'draft'"),
            nullable=False,
        ),
        # FKs to users deferred until Migration 009.
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True),
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
            ["plant_id"],
            ["plants.id"],
            name="fk_production_records_plant_id_plants",
        ),
        sa.ForeignKeyConstraint(
            ["machine_id"],
            ["machines.id"],
            name="fk_production_records_machine_id_machines",
        ),
        sa.ForeignKeyConstraint(
            ["shift_id"],
            ["shifts.id"],
            name="fk_production_records_shift_id_shifts",
        ),
        sa.ForeignKeyConstraint(
            ["operator_id"],
            ["operators.id"],
            name="fk_production_records_operator_id_operators",
        ),
        sa.ForeignKeyConstraint(
            ["part_id"],
            ["parts.id"],
            name="fk_production_records_part_id_parts",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_production_records"),
        sa.UniqueConstraint(
            "machine_id",
            "shift_id",
            "production_date",
            "part_id",
            "start_at",
            name="uq_production_records_machine_shift_date_part_start",
        ),
    )
    op.create_index(
        "ix_production_records_plant_id",
        "production_records",
        ["plant_id"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_machine_id",
        "production_records",
        ["machine_id"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_shift_id",
        "production_records",
        ["shift_id"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_operator_id",
        "production_records",
        ["operator_id"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_part_id",
        "production_records",
        ["part_id"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_start_at",
        "production_records",
        ["start_at"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_stop_at",
        "production_records",
        ["stop_at"],
        unique=False,
    )
    # Stage A composite indexes for dashboards / drill-down.
    op.create_index(
        "ix_production_records_plant_id_production_date_shift_id",
        "production_records",
        ["plant_id", "production_date", "shift_id"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_machine_id_production_date_shift_id",
        "production_records",
        ["machine_id", "production_date", "shift_id"],
        unique=False,
    )
    op.create_index(
        "ix_production_records_part_id_production_date",
        "production_records",
        ["part_id", "production_date"],
        unique=False,
    )

    # --- downtime_events (normalized Excel Q–AA) ---
    op.create_table(
        "downtime_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "production_record_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "downtime_reason_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("minutes", sa.Numeric(12, 4), nullable=False),
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
            "minutes > 0",
            name="ck_downtime_events_minutes_positive",
        ),
        sa.ForeignKeyConstraint(
            ["production_record_id"],
            ["production_records.id"],
            name="fk_downtime_events_production_record_id_production_records",
        ),
        sa.ForeignKeyConstraint(
            ["downtime_reason_id"],
            ["downtime_reasons.id"],
            name="fk_downtime_events_downtime_reason_id_downtime_reasons",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_downtime_events"),
        sa.UniqueConstraint(
            "production_record_id",
            "downtime_reason_id",
            name="uq_downtime_events_production_record_id_downtime_reason_id",
        ),
    )
    op.create_index(
        "ix_downtime_events_production_record_id",
        "downtime_events",
        ["production_record_id"],
        unique=False,
    )
    op.create_index(
        "ix_downtime_events_downtime_reason_id",
        "downtime_events",
        ["downtime_reason_id"],
        unique=False,
    )

    # --- rejection_events (normalized Excel AH–AQ) ---
    op.create_table(
        "rejection_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "production_record_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "rejection_reason_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("qty", sa.Numeric(14, 4), nullable=False),
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
            "qty > 0",
            name="ck_rejection_events_qty_positive",
        ),
        sa.ForeignKeyConstraint(
            ["production_record_id"],
            ["production_records.id"],
            name="fk_rejection_events_production_record_id_production_records",
        ),
        sa.ForeignKeyConstraint(
            ["rejection_reason_id"],
            ["rejection_reasons.id"],
            name="fk_rejection_events_rejection_reason_id_rejection_reasons",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_rejection_events"),
        sa.UniqueConstraint(
            "production_record_id",
            "rejection_reason_id",
            name="uq_rejection_events_production_record_id_rejection_reason_id",
        ),
    )
    op.create_index(
        "ix_rejection_events_production_record_id",
        "rejection_events",
        ["production_record_id"],
        unique=False,
    )
    op.create_index(
        "ix_rejection_events_rejection_reason_id",
        "rejection_events",
        ["rejection_reason_id"],
        unique=False,
    )


def downgrade() -> None:
    # Drop children before parent (FK-safe order).
    op.drop_index(
        "ix_rejection_events_rejection_reason_id",
        table_name="rejection_events",
    )
    op.drop_index(
        "ix_rejection_events_production_record_id",
        table_name="rejection_events",
    )
    op.drop_table("rejection_events")

    op.drop_index(
        "ix_downtime_events_downtime_reason_id",
        table_name="downtime_events",
    )
    op.drop_index(
        "ix_downtime_events_production_record_id",
        table_name="downtime_events",
    )
    op.drop_table("downtime_events")

    op.drop_index(
        "ix_production_records_part_id_production_date",
        table_name="production_records",
    )
    op.drop_index(
        "ix_production_records_machine_id_production_date_shift_id",
        table_name="production_records",
    )
    op.drop_index(
        "ix_production_records_plant_id_production_date_shift_id",
        table_name="production_records",
    )
    op.drop_index("ix_production_records_stop_at", table_name="production_records")
    op.drop_index("ix_production_records_start_at", table_name="production_records")
    op.drop_index("ix_production_records_part_id", table_name="production_records")
    op.drop_index(
        "ix_production_records_operator_id",
        table_name="production_records",
    )
    op.drop_index("ix_production_records_shift_id", table_name="production_records")
    op.drop_index("ix_production_records_machine_id", table_name="production_records")
    op.drop_index("ix_production_records_plant_id", table_name="production_records")
    op.drop_table("production_records")
