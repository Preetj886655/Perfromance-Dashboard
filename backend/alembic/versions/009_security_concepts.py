"""009_security_concepts — users, roles, role_permissions, user_roles.

Stage A Migration 009. Depends on 008 (and transitively 002 plants/departments).

Security schema only — no JWT, OAuth, sessions, login, signup, middleware,
password hashing service, API auth, frontend permissions, RLS, or seeds.

Role / module / action codes are VARCHAR — no PostgreSQL ENUMs.
Intended conceptual role codes (NOT seeded): SUPER_ADMIN, MANAGEMENT,
PLANT_HEAD, DEPT_HEAD, SUPERVISOR, OPERATOR, ENGINEER, VIEWER.

users.plant_id / department_id nullable (Q11 TBC — do not force single plant).
Adds deferred FK: kpi_definitions.owner_role_id → roles.id.
Does NOT add FK for import_jobs.uploaded_by (remains deferred UUID).

Revision ID: 009
Revises: 008
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. roles (create first — referenced by permissions, user_roles, KPIs) ---
    op.create_table(
        "roles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        # VARCHAR business code — not a PostgreSQL ENUM.
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_roles"),
        sa.UniqueConstraint("code", name="uq_roles_code"),
    )

    # --- 2. users (identity; password_hash nullable; no plaintext password) ---
    # plant_id / department_id nullable: Q11 multi-plant TBC; prefer flexibility
    # for admin / multi-plant users until business forces NOT NULL.
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("employee_code", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        # Future auth hash only — never store plaintext passwords.
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("plant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            name="fk_users_plant_id_plants",
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name="fk_users_department_id_departments",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("employee_code", name="uq_users_employee_code"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index(
        "ix_users_plant_id",
        "users",
        ["plant_id"],
        unique=False,
    )
    op.create_index(
        "ix_users_department_id",
        "users",
        ["department_id"],
        unique=False,
    )

    # --- 3. role_permissions (module × action grants; no catalog seed) ---
    op.create_table(
        "role_permissions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        # VARCHAR — not PG ENUM; full permission catalog not invented here.
        sa.Column("module", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column(
            "is_allowed",
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
            ["role_id"],
            ["roles.id"],
            name="fk_role_permissions_role_id_roles",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_role_permissions"),
        sa.UniqueConstraint(
            "role_id",
            "module",
            "action",
            name="uq_role_permissions_role_module_action",
        ),
    )
    op.create_index(
        "ix_role_permissions_role_id",
        "role_permissions",
        ["role_id"],
        unique=False,
    )

    # --- 4. user_roles (M:N; no created_by — Stage A does not require it) ---
    op.create_table(
        "user_roles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_user_roles_user_id_users",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            name="fk_user_roles_role_id_roles",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_roles"),
        sa.UniqueConstraint(
            "user_id",
            "role_id",
            name="uq_user_roles_user_id_role_id",
        ),
    )
    op.create_index(
        "ix_user_roles_user_id",
        "user_roles",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_user_roles_role_id",
        "user_roles",
        ["role_id"],
        unique=False,
    )

    # --- 5. Attach deferred FK from Migration 008 ---
    # kpi_definitions.owner_role_id → roles.id (column already exists; FK only).
    op.create_foreign_key(
        "fk_kpi_definitions_owner_role_id_roles",
        "kpi_definitions",
        "roles",
        ["owner_role_id"],
        ["id"],
    )
    op.create_index(
        "ix_kpi_definitions_owner_role_id",
        "kpi_definitions",
        ["owner_role_id"],
        unique=False,
    )


def downgrade() -> None:
    # Restore deferred state for owner_role_id (drop FK only; keep column).
    # Then drop security tables in FK-safe order.
    op.drop_index(
        "ix_kpi_definitions_owner_role_id",
        table_name="kpi_definitions",
    )
    op.drop_constraint(
        "fk_kpi_definitions_owner_role_id_roles",
        "kpi_definitions",
        type_="foreignkey",
    )

    op.drop_index("ix_user_roles_role_id", table_name="user_roles")
    op.drop_index("ix_user_roles_user_id", table_name="user_roles")
    op.drop_table("user_roles")

    op.drop_index("ix_role_permissions_role_id", table_name="role_permissions")
    op.drop_table("role_permissions")

    op.drop_index("ix_users_department_id", table_name="users")
    op.drop_index("ix_users_plant_id", table_name="users")
    op.drop_table("users")

    op.drop_table("roles")
