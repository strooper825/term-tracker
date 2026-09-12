"""Loading Congress.gov fixtures into raw: idempotency, change detection, run bookkeeping."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.sources import congress_gov as src
from tests.fixtures.congress_gov import CONGRESS, TRACKED, fixture_client

pytestmark = pytest.mark.integration

# Fixture inventory: 5 list pages; 9 distinct bills/amendments, each with actions + cosponsors.
LIST_PAGES = 5
DISTINCT_BILLS = 9
MEMBER_LEGISLATION_ROWS = 2 + 2 + 2 + 3


def _counts(engine: Engine) -> dict[str, int]:
    with engine.connect() as conn:
        return {
            table: conn.execute(text(f"SELECT count(*) FROM raw.{table}")).scalar_one()
            for table in ("member_legislation", "bill", "bill_actions", "bill_cosponsors")
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
        rows = src.load(conn, client, TRACKED, CONGRESS, full_refresh=True)
    assert rows == MEMBER_LEGISLATION_ROWS + DISTINCT_BILLS * 3
    assert client.requests_made == LIST_PAGES + DISTINCT_BILLS * 3
    counts = _counts(migrated_engine)
    assert counts["member_legislation"] >= MEMBER_LEGISLATION_ROWS
    assert counts["bill"] >= DISTINCT_BILLS

    # Second run: details are re-fetched, actions/cosponsors are not (updateDate unchanged).
    client = fixture_client()
    with connect() as conn:
        src.load(conn, client, TRACKED, CONGRESS)
    assert client.requests_made == LIST_PAGES + DISTINCT_BILLS
    assert _counts(migrated_engine) == counts

    # A changed updateDate on one bill triggers exactly one actions + cosponsors refresh.
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
        src.load(conn, client, TRACKED, CONGRESS)
    assert client.requests_made == LIST_PAGES + DISTINCT_BILLS + 2

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
        src.load(conn, fixture_client(), TRACKED, CONGRESS)
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
