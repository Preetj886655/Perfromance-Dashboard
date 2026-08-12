"""014_scm_logistics_thin — materials, inventory_snapshots, grn_records,
customers, dispatch_records.

Stage A Migration 014. Depends on 013 (and transitively plants from 002;
parts from 004 already present).

Schema only — thin SCM / logistics stubs for DOCX GRN, FG stock / reorder,
Delivery Accuracy, and customer master. No MRP, BOM, work orders, routing,
supplier master, purchasing engine, inventory ledger/movements, warehouse WMS,
procurement/logistics APIs, frontend, workers, KPI engines, or seeds.

No PostgreSQL ENUMs — status/unit are VARCHAR. No retroactive FK from
customer_complaints.customer_name → customers (013 unchanged).
Snapshots only — no stock movement / transaction tables.

Revision ID: 014
Revises: 013
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. materials (thin SCM material / SKU master) ---
    op.create_table(
        "materials",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        # Unit of measure label — VARCHAR not PG ENUM.
        sa.Column("unit", sa.String(length=32), nullable=True),
        # Q11 TBC — optional plant scope on thin stub.
        sa.Column("plant_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            ["plant_id"],
            ["plants.id"],
            name="fk_materials_plant_id_plants",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_materials"),
        sa.UniqueConstraint("code", name="uq_materials_code"),
    )
    op.create_index("ix_materials_plant_id", "materials", ["plant_id"], unique=False)
    op.create_index("ix_materials_is_active", "materials", ["is_active"], unique=False)

    # --- 2. customers (thin customer master; do not alter 013 complaints) ---
    op.create_table(
        "customers",
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
        sa.PrimaryKeyConstraint("id", name="pk_customers"),
        sa.UniqueConstraint("code", name="uq_customers_code"),
    )
    op.create_index("ix_customers_is_active", "customers", ["is_active"], unique=False)

    # --- 3. inventory_snapshots (point-in-time stock; not a ledger) ---
    op.create_table(
        "inventory_snapshots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        # Daily FG / stores snapshot grain (DOCX LATEST snapshot).
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("material_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("quantity_on_hand", sa.Numeric(precision=14, scale=4), nullable=False),
        # Optional reorder threshold for stock-below-minimum alerts later.
        sa.Column("reorder_point", sa.Numeric(precision=14, scale=4), nullable=True),
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
            "quantity_on_hand >= 0",
            name="ck_inventory_snapshots_quantity_on_hand_non_negative",
        ),
        sa.CheckConstraint(
            "reorder_point IS NULL OR reorder_point >= 0",
            name="ck_inventory_snapshots_reorder_point_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["material_id"],
            ["materials.id"],
            name="fk_inventory_snapshots_material_id_materials",
        ),
        sa.ForeignKeyConstraint(
            ["plant_id"],
            ["plants.id"],
            name="fk_inventory_snapshots_plant_id_plants",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_inventory_snapshots"),
    )
    op.create_index(
        "ix_inventory_snapshots_snapshot_date",
        "inventory_snapshots",
        ["snapshot_date"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_snapshots_material_id_snapshot_date",
        "inventory_snapshots",
        ["material_id", "snapshot_date"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_snapshots_plant_id",
        "inventory_snapshots",
        ["plant_id"],
        unique=False,
    )

    # --- 4. grn_records (thin goods receipt; free-text supplier) ---
    op.create_table(
        "grn_records",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("grn_date", sa.Date(), nullable=False),
        # Document identity — unique like ticket_code / complaint_code.
        sa.Column("grn_number", sa.String(length=64), nullable=False),
        sa.Column("material_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity_received", sa.Numeric(precision=14, scale=4), nullable=False),
        # No supplier master in Stage A — free-text only.
        sa.Column("supplier_name", sa.String(length=255), nullable=True),
        sa.Column("plant_id", postgresql.UUID(as_uuid=True), nullable=True),
        # VARCHAR — not PG ENUM.
        sa.Column("status", sa.String(length=32), nullable=True),
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
            "quantity_received >= 0",
            name="ck_grn_records_quantity_received_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["material_id"],
            ["materials.id"],
            name="fk_grn_records_material_id_materials",
        ),
        sa.ForeignKeyConstraint(
            ["plant_id"],
            ["plants.id"],
            name="fk_grn_records_plant_id_plants",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_grn_records"),
        sa.UniqueConstraint("grn_number", name="uq_grn_records_grn_number"),
    )
    op.create_index("ix_grn_records_grn_date", "grn_records", ["grn_date"], unique=False)
    op.create_index(
        "ix_grn_records_material_id_grn_date",
        "grn_records",
        ["material_id", "grn_date"],
        unique=False,
    )
    op.create_index("ix_grn_records_plant_id", "grn_records", ["plant_id"], unique=False)
    op.create_index("ix_grn_records_status", "grn_records", ["status"], unique=False)

    # --- 5. dispatch_records (thin logistics for Delivery Accuracy) ---
    op.create_table(
        "dispatch_records",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("dispatch_date", sa.Date(), nullable=True),
        sa.Column("planned_dispatch_date", sa.Date(), nullable=True),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("part_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("planned_qty", sa.Numeric(precision=14, scale=4), nullable=True),
        sa.Column("dispatched_qty", sa.Numeric(precision=14, scale=4), nullable=True),
        # VARCHAR — not PG ENUM.
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("plant_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            "planned_qty IS NULL OR planned_qty >= 0",
            name="ck_dispatch_records_planned_qty_non_negative",
        ),
        sa.CheckConstraint(
            "dispatched_qty IS NULL OR dispatched_qty >= 0",
            name="ck_dispatch_records_dispatched_qty_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name="fk_dispatch_records_customer_id_customers",
        ),
        sa.ForeignKeyConstraint(
            ["part_id"],
            ["parts.id"],
            name="fk_dispatch_records_part_id_parts",
        ),
        sa.ForeignKeyConstraint(
            ["plant_id"],
            ["plants.id"],
            name="fk_dispatch_records_plant_id_plants",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_dispatch_records"),
    )
    op.create_index(
        "ix_dispatch_records_dispatch_date",
        "dispatch_records",
        ["dispatch_date"],
        unique=False,
    )
    op.create_index(
        "ix_dispatch_records_planned_dispatch_date",
        "dispatch_records",
        ["planned_dispatch_date"],
        unique=False,
    )
    op.create_index(
        "ix_dispatch_records_customer_id",
        "dispatch_records",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        "ix_dispatch_records_part_id_planned_dispatch_date",
        "dispatch_records",
        ["part_id", "planned_dispatch_date"],
        unique=False,
    )
    op.create_index(
        "ix_dispatch_records_status",
        "dispatch_records",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_dispatch_records_plant_id",
        "dispatch_records",
        ["plant_id"],
        unique=False,
    )


def downgrade() -> None:
    # Drop in FK-safe order: dispatch → grn → inventory → customers → materials
    op.drop_index("ix_dispatch_records_plant_id", table_name="dispatch_records")
    op.drop_index("ix_dispatch_records_status", table_name="dispatch_records")
    op.drop_index(
        "ix_dispatch_records_part_id_planned_dispatch_date",
        table_name="dispatch_records",
    )
    op.drop_index("ix_dispatch_records_customer_id", table_name="dispatch_records")
    op.drop_index(
        "ix_dispatch_records_planned_dispatch_date",
        table_name="dispatch_records",
    )
    op.drop_index("ix_dispatch_records_dispatch_date", table_name="dispatch_records")
    op.drop_table("dispatch_records")

    op.drop_index("ix_grn_records_status", table_name="grn_records")
    op.drop_index("ix_grn_records_plant_id", table_name="grn_records")
    op.drop_index("ix_grn_records_material_id_grn_date", table_name="grn_records")
    op.drop_index("ix_grn_records_grn_date", table_name="grn_records")
    op.drop_table("grn_records")

    op.drop_index("ix_inventory_snapshots_plant_id", table_name="inventory_snapshots")
    op.drop_index(
        "ix_inventory_snapshots_material_id_snapshot_date",
        table_name="inventory_snapshots",
    )
    op.drop_index(
        "ix_inventory_snapshots_snapshot_date",
        table_name="inventory_snapshots",
    )
    op.drop_table("inventory_snapshots")

    op.drop_index("ix_customers_is_active", table_name="customers")
    op.drop_table("customers")

    op.drop_index("ix_materials_is_active", table_name="materials")
    op.drop_index("ix_materials_plant_id", table_name="materials")
    op.drop_table("materials")
