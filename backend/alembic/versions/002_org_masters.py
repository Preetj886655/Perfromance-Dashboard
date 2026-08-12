"""002_org_masters — plants, departments, lines.

Stage A Migration 002. Depends on 001 (pgcrypto for gen_random_uuid).
No seed data. No PostgreSQL ENUMs.

Revision ID: 002
Revises: 001
Create Date: 2026-08-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- plants ---
    # Stage A: id PK, code UK, name, timezone, is_active + audit timestamps
    op.create_table(
        "plants",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_plants"),
        sa.UniqueConstraint("code", name="uq_plants_code"),
    )

    # --- departments ---
    # Stage A / master sketch: id, name, code (global catalog; no plant_id)
    op.create_table(
        "departments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_departments"),
        sa.UniqueConstraint("code", name="uq_departments_code"),
    )

    # --- lines ---
    # Stage A: id, plant_id FK → plants, name, code; UK(plant_id, code)
    # Q13: lines exist; machines.line_id nullable comes in Migration 003
    op.create_table(
        "lines",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("plant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
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
            name="fk_lines_plant_id_plants",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_lines"),
        sa.UniqueConstraint("plant_id", "code", name="uq_lines_plant_id_code"),
    )
    op.create_index("ix_lines_plant_id", "lines", ["plant_id"], unique=False)


def downgrade() -> None:
    # Drop children before parents (FK order).
    op.drop_index("ix_lines_plant_id", table_name="lines")
    op.drop_table("lines")
    op.drop_table("departments")
    op.drop_table("plants")
