"""Shared fixtures.

Two kinds of tests live here:

* Unit tests that never touch a database (the API's session dependency is overridden).
* ``integration`` tests that need Postgres at ``DATABASE_URL``. They apply the Alembic
  migrations first. Locally they are skipped when the database is unreachable; in CI
  (``CI`` env var set) an unreachable database is a failure, never a silent skip.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.exc import OperationalError

from api.db import get_engine
from api.main import app

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def migrated_engine() -> Engine:
    """Engine bound to DATABASE_URL with migrations applied, or skip/fail if unreachable."""
    engine = get_engine()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except OperationalError as exc:
        message = f"Postgres not reachable at DATABASE_URL: {exc.orig}"
        if os.environ.get("CI"):
            pytest.fail(message)
        pytest.skip(message)

    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    return engine
