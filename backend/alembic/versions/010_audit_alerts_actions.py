"""010_audit_alerts_actions — audit_logs, alert_rules, alerts, actions, action_links.

Stage A Migration 010. Depends on 009 (users) and transitively KPI / departments.

Schema only — no alert engines, workers, email, CAPA workflow, frontend, auth,
or seed rules/alerts/actions/users.

No PostgreSQL ENUMs for status/severity/module. action_links use soft
source_module + source_entity_id (no polymorphic FKs to business tables).
audit_logs.user_id ON DELETE SET NULL preserves history when a user is deleted.
audit timestamp column is ``at`` per Stage A Step 13 / Step 19.

Revision ID: 010
Revises: 009
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ACTION_STATUS_CHECK = (
    "status IN ("
    "'Open', 'In Progress', 'On Hold', 'Completed', 'Verified', 'Closed'"
    ")"
)


def upgrade() -> None:
    # --- 1. audit_logs (immutable trail; soft entity refs; no business FKs) ---
    op.create_table(
        "audit_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        # SET NULL: keep audit row if actor user is deleted (prefer over RESTRICT).
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field", sa.String(length=128), nullable=False),
        sa.Column(
            "old_value",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "new_value",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        # Stage A column name ``at`` (not created_at).
        sa.Column(
            "at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_audit_logs_user_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_logs"),
    )
    op.create_index(
        "ix_audit_logs_entity_type_entity_id_at",
        "audit_logs",
        ["entity_type", "entity_id", "at"],
        unique=False,
        postgresql_ops={"at": "DESC"},
    )
    op.create_index(
        "ix_audit_logs_user_id_at",
        "audit_logs",
        ["user_id", "at"],
        unique=False,
        postgresql_ops={"at": "DESC"},
    )

    # --- 2. alert_rules (config only; no seed rules) ---
    op.create_table(
        "alert_rules",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "kpi_definition_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "threshold_config",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        # VARCHAR — not PG ENUM.
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column(
            "condition_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
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
            ["kpi_definition_id"],
            ["kpi_definitions.id"],
            name="fk_alert_rules_kpi_definition_id_kpi_definitions",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_alert_rules"),
        sa.UniqueConstraint("code", name="uq_alert_rules_code"),
    )
    op.create_index(
        "ix_alert_rules_kpi_definition_id",
        "alert_rules",
        ["kpi_definition_id"],
        unique=False,
    )

    # --- 3. alerts (fired instances; no generation / notification logic) ---
    op.create_table(
        "alerts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("alert_rule_id", postgresql.UUID(as_uuid=True), nullable=False),
        # VARCHAR — not PG ENUM.
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("escalated_to", postgresql.UUID(as_uuid=True), nullable=True),
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
            ["alert_rule_id"],
            ["alert_rules.id"],
            name="fk_alerts_alert_rule_id_alert_rules",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["acknowledged_by"],
            ["users.id"],
            name="fk_alerts_acknowledged_by_users",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["escalated_to"],
            ["users.id"],
            name="fk_alerts_escalated_to_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_alerts"),
    )
    op.create_index(
        "ix_alerts_unacknowledged_created_at",
        "alerts",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("acknowledged_at IS NULL"),
    )
    op.create_index("ix_alerts_severity", "alerts", ["severity"], unique=False)
    op.create_index("ix_alerts_created_at", "alerts", ["created_at"], unique=False)
    op.create_index(
        "ix_alerts_alert_rule_id",
        "alerts",
        ["alert_rule_id"],
        unique=False,
    )

    # --- 4. actions (CAPA; no overdue boolean / workflow engine) ---
    op.create_table(
        "actions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("problem", sa.Text(), nullable=False),
        sa.Column("root_cause", sa.Text(), nullable=True),
        sa.Column("corrective", sa.Text(), nullable=True),
        sa.Column("preventive", sa.Text(), nullable=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        # VARCHAR — not PG ENUM.
        sa.Column("priority", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column(
            "evidence",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
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
        sa.CheckConstraint(_ACTION_STATUS_CHECK, name="ck_actions_status"),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name="fk_actions_owner_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name="fk_actions_department_id_departments",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_actions"),
    )
    op.create_index(
        "ix_actions_status_due_date",
        "actions",
        ["status", "due_date"],
        unique=False,
    )
    op.create_index(
        "ix_actions_department_id",
        "actions",
        ["department_id"],
        unique=False,
    )
    op.create_index(
        "ix_actions_owner_id",
        "actions",
        ["owner_id"],
        unique=False,
    )

    # --- 5. action_links (soft source refs; CASCADE with action) ---
    op.create_table(
        "action_links",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("action_id", postgresql.UUID(as_uuid=True), nullable=False),
        # VARCHAR module label — not PG ENUM; no FK to business tables.
        sa.Column("source_module", sa.String(length=64), nullable=False),
        sa.Column(
            "source_entity_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["action_id"],
            ["actions.id"],
            name="fk_action_links_action_id_actions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_action_links"),
        sa.UniqueConstraint(
            "action_id",
            "source_module",
            "source_entity_id",
            name="uq_action_links_action_module_entity",
        ),
    )
    op.create_index(
        "ix_action_links_action_id",
        "action_links",
        ["action_id"],
        unique=False,
    )


def downgrade() -> None:
    # Drop in FK-safe order: action_links → actions → alerts → alert_rules → audit_logs
    op.drop_index("ix_action_links_action_id", table_name="action_links")
    op.drop_table("action_links")

    op.drop_index("ix_actions_owner_id", table_name="actions")
    op.drop_index("ix_actions_department_id", table_name="actions")
    op.drop_index("ix_actions_status_due_date", table_name="actions")
    op.drop_table("actions")

    op.drop_index("ix_alerts_alert_rule_id", table_name="alerts")
    op.drop_index("ix_alerts_created_at", table_name="alerts")
    op.drop_index("ix_alerts_severity", table_name="alerts")
    op.drop_index("ix_alerts_unacknowledged_created_at", table_name="alerts")
    op.drop_table("alerts")

    op.drop_index("ix_alert_rules_kpi_definition_id", table_name="alert_rules")
    op.drop_table("alert_rules")

    op.drop_index("ix_audit_logs_user_id_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_entity_type_entity_id_at", table_name="audit_logs")
    op.drop_table("audit_logs")
