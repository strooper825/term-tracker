"""The press-page probe against the database: who is due, and what a refusal keeps."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import Engine, text

from ingest.congress_gov import RateLimiter
from ingest.db import connect
from ingest.sources import press_pages as src
from ingest.sources.press_pages import Page

pytestmark = [pytest.mark.integration, pytest.mark.dbt]

# Not in seed.statement_sources, so the probe is what decides this member's link.
MEMBER = "X000001"
SITE = "https://example.house.gov"
PRESS = f"{SITE}/media/press-releases"
START = datetime(2026, 11, 1, 6, 0, tzinfo=UTC)


@pytest.fixture
def unseeded_member(built_mart: None, migrated_engine: Engine) -> Iterator[None]:
    """A legislator with a website and no hand-checked row (built_mart loaded the seed)."""
    with migrated_engine.begin() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()
        conn.execute(
            text(
                "INSERT INTO raw.legislator (bioguide_id, payload, source_url, fetched_at) "
                "SELECT CAST(:id AS text), jsonb_build_object('terms', jsonb_build_array("
                "jsonb_build_object('type', 'rep', 'url', CAST(:site AS text)))), "
                "source_url, fetched_at FROM raw.legislator LIMIT 1"
            ),
            {"id": MEMBER, "site": SITE},
        )
    try:
        yield
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM raw.legislator WHERE bioguide_id = :id"), {"id": MEMBER})
            conn.execute(text("DELETE FROM raw.press_page WHERE bioguide_id = :id"), {"id": MEMBER})
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})


def _client(pages: dict[str, Page]) -> src.SiteClient:
    return src.SiteClient(
        get=lambda url: pages.get(url, Page(404, url, "")), limiter=RateLimiter(10**6, 60.0)
    )


def _stored(engine: Engine) -> tuple[str, str | None]:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT payload ->> 'outcome', payload ->> 'press_url' FROM raw.press_page "
                "WHERE bioguide_id = :id"
            ),
            {"id": MEMBER},
        ).one()
    return row[0], row[1]


def test_a_member_is_probed_once_then_again_after_a_month(
    unseeded_member: None, migrated_engine: Engine
) -> None:
    found = {PRESS: Page(200, PRESS, "<h1>Press Releases</h1>")}
    # A member with a hand-checked row is never probed, tracked or not.
    ids = [MEMBER, "S001213"]

    client = _client(found)
    with connect() as conn:
        assert src.load(conn, client, ids, now=START) == 1
    assert _stored(migrated_engine) == ("found", PRESS)

    client = _client(found)
    with connect() as conn:
        assert src.load(conn, client, ids, now=START + timedelta(days=29)) == 0
    assert client.requests_made == 0

    client = _client(found)
    with connect() as conn:
        assert src.load(conn, client, ids, now=START + timedelta(days=30)) == 1
    assert client.requests_made == 2  # robots.txt and the first path


def test_a_refusal_keeps_the_page_found_before_and_is_asked_again(
    unseeded_member: None, migrated_engine: Engine
) -> None:
    with connect() as conn:
        src.load(conn, _client({PRESS: Page(200, PRESS, "Press Releases")}), [MEMBER], now=START)

    refusing = {f"{SITE}/robots.txt": Page(403, f"{SITE}/robots.txt", "Access Denied")}
    with connect() as conn:
        src.load(conn, _client(refusing), [MEMBER], full_refresh=True, now=START + timedelta(1))
    assert _stored(migrated_engine) == ("unreachable", PRESS)

    # Unreachable is not a settled answer: the next run asks again without waiting a month.
    client = _client(refusing)
    with connect() as conn:
        assert src.load(conn, client, [MEMBER], now=START + timedelta(2)) == 1
    assert client.requests_made == 1
