"""Loading press feeds into raw: idempotency, partial failure, run bookkeeping."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date

import httpx
import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.sources import statements
from tests.fixtures.statements import EXPECTED, JEFFRIES, SANDERS, SLOTKIN, TARGETS, feed_client

pytestmark = pytest.mark.integration

SINCE = date(2025, 1, 3)
BIOGUIDES = [t.bioguide_id for t in TARGETS]


def _count(engine: Engine, bioguide_id: str) -> int:
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT count(*) FROM raw.statement WHERE bioguide_id = :b"), {"b": bioguide_id}
        ).scalar_one()


def _last_run(engine: Engine) -> tuple[str, int | None, str | None]:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT status, rows_loaded, error FROM meta.ingest_run "
                "WHERE source = :s ORDER BY id DESC LIMIT 1"
            ),
            {"s": statements.SOURCE},
        ).one()
        return row[0], row[1], row[2]


@pytest.fixture
def clean(migrated_engine: Engine) -> Iterator[None]:
    with migrated_engine.connect() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()

    def wipe() -> None:
        with migrated_engine.begin() as conn:
            conn.execute(
                text("DELETE FROM raw.statement WHERE bioguide_id = ANY(:ids)"), {"ids": BIOGUIDES}
            )

    wipe()
    try:
        yield
    finally:
        wipe()
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})


def test_load_stores_every_item_and_is_idempotent(migrated_engine: Engine, clean: None) -> None:
    with connect() as conn:
        rows = statements.load(conn, feed_client(), TARGETS, SINCE)
    assert rows == sum(EXPECTED.values())
    for bioguide_id, expected in EXPECTED.items():
        assert _count(migrated_engine, bioguide_id) == expected
    assert _last_run(migrated_engine)[:2] == ("success", rows)

    # Second night: the same feeds, nothing duplicated, one request per feed.
    client = feed_client()
    with connect() as conn:
        statements.load(conn, client, TARGETS, SINCE)
    assert client.requests_made == len(TARGETS)  # page 1 holds stored items: nothing older is new
    for bioguide_id, expected in EXPECTED.items():
        assert _count(migrated_engine, bioguide_id) == expected


def test_payload_keeps_the_parsed_item(migrated_engine: Engine, clean: None) -> None:
    with connect() as conn:
        statements.load(conn, feed_client(), [SANDERS], SINCE)
    with migrated_engine.connect() as conn:
        payload, source_url = conn.execute(
            text(
                "SELECT payload, source_url FROM raw.statement WHERE bioguide_id = :b "
                "ORDER BY (payload ->> 'pub_date') LIMIT 1"
            ),
            {"b": SANDERS.bioguide_id},
        ).one()
    assert source_url == SANDERS.feed_url
    assert set(payload) == {
        "title",
        "link",
        "guid",
        "pub_date",
        "creator",
        "categories",
        "description",
        "content_html",
    }
    assert payload["content_html"]


def test_one_dead_feed_is_skipped_and_the_rest_load(migrated_engine: Engine, clean: None) -> None:
    pages = {SANDERS.feed_url: "sanders_page1.xml"}  # Slotkin and Jeffries answer 404
    with connect() as conn:
        rows = statements.load(conn, feed_client(pages), [SANDERS, SLOTKIN, JEFFRIES], SINCE)
    assert rows == EXPECTED[SANDERS.bioguide_id]
    assert _count(migrated_engine, SLOTKIN.bioguide_id) == 0
    assert _last_run(migrated_engine)[0] == "success"


def test_every_feed_failing_fails_the_run(migrated_engine: Engine, clean: None) -> None:
    with connect() as conn, pytest.raises(RuntimeError, match="every statement feed failed"):
        statements.load(conn, feed_client({}), [SANDERS, SLOTKIN], SINCE)
    status, _, error = _last_run(migrated_engine)
    assert status == "failed" and "every statement feed failed" in (error or "")


def test_a_failure_part_way_through_a_feed_writes_none_of_it(
    migrated_engine: Engine, clean: None
) -> None:
    calls = {"n": 0}
    base = feed_client()

    def flaky(url: str) -> str:
        calls["n"] += 1
        if url.endswith("paged=2"):
            request = httpx.Request("GET", url)
            raise httpx.HTTPStatusError(
                "503", request=request, response=httpx.Response(503, request=request)
            )
        return base.get_text(url)

    client = statements.FeedClient(fetch=flaky, limiter=statements.RateLimiter(10_000, 1.0))
    # Every fixture item is newer than SINCE and none is stored, so each walk asks for page 2,
    # which fails. A feed is written only after its whole walk succeeds, so neither feed's
    # page 1 may reach raw; with both skipped the run fails.
    with connect() as conn, pytest.raises(RuntimeError):
        statements.load(conn, client, [SLOTKIN, SANDERS], SINCE)
    assert _count(migrated_engine, SLOTKIN.bioguide_id) == 0
    assert _count(migrated_engine, SANDERS.bioguide_id) == 0
