"""Alembic environment.

The application talks to the database in raw SQL and its ORM models are
skeletons, so there is no useful metadata to autogenerate from. Migrations here
are written by hand; this file only wires up the connection and the schema
search path.
"""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _database_url() -> str:
    """Prefer an explicit override, else the application's sync URL."""
    url = os.environ.get("ALEMBIC_DATABASE_URL") or os.environ.get("SYNC_DATABASE_URL")
    if url:
        return url

    from app.core.config import settings

    if settings.SYNC_DATABASE_URL:
        return settings.SYNC_DATABASE_URL
    if settings.DATABASE_URL:
        # Alembic runs synchronously; strip the async driver if that is all we have.
        return settings.DATABASE_URL.replace("+asyncpg", "")

    raise RuntimeError(
        "No database URL. Set ALEMBIC_DATABASE_URL or SYNC_DATABASE_URL."
    )


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema="caratloop",
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = _database_url()

    connectable = engine_from_config(
        section, prefix="sqlalchemy.", poolclass=pool.NullPool
    )

    with connectable.connect() as connection:
        # The version table lives inside the application schema, which the first
        # migration creates.
        connection.exec_driver_sql("CREATE SCHEMA IF NOT EXISTS caratloop")
        connection.commit()

        context.configure(
            connection=connection,
            target_metadata=None,
            version_table_schema="caratloop",
            include_schemas=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
