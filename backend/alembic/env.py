"""Alembic environment — uses ``settings.database_url`` from app config."""

from logging.config import fileConfig
import logging

from alembic import context
from sqlalchemy import create_engine, pool, text

from app.core.config import settings
from app.db.base import Base

# Import model modules so Alembic target_metadata includes mapped tables.
import app.models  # noqa: F401  # Migrations 002–014: masters + production + ingestion + KPI + security + audit/alerts/actions + maintenance + PPC + quality + SCM/logistics thin

config = context.config
logger = logging.getLogger("alembic.env")

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Always drive migrations from app Settings (not a stale/blank alembic.ini URL).
# set_main_option keeps offline SQL generation and Alembic CLI URL display in sync.
config.set_main_option("sqlalchemy.url", settings.database_url)


def _log_target_database(connection) -> None:
    """Print the live connection fingerprint so wrong-DB mistakes are obvious."""
    row = connection.execute(
        text(
            "SELECT current_database(), current_user, current_schema(), "
            "inet_server_addr()::text, inet_server_port(), "
            "substring(version() from 1 for 60)"
        )
    ).one()
    logger.info(
        "Alembic target: db=%s user=%s schema=%s server=%s:%s version=%s "
        "(settings host=%s port=%s)",
        row[0],
        row[1],
        row[2],
        row[3],
        row[4],
        row[5],
        settings.postgres_host,
        settings.postgres_port,
    )


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (SQL script generation)."""
    url = settings.database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (live database connection)."""
    # Use Settings URL directly — do not rely on engine_from_config / ini parsing.
    # Use engine.begin() (SQLAlchemy 2) so the migration transaction is actually
    # committed. connect() + context.begin_transaction() was reporting "Running
    # upgrade -> 001" then rolling back on connection close (empty Docker DB).
    connectable = create_engine(settings.database_url, poolclass=pool.NullPool)

    with connectable.begin() as connection:
        _log_target_database(connection)
        context.configure(connection=connection, target_metadata=target_metadata)
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
