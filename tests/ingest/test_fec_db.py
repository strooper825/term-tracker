"""Loading OpenFEC fixtures into raw: idempotency, request budget, run bookkeeping."""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.sources import fec as src
from ingest.sources import legislators
from tests.fixtures.fec import CANDIDATE_IDS, CYCLE, PRINCIPAL, fixture_client
from tests.fixtures.legislators import fixture_fetch as legislators_fixture_fetch

pytestmark = pytest.mark.integration

TRACKED = sorted(PRINCIPAL)
# candidates, committees and totals: one request each, whatever the number of members
REQUESTS = 3


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
        rows = src.load(conn, client, TRACKED, CYCLE, full_refresh=True)
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
        # re-fetched, not duplicated
        assert src.load(conn, client, TRACKED, CYCLE, full_refresh=True) == rows
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


def test_identity_is_read_weekly_and_totals_every_run(
    migrated_engine: Engine, clean_runs: None
) -> None:
    """Candidates and committees are read again only once the stored ones are a week old."""
    with connect() as conn:
        legislators.load(conn, fetch=legislators_fixture_fetch)
    start = datetime(2026, 11, 1, 6, 0, tzinfo=UTC)
    client = fixture_client()
    with connect() as conn:
        src.load(conn, client, TRACKED, CYCLE, full_refresh=True, now=start)
    assert client.requests_made == REQUESTS

    client = fixture_client()
    with connect() as conn:
        rows = src.load(conn, client, TRACKED, CYCLE, now=start + timedelta(days=6))
    assert client.requests_made == 1  # the totals, chosen from the stored committees
    assert rows == len(TRACKED)

    client = fixture_client()
    with connect() as conn:
        src.load(conn, client, TRACKED, CYCLE, now=start + timedelta(days=7))
    assert client.requests_made == REQUESTS


def test_a_link_the_fec_no_longer_reports_is_dropped(
    migrated_engine: Engine, clean_runs: None
) -> None:
    with connect() as conn:
        legislators.load(conn, fetch=legislators_fixture_fetch)
    start = datetime(2026, 11, 1, 6, 0, tzinfo=UTC)
    with connect() as conn:
        src.load(conn, fixture_client(), TRACKED, CYCLE, full_refresh=True, now=start)
    with migrated_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO raw.fec_committee "
                "SELECT 'C00000000', cycle, candidate_id, payload, source_url, fetched_at "
                "FROM raw.fec_committee WHERE cycle = :cycle LIMIT 1"
            ),
            {"cycle": CYCLE},
        )
    with connect() as conn:
        src.load(
            conn, fixture_client(), TRACKED, CYCLE, full_refresh=True, now=start + timedelta(1)
        )
    with migrated_engine.connect() as conn:
        left = conn.execute(
            text("SELECT count(*) FROM raw.fec_committee WHERE committee_id = 'C00000000'")
        ).scalar_one()
    assert left == 0


def test_a_committee_shared_by_two_tracked_members_is_stored_for_both(
    migrated_engine: Engine, clean_runs: None
) -> None:
    """A joint fundraising committee naming two tracked candidates: one row for each."""
    with connect() as conn:
        legislators.load(conn, fetch=legislators_fixture_fetch)
    steil, jeffries = PRINCIPAL["S001213"][0], PRINCIPAL["J000294"][0]
    shared = {
        "committee_id": "C00999999",
        "name": "SHARED VICTORY FUND",
        "designation": "J",
        "candidate_ids": [steil, jeffries],
    }
    client = fixture_client()
    recorded = client._fetch

    def fetch(url: str) -> str:
        body = json.loads(recorded(url))
        if "/committees/" in url and "/candidate/" not in url:
            body["results"].append(shared)
        return json.dumps(body)

    client._fetch = fetch
    try:
        with connect() as conn:
            src.load(conn, client, TRACKED, CYCLE, full_refresh=True)
        with migrated_engine.connect() as conn:
            holders = conn.execute(
                text("SELECT candidate_id FROM raw.fec_committee WHERE committee_id = 'C00999999'")
            ).scalars()
            assert sorted(holders) == sorted([steil, jeffries])
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM raw.fec_committee WHERE committee_id = 'C00999999'"))
