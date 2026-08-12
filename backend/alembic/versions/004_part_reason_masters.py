"""004_part_reason_masters — parts, downtime_reasons, rejection_reasons,
machine_part_standards.

Stage A Migration 004. Depends on 003 (machines and related masters).
No seed data (Excel A–J / 1–11 catalogs authorized later).
downtime_reasons.category is VARCHAR (Q2 TBC) — not a PostgreSQL ENUM.
Rejection code UNIQUE supports Excel A–J; downtime code UNIQUE supports 1–11.

Revision ID: 004
Revises: 003
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- parts ---
    # Stage A: id PK, code UK, name, default_cavity, default_cycle_time_sec
    op.create_table(
        "parts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("default_cavity", sa.Numeric(10, 2), nullable=True),
        sa.Column("default_cycle_time_sec", sa.Numeric(12, 4), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_parts"),
        sa.UniqueConstraint("code", name="uq_parts_code"),
    )

    # --- downtime_reasons ---
    # category VARCHAR configurable (Q2 TBC) — NOT a PostgreSQL ENUM.
    # Excel Q–AA codes 1–11 via code+label (no seed in 004).
    op.create_table(
        "downtime_reasons",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("excel_column", sa.String(length=8), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_downtime_reasons"),
        sa.UniqueConstraint("code", name="uq_downtime_reasons_code"),
    )

    # --- rejection_reasons ---
    # Canonical Excel A–J codes via UNIQUE code (no seed in 004).
    # Expected mapping: A Short Moulding … J Others (see model docstring).
    op.create_table(
        "rejection_reasons",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("excel_column", sa.String(length=8), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_rejection_reasons"),
        sa.UniqueConstraint("code", name="uq_rejection_reasons_code"),
    )

    # --- machine_part_standards ---
    # Machine×part defaults for cycle/cavity; does not alter Excel OEE math.
    op.create_table(
        "machine_part_standards",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("machine_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("part_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cycle_time_sec", sa.Numeric(12, 4), nullable=True),
        sa.Column("cavity_count", sa.Numeric(10, 2), nullable=True),
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
            name="fk_machine_part_standards_machine_id_machines",
        ),
        sa.ForeignKeyConstraint(
            ["part_id"],
            ["parts.id"],
            name="fk_machine_part_standards_part_id_parts",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_machine_part_standards"),
        sa.UniqueConstraint(
            "machine_id",
            "part_id",
            name="uq_machine_part_standards_machine_id_part_id",
        ),
    )
    op.create_index(
        "ix_machine_part_standards_machine_id",
        "machine_part_standards",
        ["machine_id"],
        unique=False,
    )
    op.create_index(
        "ix_machine_part_standards_part_id",
        "machine_part_standards",
        ["part_id"],
        unique=False,
    )


def downgrade() -> None:
    # Drop children before parents (FK-safe order).
    op.drop_index(
        "ix_machine_part_standards_part_id", table_name="machine_part_standards"
    )
    op.drop_index(
        "ix_machine_part_standards_machine_id", table_name="machine_part_standards"
    )
    op.drop_table("machine_part_standards")

    op.drop_table("rejection_reasons")
    op.drop_table("downtime_reasons")
    op.drop_table("parts")
