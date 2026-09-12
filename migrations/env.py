"""Alembic environment.

The database URL comes from ``DATABASE_URL`` (environment or ``.env``) through
``api.config.Settings`` so the API, the migrations, and the tests all agree on one setting.
"""

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make `api` importable when alembic runs from a checkout that is not pip-installed.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.config import get_settings  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ConfigParser treats "%" as an interpolation marker; escape it in case the URL carries one.
config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))

# Phase 0 migrations are hand-written. Point this at SQLAlchemy metadata once ORM models exist
# so that `alembic revision --autogenerate` can be used.
target_metadata = None


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live connection (``alembic upgrade head --sql``)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
