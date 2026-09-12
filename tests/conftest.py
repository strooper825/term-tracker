"""Shared fixtures.

Three kinds of tests live here:

* Unit tests that never touch a database (the API's session dependency is overridden).
* ``integration`` tests that need Postgres at ``DATABASE_URL``. They apply the Alembic
  migrations first. Locally they are skipped when the database is unreachable; in CI
  (``CI`` env var set) an unreachable database is a failure, never a silent skip.
* ``dbt`` tests that additionally need the dbt CLI on PATH; ``built_mart`` loads every
  source's fixtures into raw and runs ``dbt build`` once per session.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from api.db import get_engine
from api.main import app
from ingest.db import connect
from ingest.sources import congress_gov, legislators
from tests.fixtures.congress_gov import CONGRESS, TRACKED, fixture_client
from tests.fixtures.legislators import fixture_fetch as legislators_fixture_fetch

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


def _dbt_env(database_url: str) -> dict[str, str]:
    url = make_url(database_url)
    return {
        **os.environ,
        "PGHOST": url.host or "localhost",
        "PGPORT": str(url.port or 5432),
        "PGUSER": url.username or "",
        "PGPASSWORD": url.password or "",
        "PGDATABASE": url.database or "",
    }


@pytest.fixture(scope="session")
def built_mart(migrated_engine: Engine) -> None:
    """Load every fixture source into raw, then ``dbt build`` (seeds, models, tests)."""
    dbt = shutil.which("dbt")
    if dbt is None:
        if os.environ.get("CI"):
            pytest.fail("dbt CLI not on PATH in CI")
        pytest.skip("dbt CLI not on PATH")

    with connect() as conn:
        legislators.load(conn, fetch=legislators_fixture_fetch)
        congress_gov.load(conn, fixture_client(), TRACKED, CONGRESS, full_refresh=True)

    result = subprocess.run(
        [dbt, "build", "--project-dir", str(ROOT / "dbt"), "--profiles-dir", str(ROOT / "dbt")],
        env=_dbt_env(migrated_engine.url.render_as_string(hide_password=False)),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"dbt build failed:\n{result.stdout}\n{result.stderr}"
