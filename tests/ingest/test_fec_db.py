"""Loading OpenFEC fixtures into raw: idempotency, request budget, run bookkeeping."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.sources import fec as src
from ingest.sources import legislators
from tests.fixtures.fec import CANDIDATE_IDS, CYCLE, PRINCIPAL, fixture_client
from tests.fixtures.legislators import fixture_fetch as legislators_fixture_fetch

pytestmark = pytest.mark.integration

TRACKED = sorted(PRINCIPAL)
# one request per candidate id, then committees and totals for each of the six
REQUESTS = len(CANDIDATE_IDS) + 2 * len(TRACKED)


@pytest.fixture
def clean_runs(migrated_engine: Engine) -> Iterator[None]:
    with migrated_engine.connect() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()
    try:
        yield
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})


def _count(engine: Engine, table: str) -> int:
    with engine.connect() as conn:
        return conn.execute(text(f"SELECT count(*) FROM raw.{table}")).scalar_one()


def test_load_is_idempotent_and_keys_every_member(
    migrated_engine: Engine, clean_runs: None
) -> None:
    with connect() as conn:
        legislators.load(conn, fetch=legislators_fixture_fetch)
    client = fixture_client()
    with connect() as conn:
        rows = src.load(conn, client, TRACKED, CYCLE)
    assert client.requests_made == REQUESTS
    # 9 candidates + 8 committees (Cotton's joint fundraising and Kiley's leadership PAC
    # ride along) + 6 totals
    assert rows == len(CANDIDATE_IDS) + 8 + len(TRACKED)
    counts = {
        t: _count(migrated_engine, t)
        for t in ("fec_candidate", "fec_committee", "fec_committee_totals")
    }
    assert counts["fec_candidate"] >= len(CANDIDATE_IDS)
    assert counts["fec_committee_totals"] >= len(TRACKED)

    client = fixture_client()
    with connect() as conn:
        assert src.load(conn, client, TRACKED, CYCLE) == rows  # re-fetched, not duplicated
    assert client.requests_made == REQUESTS
    assert {t: _count(migrated_engine, t) for t in counts} == counts

    with migrated_engine.connect() as conn:
        principal = conn.execute(
            text(
                "SELECT c.candidate_id, c.committee_id FROM raw.fec_committee AS c "
                "JOIN raw.fec_committee_totals AS t USING (committee_id, cycle) "
                "WHERE c.cycle = :cycle AND c.payload ->> 'designation' = 'P'"
            ),
            {"cycle": CYCLE},
        ).all()
        run = conn.execute(
            text(
                "SELECT status, rows_loaded, source_url FROM meta.ingest_run "
                "WHERE source = 'fec' ORDER BY id DESC LIMIT 1"
            )
        ).one()
    assert {(c, k) for c, k in principal} >= set(PRINCIPAL.values())
    assert run.status == "success" and run.rows_loaded == rows
    assert run.source_url == src.BASE_URL
