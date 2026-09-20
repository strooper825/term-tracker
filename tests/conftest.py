"""Shared fixtures.

Three kinds of tests live here:

* Unit tests that never touch a database (the API's session dependency is overridden).
* ``integration`` tests that need Postgres at ``DATABASE_URL``. They apply the Alembic
  migrations first. Locally they are skipped when the database is unreachable; in CI
  (``CI`` env var set) an unreachable database is a failure, never a silent skip.
* ``dbt`` tests that additionally need the dbt CLI on PATH; ``built_mart`` loads every
  source's fixtures into raw and runs ``dbt build`` once per session. Fixture rows overwrite
  live rows with the same keys, and assertions are scoped to fixture keys so they hold on a
  database that also holds live data.
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
from ingest.sources import (
    census_acs,
    census_geography,
    congress_gov,
    fec,
    house_votes,
    legislators,
    senate_votes,
)
from tests.fixtures.census import (
    ACS_MINIMUMS,
    ACS_YEAR,
    GEOGRAPHY_MINIMUMS,
    FixtureFiles,
    census_client,
)
from tests.fixtures.census import YEAR as CENSUS_YEAR
from tests.fixtures.congress_gov import CONGRESS, TRACKED, fixture_client, roll_call_fixtures_cover
from tests.fixtures.fec import CYCLE as FEC_CYCLE
from tests.fixtures.fec import PRINCIPAL as FEC_TRACKED
from tests.fixtures.fec import fixture_client as fec_fixture_client
from tests.fixtures.legislators import fixture_fetch as legislators_fixture_fetch
from tests.fixtures.votes import house_client, senate_client

ROOT = Path(__file__).resolve().parent.parent


def load_roll_call_fixture_bills(conn) -> None:
    """Upsert the detail fixtures of the bills the vote fixtures reference into raw.bill."""
    from datetime import UTC, datetime

    from psycopg.types.json import Jsonb

    from ingest.congress_gov import LegislationKey
    from ingest.load import upsert
    from tests.fixtures.congress_gov import ROLL_CALL_FIXTURE_BILLS, fixture_client

    client = fixture_client()
    rows = []
    for bill_type, number in ROLL_CALL_FIXTURE_BILLS:
        key = LegislationKey("bill", CONGRESS, bill_type, number)
        detail = congress_gov.fetch_detail(client, key)
        rows.append(
            {
                "congress": CONGRESS,
                "bill_type": bill_type,
                "bill_number": number,
                "kind": "bill",
                "payload": Jsonb(detail),
                "source_url": client.url(key.path),
                "fetched_at": datetime.now(UTC),
            }
        )
    upsert(conn, "raw", "bill", ["congress", "bill_type", "bill_number"], rows)
    conn.commit()


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
    _refuse_live_database(engine)
    return engine


# A fixture load never touches more legislators than this; a live ingest holds about 540.
LIVE_DATABASE_LEGISLATORS = 50


def _refuse_live_database(engine: Engine) -> None:
    """Fail rather than run the integration suite against a database holding a real ingest.

    The suite upserts trimmed fixtures over live rows with the same keys (eight roll calls
    with five or six members instead of a full chamber, ten bills, seven legislators), which
    silently corrupts the live mart: on 2026-09-13 it left four tracked members short of
    positions on exactly those roll calls. Use a scratch database (`term_tracker_test`) or set
    TERM_TRACKER_ALLOW_LIVE_DB=1 to override knowingly.
    """
    if os.environ.get("TERM_TRACKER_ALLOW_LIVE_DB"):
        return
    with engine.connect() as conn:
        legislators = conn.execute(text("SELECT count(*) FROM raw.legislator")).scalar_one()
    if legislators > LIVE_DATABASE_LEGISLATORS:
        pytest.fail(
            f"DATABASE_URL points at a database with {legislators} legislators in raw, which "
            "looks like a live ingest; the fixtures would overwrite live roll calls and bills. "
            "Point DATABASE_URL at a scratch database, or set TERM_TRACKER_ALLOW_LIVE_DB=1."
        )


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
        house_votes.load(conn, house_client(), CONGRESS, full_refresh=True)
        senate_votes.load(conn, senate_client(), CONGRESS, full_refresh=True)
        # Votes first so the bills loader can fetch the bills the fixture roll calls reference.
        # On a database that also holds live roll calls there are no fixtures for them; the
        # roll-call phase is then skipped and the four fixture bills are loaded directly.
        covered = roll_call_fixtures_cover(conn)
        congress_gov.load(
            conn, fixture_client(), TRACKED, CONGRESS, full_refresh=True, roll_call_bills=covered
        )
        if not covered:
            load_roll_call_fixture_bills(conn)
        fec.load(conn, fec_fixture_client(), sorted(FEC_TRACKED), FEC_CYCLE)
        census_geography.load(
            conn, FixtureFiles(), CENSUS_YEAR, full_refresh=True, minimums=GEOGRAPHY_MINIMUMS
        )
        census_acs.load(conn, census_client(), ACS_YEAR, minimums=ACS_MINIMUMS)

    result = subprocess.run(
        [dbt, "build", "--project-dir", str(ROOT / "dbt"), "--profiles-dir", str(ROOT / "dbt")],
        env=_dbt_env(migrated_engine.url.render_as_string(hide_password=False)),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"dbt build failed:\n{result.stdout}\n{result.stderr}"
