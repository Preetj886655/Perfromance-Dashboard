"""012_ppc — production_plans (PPC / production planning).

Stage A Migration 012. Depends on 011 (and transitively parts / machines /
lines from 002–004).

Schema only — no material_availability_checks, work orders, MRP, BOM, routing,
PPC APIs, frontend, workers, or seed plans.

horizon is configurable VARCHAR (Stage A n / n+1 / n+2 concepts) — not PG ENUM
and no restrictive CHECK. No stored actual_qty / achievement% / variance /
plan_vs_actual / OEE columns (Plan vs Actual = join to production_records).
No uniqueness that blocks multiple plans for the same part/date/horizon.
Q13 remains TBC: line_id is optional only.

Revision ID: 012
Revises: 011
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "production_plans",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("plan_date", sa.Date(), nullable=False),
        # VARCHAR — configurable; not PG ENUM; no restrictive horizon CHECK.
        sa.Column("horizon", sa.String(length=32), nullable=False),
        sa.Column("part_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("machine_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Q13 TBC — optional line only.
        sa.Column("line_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("plan_qty", sa.Numeric(precision=12, scale=4), nullable=False),
        # Optional lifecycle label — VARCHAR not PG ENUM.
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
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
            "plan_qty >= 0",
            name="ck_production_plans_plan_qty_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["part_id"],
            ["parts.id"],
            name="fk_production_plans_part_id_parts",
        ),
        sa.ForeignKeyConstraint(
            ["machine_id"],
            ["machines.id"],
            name="fk_production_plans_machine_id_machines",
        ),
        sa.ForeignKeyConstraint(
            ["line_id"],
            ["lines.id"],
            name="fk_production_plans_line_id_lines",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_production_plans"),
    )
    op.create_index(
        "ix_production_plans_plan_date",
        "production_plans",
        ["plan_date"],
        unique=False,
    )
    op.create_index(
        "ix_production_plans_part_id_plan_date",
        "production_plans",
        ["part_id", "plan_date"],
        unique=False,
    )
    op.create_index(
        "ix_production_plans_machine_id_plan_date",
        "production_plans",
        ["machine_id", "plan_date"],
        unique=False,
    )
    op.create_index(
        "ix_production_plans_line_id_plan_date",
        "production_plans",
        ["line_id", "plan_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_production_plans_line_id_plan_date",
        table_name="production_plans",
    )
    op.drop_index(
        "ix_production_plans_machine_id_plan_date",
        table_name="production_plans",
    )
    op.drop_index(
        "ix_production_plans_part_id_plan_date",
        table_name="production_plans",
    )
    op.drop_index("ix_production_plans_plan_date", table_name="production_plans")
    op.drop_table("production_plans")
