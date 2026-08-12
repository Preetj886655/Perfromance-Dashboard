"""SQLAlchemy DeclarativeBase for ORM models (Stage B)."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared metadata root for all mapped tables."""
