"""Loading vote fixtures into raw: only-new fetching, change detection, full refresh."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.sources import house_votes, senate_votes
from tests.fixtures.votes import CONGRESS, house_client, senate_client

pytestmark = pytest.mark.integration

HOUSE_LIST_PAGES = 4  # session 1: two pages, session 2: one, session 3: empty
HOUSE_ROLL_CALLS = 5
SENATE_MENUS = 3  # sessions 1 and 2, then the 404 for session 3
SENATE_ROLL_CALLS = 3


def _count(engine: Engine, table: str) -> int:
    with engine.connect() as conn:
        return conn.execute(text(f"SELECT count(*) FROM raw.{table}")).scalar_one()


@pytest.fixture
def clean_runs(migrated_engine: Engine) -> Iterator[None]:
    with migrated_engine.connect() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()
    try:
        yield
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})


def test_house_votes_fetch_only_changed_member_lists(
    migrated_engine: Engine, clean_runs: None
) -> None:
    client = house_client()
    with connect() as conn:
        house_votes.load(conn, client, CONGRESS, full_refresh=True)
    assert client.requests_made == HOUSE_LIST_PAGES + HOUSE_ROLL_CALLS
    assert _count(migrated_engine, "house_vote") >= HOUSE_ROLL_CALLS
    assert _count(migrated_engine, "house_vote_members") >= HOUSE_ROLL_CALLS

    client = house_client()
    with connect() as conn:
        house_votes.load(conn, client, CONGRESS)
    assert client.requests_made == HOUSE_LIST_PAGES  # every updateDate unchanged

    with migrated_engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE raw.house_vote_members SET payload = payload || :patch "
                "WHERE congress = 119 AND session = 1 AND roll_number = 240"
            ),
            {"patch": '{"updateDate": "2000-01-01T00:00:00-05:00"}'},
        )
    client = house_client()
    with connect() as conn:
        house_votes.load(conn, client, CONGRESS)
    assert client.requests_made == HOUSE_LIST_PAGES + 1

    with migrated_engine.connect() as conn:
        speaker = conn.execute(
            text(
                "SELECT x ->> 'voteCast' FROM raw.house_vote_members, "
                "jsonb_array_elements(payload -> 'results') AS x "
                "WHERE session = 1 AND roll_number = 2 AND x ->> 'bioguideID' = 'S001213'"
            )
        ).scalar_one()
    assert speaker == "Johnson (LA)"


def test_senate_votes_fetch_only_new_roll_calls(migrated_engine: Engine, clean_runs: None) -> None:
    client = senate_client()
    with connect() as conn:
        senate_votes.load(conn, client, CONGRESS, full_refresh=True)
    assert client.requests_made == SENATE_MENUS + SENATE_ROLL_CALLS
    assert _count(migrated_engine, "senate_vote_menu") >= 2
    assert _count(migrated_engine, "senate_vote") >= SENATE_ROLL_CALLS

    client = senate_client()
    with connect() as conn:
        senate_votes.load(conn, client, CONGRESS)
    assert client.requests_made == SENATE_MENUS  # nothing new listed

    with migrated_engine.connect() as conn:
        members = conn.execute(
            text(
                "SELECT jsonb_array_length(payload -> 'members' -> 'member') "
                "FROM raw.senate_vote WHERE congress = 119 AND session = 1 AND vote_number = 1"
            )
        ).scalar_one()
        statuses = (
            conn.execute(
                text(
                    "SELECT status FROM meta.ingest_run WHERE source = :s ORDER BY id DESC LIMIT 2"
                ),
                {"s": senate_votes.SOURCE},
            )
            .scalars()
            .all()
        )
    assert members >= 1
    assert statuses == ["success", "success"]
