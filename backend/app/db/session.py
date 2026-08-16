"""Database engine and session helpers.

Phase 1 health check uses ``check_database_connection`` only.
Session factory is available for Stage B ORM usage without changing health behaviour.
"""

from collections.abc import Generator

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models.rejection_reason import RejectionReason
from app.services.event_queue import clear_pending_events, emit_pending_events

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None
_REFERENCE_SEEDS_INITIALIZED = False


def _seed_reference_catalogs() -> None:
    """Ensure the canonical DPR/OEE reason catalogs exist in the database.

    These lookup tables are part of the base data model and are required by the
    ingestion workflow. Seeding them lazily here keeps the application and test
    database consistent without altering the existing Excel import logic.
    """
    global _REFERENCE_SEEDS_INITIALIZED
    if _REFERENCE_SEEDS_INITIALIZED:
        return

    engine = get_engine()
    inspector = inspect(engine)
    if not inspector.has_table("rejection_reasons"):
        _REFERENCE_SEEDS_INITIALIZED = True
        return

    session = get_session_factory()()
    try:
        rejection_rows = [
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
        ]
        for code, label, sort_order, excel_column in rejection_rows:
            row = session.scalar(select(RejectionReason).where(RejectionReason.code == code))
            if row is None:
                session.add(
                    RejectionReason(
                        code=code,
                        label=label,
                        is_active=True,
                        sort_order=sort_order,
                        excel_column=excel_column,
                    )
                )

        session.commit()
        _REFERENCE_SEEDS_INITIALIZED = True
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_engine() -> Engine:
    """Return a process-wide engine (created lazily)."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 3},
        )
        _seed_reference_catalogs()
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    """Return a process-wide sessionmaker bound to ``get_engine()``."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=get_engine(),
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yield a DB session; commit on success, rollback on error.

    Route handlers and services must not nest commits that break this contract.
    Services (e.g. ``ingest_dpr_oee_workbook``) flush only — the API owns commit.

    After successful commit, emits any pending SSE events queued during request.
    On rollback, clears pending events (transaction-safe guarantee).
    """
    session = get_session_factory()()
    try:
        yield session
        session.commit()
        # Emit SSE events only after commit succeeds (transaction-safe)
        emit_pending_events(session)
    except Exception:
        # Clear any queued events on rollback (don't emit for rolled-back changes)
        clear_pending_events(session)
        session.rollback()
        raise
    finally:
        session.close()


def check_database_connection() -> bool:
    """Return True if PostgreSQL accepts a simple SELECT 1."""
    engine = get_engine()
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True
