"""Loading the congress-legislators fixtures into raw: idempotent upserts and run bookkeeping."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.load import upsert
from ingest.sources import legislators as src
from tests.fixtures.legislators import fixture_fetch

pytestmark = pytest.mark.integration

FIXTURE_ROWS = 3 + 11 + 31  # legislators + top-level committees + membership lists


def _counts(engine: Engine) -> dict[str, int]:
    with engine.connect() as conn:
        return {
            table: conn.execute(text(f"SELECT count(*) FROM raw.{table}")).scalar_one()
            for table in ("legislator", "committee", "committee_membership")
        }


def _runs_since(engine: Engine, after_id: int) -> list[dict]:
    with engine.connect() as conn:
        return [
            dict(r)
            for r in conn.execute(
                text(
                    "SELECT id, source, status, rows_loaded, error, finished_at "
                    "FROM meta.ingest_run WHERE id > :after AND source = :source ORDER BY id"
                ),
                {"after": after_id, "source": src.SOURCE},
            ).mappings()
        ]


@pytest.fixture
def run_watermark(migrated_engine: Engine) -> Iterator[int]:
    """Max ingest_run id before the test; rows created by the test are deleted afterwards."""
    with migrated_engine.connect() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()
    try:
        yield before
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})


def test_load_fixtures_is_idempotent(migrated_engine: Engine, run_watermark: int) -> None:
    with connect() as conn:
        first = src.load(conn, fetch=fixture_fetch)
    counts_after_first = _counts(migrated_engine)
    with connect() as conn:
        second = src.load(conn, fetch=fixture_fetch)
    counts_after_second = _counts(migrated_engine)

    assert first == second == FIXTURE_ROWS
    assert counts_after_first == counts_after_second
    assert counts_after_first["legislator"] >= 3
    assert counts_after_first["committee"] >= 11

    runs = _runs_since(migrated_engine, run_watermark)
    assert [r["status"] for r in runs] == ["success", "success"]
    assert all(r["rows_loaded"] == first and r["finished_at"] is not None for r in runs)


def test_payload_stored_verbatim_with_iso_dates(
    migrated_engine: Engine, run_watermark: int
) -> None:
    with connect() as conn:
        src.load(conn, fetch=fixture_fetch)
    with migrated_engine.connect() as conn:
        payload = conn.execute(
            text("SELECT payload FROM raw.legislator WHERE bioguide_id = 'S001213'")
        ).scalar_one()
    assert payload["name"]["last"] == "Steil"
    assert payload["terms"][-1]["start"] == "2025-01-03"
    assert payload["terms"][-1]["district"] == 1


def test_failure_rolls_back_and_records_error(migrated_engine: Engine, run_watermark: int) -> None:
    with connect() as conn:
        src.load(conn, fetch=fixture_fetch)  # ensure a baseline exists
    before = _counts(migrated_engine)
    with migrated_engine.begin() as conn:
        conn.execute(text("DELETE FROM raw.committee_membership WHERE committee_id = 'HSHA'"))

    def failing_fetch(url: str) -> str:
        if url.endswith(src.MEMBERSHIP_FILE):
            raise RuntimeError("upstream exploded")
        return fixture_fetch(url)

    with connect() as conn, pytest.raises(RuntimeError, match="upstream exploded"):
        src.load(conn, fetch=failing_fetch)

    # Nothing from the failed run is visible, and the deleted row was not re-added by it.
    with migrated_engine.connect() as conn:
        hsha = conn.execute(
            text("SELECT count(*) FROM raw.committee_membership WHERE committee_id = 'HSHA'")
        ).scalar_one()
    assert hsha == 0
    assert _counts(migrated_engine)["legislator"] == before["legislator"]

    runs = _runs_since(migrated_engine, run_watermark)
    assert runs[-1]["status"] == "failed"
    assert "upstream exploded" in runs[-1]["error"]

    with connect() as conn:  # a rerun heals it
        src.load(conn, fetch=fixture_fetch)


def test_upsert_requires_key_columns(migrated_engine: Engine) -> None:
    with connect() as conn, pytest.raises(ValueError, match="key columns"):
        upsert(conn, "raw", "legislator", ["bioguide_id"], [{"payload": None}])
