"""003_asset_people_masters — machine_types, machine_statuses, machines,
operators, shifts, shift_calendars.

Stage A Migration 003. Depends on 002 (plants, departments, lines).
No seed data. No PostgreSQL ENUMs.
Q13: machines.line_id nullable. Q1: crosses_midnight flag only (no attribution rule).

Revision ID: 003
Revises: 002
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- machine_types (lookup catalog; not PG ENUM) ---
    op.create_table(
        "machine_types",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_machine_types"),
        sa.UniqueConstraint("code", name="uq_machine_types_code"),
    )

    # --- machine_statuses (lookup catalog; not PG ENUM) ---
    op.create_table(
        "machine_statuses",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_machine_statuses"),
        sa.UniqueConstraint("code", name="uq_machine_statuses_code"),
    )

    # --- machines ---
    # Stage A: plant_id FK, line_id FK NULL (Q13), code UK(plant), name,
    # machine_type_id, status_id, ideal_cycle_time_sec NULL
    op.create_table(
        "machines",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("plant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("line_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("machine_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ideal_cycle_time_sec", sa.Numeric(12, 4), nullable=True),
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
            name="fk_machines_plant_id_plants",
        ),
        sa.ForeignKeyConstraint(
            ["line_id"],
            ["lines.id"],
            name="fk_machines_line_id_lines",
        ),
        sa.ForeignKeyConstraint(
            ["machine_type_id"],
            ["machine_types.id"],
            name="fk_machines_machine_type_id_machine_types",
        ),
        sa.ForeignKeyConstraint(
            ["status_id"],
            ["machine_statuses.id"],
            name="fk_machines_status_id_machine_statuses",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_machines"),
        sa.UniqueConstraint("plant_id", "code", name="uq_machines_plant_id_code"),
    )
    op.create_index("ix_machines_plant_id", "machines", ["plant_id"], unique=False)
    op.create_index("ix_machines_line_id", "machines", ["line_id"], unique=False)
    op.create_index(
        "ix_machines_machine_type_id", "machines", ["machine_type_id"], unique=False
    )
    op.create_index("ix_machines_status_id", "machines", ["status_id"], unique=False)

    # --- operators ---
    op.create_table(
        "operators",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("employee_code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            name="fk_operators_department_id_departments",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_operators"),
        sa.UniqueConstraint("employee_code", name="uq_operators_employee_code"),
    )
    op.create_index(
        "ix_operators_department_id", "operators", ["department_id"], unique=False
    )

    # --- shifts ---
    # crosses_midnight is a configurable flag only (Q1 attribution remains TBC).
    op.create_table(
        "shifts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("plant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column(
            "crosses_midnight",
            sa.Boolean(),
            server_default=sa.text("false"),
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
            ["plant_id"],
            ["plants.id"],
            name="fk_shifts_plant_id_plants",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_shifts"),
        sa.UniqueConstraint("plant_id", "code", name="uq_shifts_plant_id_code"),
    )
    op.create_index("ix_shifts_plant_id", "shifts", ["plant_id"], unique=False)

    # --- shift_calendars ---
    op.create_table(
        "shift_calendars",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("plant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("calendar_date", sa.Date(), nullable=False),
        sa.Column("shift_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "is_holiday",
            sa.Boolean(),
            server_default=sa.text("false"),
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
            ["plant_id"],
            ["plants.id"],
            name="fk_shift_calendars_plant_id_plants",
        ),
        sa.ForeignKeyConstraint(
            ["shift_id"],
            ["shifts.id"],
            name="fk_shift_calendars_shift_id_shifts",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_shift_calendars"),
        sa.UniqueConstraint(
            "plant_id",
            "calendar_date",
            "shift_id",
            name="uq_shift_calendars_plant_id_calendar_date_shift_id",
        ),
    )
    op.create_index(
        "ix_shift_calendars_plant_id", "shift_calendars", ["plant_id"], unique=False
    )
    op.create_index(
        "ix_shift_calendars_shift_id", "shift_calendars", ["shift_id"], unique=False
    )


def downgrade() -> None:
    # Drop children before parents (FK-safe order).
    op.drop_index("ix_shift_calendars_shift_id", table_name="shift_calendars")
    op.drop_index("ix_shift_calendars_plant_id", table_name="shift_calendars")
    op.drop_table("shift_calendars")

    op.drop_index("ix_shifts_plant_id", table_name="shifts")
    op.drop_table("shifts")

    op.drop_index("ix_operators_department_id", table_name="operators")
    op.drop_table("operators")

    op.drop_index("ix_machines_status_id", table_name="machines")
    op.drop_index("ix_machines_machine_type_id", table_name="machines")
    op.drop_index("ix_machines_line_id", table_name="machines")
    op.drop_index("ix_machines_plant_id", table_name="machines")
    op.drop_table("machines")

    op.drop_table("machine_statuses")
    op.drop_table("machine_types")
