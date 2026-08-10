"""Database session helpers (connection check only in Phase 1 — no schema)."""

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.core.config import settings


def get_engine() -> Engine:
    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 3},
    )


def check_database_connection() -> bool:
    """Return True if PostgreSQL accepts a simple SELECT 1."""
    engine = get_engine()
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True
