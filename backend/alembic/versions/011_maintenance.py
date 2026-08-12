"""011_maintenance — maintenance_tickets, pm_schedules, pm_completions.

Stage A Migration 011. Depends on 010 (users) and transitively machines /
production_records / downtime_events (003, 005).

Schema only — no MTTR/MTBF/PM% stored columns, no scheduling engine, workers,
notifications, maintenance APIs, or seed tickets/schedules/completions.

No PostgreSQL ENUMs for type/priority/status/result. Optional ticket links to
production_records and downtime_events use real FKs (SET NULL), not polymorphic
refs. pm_completions.machine_id is denormalized for history queries; app should
copy schedule.machine_id at insert (no fragile consistency trigger).

Revision ID: 011
Revises: 010
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. maintenance_tickets (breakdown / corrective; optional prod/DT links) ---
    op.create_table(
        "maintenance_tickets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("machine_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "production_record_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "downtime_event_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column("ticket_code", sa.String(length=64), nullable=False),
        # VARCHAR — not PG ENUM.
        sa.Column("maintenance_type", sa.String(length=64), nullable=False),
        sa.Column("problem", sa.Text(), nullable=False),
        sa.Column("root_cause", sa.Text(), nullable=True),
        sa.Column("corrective_action", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "opened_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True), nullable=True),
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
            ["machine_id"],
            ["machines.id"],
            name="fk_maintenance_tickets_machine_id_machines",
        ),
        sa.ForeignKeyConstraint(
            ["production_record_id"],
            ["production_records.id"],
            name="fk_maintenance_tickets_production_record_id_production_records",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["downtime_event_id"],
            ["downtime_events.id"],
            name="fk_maintenance_tickets_downtime_event_id_downtime_events",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["assigned_to"],
            ["users.id"],
            name="fk_maintenance_tickets_assigned_to_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_maintenance_tickets"),
        sa.UniqueConstraint("ticket_code", name="uq_maintenance_tickets_ticket_code"),
    )
    op.create_index(
        "ix_maintenance_tickets_machine_id",
        "maintenance_tickets",
        ["machine_id"],
        unique=False,
    )
    op.create_index(
        "ix_maintenance_tickets_status",
        "maintenance_tickets",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_maintenance_tickets_opened_at",
        "maintenance_tickets",
        ["opened_at"],
        unique=False,
    )
    op.create_index(
        "ix_maintenance_tickets_machine_id_opened_at",
        "maintenance_tickets",
        ["machine_id", "opened_at"],
        unique=False,
    )
    op.create_index(
        "ix_maintenance_tickets_production_record_id",
        "maintenance_tickets",
        ["production_record_id"],
        unique=False,
    )
    op.create_index(
        "ix_maintenance_tickets_downtime_event_id",
        "maintenance_tickets",
        ["downtime_event_id"],
        unique=False,
    )
    op.create_index(
        "ix_maintenance_tickets_assigned_to",
        "maintenance_tickets",
        ["assigned_to"],
        unique=False,
    )

    # --- 2. pm_schedules (preventive config; JSONB frequency; no engine) ---
    op.create_table(
        "pm_schedules",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("machine_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "frequency_config",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("next_due_date", sa.Date(), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            ["machine_id"],
            ["machines.id"],
            name="fk_pm_schedules_machine_id_machines",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name="fk_pm_schedules_owner_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_pm_schedules"),
        sa.UniqueConstraint(
            "machine_id",
            "code",
            name="uq_pm_schedules_machine_id_code",
        ),
    )
    op.create_index(
        "ix_pm_schedules_machine_id",
        "pm_schedules",
        ["machine_id"],
        unique=False,
    )
    op.create_index(
        "ix_pm_schedules_next_due_date",
        "pm_schedules",
        ["next_due_date"],
        unique=False,
    )
    op.create_index(
        "ix_pm_schedules_is_active",
        "pm_schedules",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_pm_schedules_owner_id",
        "pm_schedules",
        ["owner_id"],
        unique=False,
    )

    # --- 3. pm_completions (history; denormalized machine_id; CASCADE schedule) ---
    op.create_table(
        "pm_completions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("pm_schedule_id", postgresql.UUID(as_uuid=True), nullable=False),
        # Denormalized for history queries — app copies schedule.machine_id.
        sa.Column("machine_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("completed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        # VARCHAR — not PG ENUM.
        sa.Column("result_status", sa.String(length=32), nullable=False),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column(
            "evidence",
            postgresql.JSONB(astext_type=sa.Text()),
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
            ["pm_schedule_id"],
            ["pm_schedules.id"],
            name="fk_pm_completions_pm_schedule_id_pm_schedules",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["machine_id"],
            ["machines.id"],
            name="fk_pm_completions_machine_id_machines",
        ),
        sa.ForeignKeyConstraint(
            ["completed_by"],
            ["users.id"],
            name="fk_pm_completions_completed_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_pm_completions"),
    )
    op.create_index(
        "ix_pm_completions_pm_schedule_id",
        "pm_completions",
        ["pm_schedule_id"],
        unique=False,
    )
    op.create_index(
        "ix_pm_completions_machine_id",
        "pm_completions",
        ["machine_id"],
        unique=False,
    )
    op.create_index(
        "ix_pm_completions_completed_at",
        "pm_completions",
        ["completed_at"],
        unique=False,
    )
    op.create_index(
        "ix_pm_completions_completed_by",
        "pm_completions",
        ["completed_by"],
        unique=False,
    )


def downgrade() -> None:
    # Drop in FK-safe order: pm_completions → pm_schedules → maintenance_tickets
    op.drop_index("ix_pm_completions_completed_by", table_name="pm_completions")
    op.drop_index("ix_pm_completions_completed_at", table_name="pm_completions")
    op.drop_index("ix_pm_completions_machine_id", table_name="pm_completions")
    op.drop_index("ix_pm_completions_pm_schedule_id", table_name="pm_completions")
    op.drop_table("pm_completions")

    op.drop_index("ix_pm_schedules_owner_id", table_name="pm_schedules")
    op.drop_index("ix_pm_schedules_is_active", table_name="pm_schedules")
    op.drop_index("ix_pm_schedules_next_due_date", table_name="pm_schedules")
    op.drop_index("ix_pm_schedules_machine_id", table_name="pm_schedules")
    op.drop_table("pm_schedules")

    op.drop_index("ix_maintenance_tickets_assigned_to", table_name="maintenance_tickets")
    op.drop_index(
        "ix_maintenance_tickets_downtime_event_id",
        table_name="maintenance_tickets",
    )
    op.drop_index(
        "ix_maintenance_tickets_production_record_id",
        table_name="maintenance_tickets",
    )
    op.drop_index(
        "ix_maintenance_tickets_machine_id_opened_at",
        table_name="maintenance_tickets",
    )
    op.drop_index("ix_maintenance_tickets_opened_at", table_name="maintenance_tickets")
    op.drop_index("ix_maintenance_tickets_status", table_name="maintenance_tickets")
    op.drop_index("ix_maintenance_tickets_machine_id", table_name="maintenance_tickets")
    op.drop_table("maintenance_tickets")
