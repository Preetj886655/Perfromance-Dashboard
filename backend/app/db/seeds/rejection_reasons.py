"""Seed Excel rejection reason catalog (A–J) — separate from Alembic migrations.

Canonical Excel DPR_OEE codes (CONFIRMED). Does not invent extra reasons.
Does not seed downtime reasons, parts, machines, or production data.

Idempotent: ``ON CONFLICT (code) DO NOTHING`` — safe to re-run.

Usage (from ``backend/`` with venv active)::

    python -m app.db.seeds.rejection_reasons

Uses ``settings.database_url`` (Compose host port 5433 by default).
"""

from __future__ import annotations

import sys

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.db.session import get_engine, get_session_factory
from app.models.rejection_reason import RejectionReason

# Exact Excel A–J mapping (code, label, sort_order, excel_column AH–AQ).
EXCEL_REJECTION_REASONS: tuple[tuple[str, str, int, str], ...] = (
    ("A", "Short Moulding", 1, "AH"),
    ("B", "Shrinkage Mark", 2, "AI"),
    ("C", "Silver Streak", 3, "AJ"),
    ("D", "Flow Mark", 4, "AK"),
    ("E", "Weld Line", 5, "AL"),
    ("F", "Dent Mark", 6, "AM"),
    ("G", "Power Cut", 7, "AN"),
    ("H", "Black Marks", 8, "AO"),
    ("I", "Crack Marks", 9, "AP"),
    ("J", "Others", 10, "AQ"),
)


def seed_rejection_reasons() -> dict[str, int]:
    """Insert missing A–J rows; skip existing codes. Returns insert/skip/total counts.

    Uses ``ON CONFLICT (code) DO NOTHING`` so re-runs never duplicate rows.
    Insert/skip counts are derived from before/after totals (psycopg may report
    ``rowcount=-1`` for multi-row ON CONFLICT).
    """
    rows = [
        {
            "code": code,
            "label": label,
            "is_active": True,
            "sort_order": sort_order,
            "excel_column": excel_column,
        }
        for code, label, sort_order, excel_column in EXCEL_REJECTION_REASONS
    ]

    session_factory = get_session_factory()
    with session_factory() as session:
        before = int(
            session.scalar(select(func.count()).select_from(RejectionReason)) or 0
        )
        stmt = (
            insert(RejectionReason)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["code"])
        )
        session.execute(stmt)
        session.commit()
        after = int(
            session.scalar(select(func.count()).select_from(RejectionReason)) or 0
        )

    inserted = max(0, after - before)
    skipped = max(0, len(rows) - inserted)
    return {"inserted": inserted, "skipped": skipped, "total": after}


def _verify_and_print() -> None:
    session_factory = get_session_factory()
    with session_factory() as session:
        rows = session.execute(
            select(
                RejectionReason.code,
                RejectionReason.label,
                RejectionReason.sort_order,
                RejectionReason.excel_column,
            ).order_by(RejectionReason.sort_order, RejectionReason.code)
        ).all()

    print(f"rejection_reasons rows: {len(rows)}")
    for code, label, sort_order, excel_column in rows:
        print(f"  {code}  {label}  sort={sort_order}  excel={excel_column}")


def main() -> int:
    print(
        f"Seed target: {settings.postgres_host}:{settings.postgres_port}/"
        f"{settings.postgres_db}"
    )
    with get_engine().connect() as conn:
        row = conn.execute(
            text(
                "SELECT current_database(), inet_server_port(), "
                "(SELECT version_num FROM alembic_version LIMIT 1)"
            )
        ).one()
        print(f"Connected: db={row[0]} server_port={row[1]} alembic={row[2]}")

    stats = seed_rejection_reasons()
    print(
        f"Seed result: inserted={stats['inserted']} "
        f"skipped={stats['skipped']} total={stats['total']}"
    )
    _verify_and_print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
