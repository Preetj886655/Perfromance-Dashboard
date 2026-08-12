"""Database engine and session helpers.

Phase 1 health check uses ``check_database_connection`` only.
Session factory is available for Stage B ORM usage without changing health behaviour.
"""

from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    """Return a process-wide engine (created lazily)."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 3},
        )
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
    """
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
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
