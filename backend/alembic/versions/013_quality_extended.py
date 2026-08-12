"""013_quality_extended — quality_inspections, customer_complaints.

Stage A Migration 013. Depends on 012 (and transitively parts from 004;
machines / production_records / users already present from earlier migrations).

Schema only — no customers master (014), no CAPA tables (actions in 010),
no quality APIs, frontend, workers, calculators, or seed inspections/complaints.

inspection_type / result_status / status / severity are VARCHAR — not PG ENUM
and no restrictive CHECKs locking in_process|final or open|closed.
No stored Inspection Pass Rate / Final PPM / Customer PPM columns (KPI engine).
customers deferred to 014: customer_name is free-text until customers exist.
No uniqueness inventing beyond complaint_code identity.

Revision ID: 013
Revises: 012
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. quality_inspections (in-process / final inspection lots) ---
    op.create_table(
        "quality_inspections",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("inspection_date", sa.Date(), nullable=False),
        # VARCHAR — in_process / final concepts; not PG ENUM; no restrictive CHECK.
        sa.Column("inspection_type", sa.String(length=32), nullable=False),
        sa.Column("part_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("machine_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Optional link to DPR row — SET NULL if production record removed.
        sa.Column(
            "production_record_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column("lot_code", sa.String(length=64), nullable=True),
        sa.Column("inspected_qty", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("passed_qty", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("rejected_qty", sa.Numeric(precision=14, scale=4), nullable=False),
        # Optional outcome label — VARCHAR not PG ENUM.
        sa.Column("result_status", sa.String(length=32), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("inspected_by", postgresql.UUID(as_uuid=True), nullable=True),
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
            "inspected_qty >= 0",
            name="ck_quality_inspections_inspected_qty_non_negative",
        ),
        sa.CheckConstraint(
            "passed_qty >= 0",
            name="ck_quality_inspections_passed_qty_non_negative",
        ),
        sa.CheckConstraint(
            "rejected_qty >= 0",
            name="ck_quality_inspections_rejected_qty_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["part_id"],
            ["parts.id"],
            name="fk_quality_inspections_part_id_parts",
        ),
        sa.ForeignKeyConstraint(
            ["machine_id"],
            ["machines.id"],
            name="fk_quality_inspections_machine_id_machines",
        ),
        sa.ForeignKeyConstraint(
            ["production_record_id"],
            ["production_records.id"],
            name="fk_quality_inspections_production_record_id_production_records",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["inspected_by"],
            ["users.id"],
            name="fk_quality_inspections_inspected_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_quality_inspections"),
    )
    op.create_index(
        "ix_quality_inspections_inspection_date",
        "quality_inspections",
        ["inspection_date"],
        unique=False,
    )
    op.create_index(
        "ix_quality_inspections_part_id_inspection_date",
        "quality_inspections",
        ["part_id", "inspection_date"],
        unique=False,
    )
    op.create_index(
        "ix_quality_inspections_inspection_type",
        "quality_inspections",
        ["inspection_type"],
        unique=False,
    )
    op.create_index(
        "ix_quality_inspections_machine_id",
        "quality_inspections",
        ["machine_id"],
        unique=False,
    )
    op.create_index(
        "ix_quality_inspections_production_record_id",
        "quality_inspections",
        ["production_record_id"],
        unique=False,
    )
    op.create_index(
        "ix_quality_inspections_inspected_by",
        "quality_inspections",
        ["inspected_by"],
        unique=False,
    )

    # --- 2. customer_complaints (Customer PPM / complaint counts) ---
    op.create_table(
        "customer_complaints",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("complaint_date", sa.Date(), nullable=False),
        sa.Column("complaint_code", sa.String(length=64), nullable=False),
        # customers master is Migration 014 — free-text until then.
        sa.Column("customer_name", sa.String(length=255), nullable=False),
        sa.Column("part_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Customer-returned/rejected qty for Customer PPM numerator; nullable
        # because open/closed complaint counts do not require qty.
        sa.Column("returned_qty", sa.Numeric(precision=14, scale=4), nullable=True),
        # VARCHAR — open/closed concepts; not PG ENUM; no restrictive CHECK.
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(length=32), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
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
            "returned_qty IS NULL OR returned_qty >= 0",
            name="ck_customer_complaints_returned_qty_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["part_id"],
            ["parts.id"],
            name="fk_customer_complaints_part_id_parts",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name="fk_customer_complaints_created_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_customer_complaints"),
        sa.UniqueConstraint(
            "complaint_code",
            name="uq_customer_complaints_complaint_code",
        ),
    )
    op.create_index(
        "ix_customer_complaints_complaint_date",
        "customer_complaints",
        ["complaint_date"],
        unique=False,
    )
    op.create_index(
        "ix_customer_complaints_status",
        "customer_complaints",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_customer_complaints_part_id_complaint_date",
        "customer_complaints",
        ["part_id", "complaint_date"],
        unique=False,
    )
    op.create_index(
        "ix_customer_complaints_created_by",
        "customer_complaints",
        ["created_by"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_customer_complaints_created_by",
        table_name="customer_complaints",
    )
    op.drop_index(
        "ix_customer_complaints_part_id_complaint_date",
        table_name="customer_complaints",
    )
    op.drop_index("ix_customer_complaints_status", table_name="customer_complaints")
    op.drop_index(
        "ix_customer_complaints_complaint_date",
        table_name="customer_complaints",
    )
    op.drop_table("customer_complaints")

    op.drop_index(
        "ix_quality_inspections_inspected_by",
        table_name="quality_inspections",
    )
    op.drop_index(
        "ix_quality_inspections_production_record_id",
        table_name="quality_inspections",
    )
    op.drop_index(
        "ix_quality_inspections_machine_id",
        table_name="quality_inspections",
    )
    op.drop_index(
        "ix_quality_inspections_inspection_type",
        table_name="quality_inspections",
    )
    op.drop_index(
        "ix_quality_inspections_part_id_inspection_date",
        table_name="quality_inspections",
    )
    op.drop_index(
        "ix_quality_inspections_inspection_date",
        table_name="quality_inspections",
    )
    op.drop_table("quality_inspections")
