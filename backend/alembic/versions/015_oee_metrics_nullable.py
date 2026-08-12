"""015_oee_metrics_nullable — allow NULL on Excel-blank OEE metric columns.

Aligns production_record_metrics nullability with the approved Excel-faithful
OEE calculator (dpr_oee_v1): IFERROR → blank maps to SQL NULL, never coerced
to zero.

Migration 006 created all metric NUMERICs as NOT NULL. Calculator None
(div-by-zero / Q1 unresolved shift time / missing cavity-cycle) could not
flush. This migration DROPs NOT NULL only on undefined-capable columns.

Protected (remain NOT NULL): production_record_id, total_idle_time_min,
total_rejection_qty, computed_at, formula_version.

All existing CHECK (>= 0) constraints are UNCHANGED — including quality >= 0
and oee >= 0. Negative quality/OEE (rejection > produced) remains a separate
business-rule decision outside this migration.

No formula_key column. No oee_snapshots changes. Migrations 001–014 untouched.

Revision ID: 015
Revises: 014
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Columns that may be Excel blank / calculator None → (name, existing Numeric).
_NULLABLE_METRIC_COLUMNS: tuple[tuple[str, sa.Numeric], ...] = (
    ("shift_time_min", sa.Numeric(12, 4)),
    ("available_time_min", sa.Numeric(12, 4)),
    ("run_time_min", sa.Numeric(12, 4)),
    ("target_qty_per_hr", sa.Numeric(14, 4)),
    ("actual_qty_per_hr", sa.Numeric(14, 4)),
    ("availability", sa.Numeric(12, 8)),
    ("performance", sa.Numeric(12, 8)),
    ("machine_utilisation", sa.Numeric(12, 8)),
    ("rejection_ppm", sa.Numeric(14, 4)),
    ("quality", sa.Numeric(12, 8)),
    ("oee", sa.Numeric(12, 8)),
)


def upgrade() -> None:
    for col, existing_type in _NULLABLE_METRIC_COLUMNS:
        op.alter_column(
            "production_record_metrics",
            col,
            existing_type=existing_type,
            nullable=True,
        )


def downgrade() -> None:
    """Restore NOT NULL only when no NULL values exist.

    Does not coerce NULL → 0. If any affected column still contains NULL,
    raise a clear error so operators can resolve data before downgrading.
    """
    conn = op.get_bind()
    null_counts: list[tuple[str, int]] = []
    for col, _existing_type in _NULLABLE_METRIC_COLUMNS:
        count = conn.execute(
            sa.text(
                f"SELECT COUNT(*) FROM production_record_metrics "
                f"WHERE {col} IS NULL"
            )
        ).scalar_one()
        if count:
            null_counts.append((col, int(count)))

    if null_counts:
        details = ", ".join(f"{c}={n}" for c, n in null_counts)
        raise RuntimeError(
            "Cannot downgrade Migration 015: NULL values exist in "
            f"production_record_metrics columns that would become NOT NULL "
            f"({details}). Resolve or delete those rows before downgrading. "
            "NULL values are not coerced to zero."
        )

    for col, existing_type in _NULLABLE_METRIC_COLUMNS:
        op.alter_column(
            "production_record_metrics",
            col,
            existing_type=existing_type,
            nullable=False,
        )
