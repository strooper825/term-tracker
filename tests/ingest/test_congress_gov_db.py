"""Loading Congress.gov fixtures into raw: idempotency, change detection, run bookkeeping."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.sources import congress_gov as src
from ingest.sources import house_votes, senate_votes
from tests.fixtures.congress_gov import (
    CONGRESS,
    ROLL_CALL_FIXTURE_BILLS,
    TRACKED,
    fixture_client,
    roll_call_fixtures_cover,
)
from tests.fixtures.votes import house_client, senate_client

pytestmark = pytest.mark.integration

# Fixture inventory: 5 list pages; 10 distinct records from the member lists, of which 7 are
# bills and 3 amendments. Every record gets a detail, an actions and a cosponsors request;
# only the bills also get a summaries one (amendments have no such endpoint).
LIST_PAGES = 5
DISTINCT_BILLS = 10
SUMMARISED_BILLS = 7
MEMBER_LEGISLATION_ROWS = 3 + 2 + 2 + 3
# detail + actions + cosponsors for everything, plus summaries for the bills
FULL_LOAD_REQUESTS = DISTINCT_BILLS * 3 + SUMMARISED_BILLS


def _counts(engine: Engine) -> dict[str, int]:
    with engine.connect() as conn:
        return {
            table: conn.execute(text(f"SELECT count(*) FROM raw.{table}")).scalar_one()
            for table in (
                "member_legislation",
                "bill",
                "bill_actions",
                "bill_cosponsors",
                "bill_summaries",
            )
        }


@pytest.fixture
def clean_runs(migrated_engine: Engine) -> Iterator[None]:
    with migrated_engine.connect() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()
    try:
        yield
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})


def test_full_load_then_incremental_skips_unchanged(
    migrated_engine: Engine, clean_runs: None
) -> None:
    client = fixture_client()
    with connect() as conn:
        rows = src.load(conn, client, TRACKED, CONGRESS, full_refresh=True, roll_call_bills=False)
    assert rows == MEMBER_LEGISLATION_ROWS + FULL_LOAD_REQUESTS
    assert client.requests_made == LIST_PAGES + FULL_LOAD_REQUESTS
    counts = _counts(migrated_engine)
    assert counts["member_legislation"] >= MEMBER_LEGISLATION_ROWS
    assert counts["bill"] >= DISTINCT_BILLS
    assert counts["bill_summaries"] >= SUMMARISED_BILLS

    # Second run: details are re-fetched, the three lists are not (updateDate unchanged, and a
    # stored empty array counts as loaded, so a bill with no summary is not re-asked either).
    client = fixture_client()
    with connect() as conn:
        src.load(conn, client, TRACKED, CONGRESS, roll_call_bills=False)
    assert client.requests_made == LIST_PAGES + DISTINCT_BILLS
    assert _counts(migrated_engine) == counts

    # A changed updateDate on one bill re-reads that bill's three lists and nothing else.
    with migrated_engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE raw.bill SET payload = payload || :patch "
                "WHERE congress = 119 AND bill_type = 'hr' AND bill_number = '5269'"
            ),
            {"patch": '{"updateDate": "2000-01-01T00:00:00Z"}'},
        )
    client = fixture_client()
    with connect() as conn:
        src.load(conn, client, TRACKED, CONGRESS, roll_call_bills=False)
    assert client.requests_made == LIST_PAGES + DISTINCT_BILLS + 3

    # A list that was never stored is fetched on its own, without re-reading the others.
    with migrated_engine.begin() as conn:
        conn.execute(
            text(
                "DELETE FROM raw.bill_summaries "
                "WHERE congress = 119 AND bill_type = 'hr' AND bill_number = '1502'"
            )
        )
    client = fixture_client()
    with connect() as conn:
        src.load(conn, client, TRACKED, CONGRESS, roll_call_bills=False)
    assert client.requests_made == LIST_PAGES + DISTINCT_BILLS + 1

    with migrated_engine.connect() as conn:
        statuses = (
            conn.execute(
                text(
                    "SELECT status FROM meta.ingest_run WHERE source = :s ORDER BY id DESC LIMIT 3"
                ),
                {"s": src.SOURCE},
            )
            .scalars()
            .all()
        )
    assert statuses == ["success", "success", "success"]


def test_member_legislation_rows_are_current_congress_only(
    migrated_engine: Engine, clean_runs: None
) -> None:
    with connect() as conn:
        src.load(conn, fixture_client(), TRACKED, CONGRESS, roll_call_bills=False)
    with migrated_engine.connect() as conn:
        congresses = (
            conn.execute(text("SELECT DISTINCT congress FROM raw.member_legislation"))
            .scalars()
            .all()
        )
        amendment = conn.execute(
            text(
                "SELECT kind, payload ->> 'type' FROM raw.bill "
                "WHERE bill_type = 'hamdt' AND bill_number = '9'"
            )
        ).one()
    assert congresses == [CONGRESS]
    assert tuple(amendment) == ("amendment", "HAMDT")


def test_missing_api_key_is_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from api import config

    monkeypatch.setattr(config, "get_settings", lambda: config.Settings(congress_gov_api_key=None))
    monkeypatch.setattr(src, "get_settings", config.get_settings)
    with pytest.raises(RuntimeError, match="CONGRESS_GOV_API_KEY"):
        src.run()


def test_roll_call_bills_get_a_full_page_of_their_own(
    migrated_engine: Engine, clean_runs: None
) -> None:
    """A bill reaches the mart because a roll call names it, and still gets the actions,
    cosponsors and summaries its detail page needs (they used to be detail-only)."""
    with connect() as conn:
        house_votes.load(conn, house_client(), CONGRESS, full_refresh=True)
        senate_votes.load(conn, senate_client(), CONGRESS, full_refresh=True)
        if not roll_call_fixtures_cover(conn):
            pytest.skip("database holds live roll calls without detail fixtures")
        keys = src.roll_call_legislation_keys(conn, CONGRESS)
    assert {(k.bill_type, k.bill_number) for k in keys} == set(ROLL_CALL_FIXTURE_BILLS)
    assert all(k.kind == "bill" for k in keys)  # nominations (PN) are not legislation

    client = fixture_client()
    with connect() as conn:
        src.load(conn, client, TRACKED, CONGRESS, full_refresh=True)
    # member legislation as before, plus detail + actions + cosponsors + summaries for each
    # roll-call bill (all four fixtures are bills, so all four have a summaries endpoint)
    assert client.requests_made == (
        LIST_PAGES + FULL_LOAD_REQUESTS + len(ROLL_CALL_FIXTURE_BILLS) * 4
    )
    with migrated_engine.connect() as conn:
        for bill_type, number in ROLL_CALL_FIXTURE_BILLS:
            title = conn.execute(
                text(
                    "SELECT payload ->> 'title' FROM raw.bill "
                    "WHERE congress = 119 AND bill_type = :t AND bill_number = :n"
                ),
                {"t": bill_type, "n": number},
            ).scalar_one()
            assert title
            for table in ("bill_actions", "bill_cosponsors", "bill_summaries"):
                stored = conn.execute(
                    text(
                        f"SELECT count(*) FROM raw.{table} "
                        "WHERE congress = 119 AND bill_type = :t AND bill_number = :n"
                    ),
                    {"t": bill_type, "n": number},
                ).scalar_one()
                assert stored == 1, (table, bill_type, number)
