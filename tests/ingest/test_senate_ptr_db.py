"""Loading Senate PTRs into raw: statuses, amendments, idempotency, refusals (ADR 0026)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from psycopg.types.json import Jsonb
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.http import SourceUnavailable
from ingest.sources import senate_ptr
from tests.fixtures.senate_efd import (
    BOOZMAN_A,
    BOOZMAN_AMENDMENT,
    BOOZMAN_B,
    FETTERMAN_BOND,
    PAPER,
    FakeEfd,
    efd_client,
    search_row,
)

pytestmark = pytest.mark.integration

# A stand-in tracked senator whose name matches the real fixture pages (Boozman), so real eFD
# pages can be attached to a tracked senator without a real tracked member.
BIOGUIDE = "X000098"
SINCE = date(2025, 1, 3)
MISSING = "00000000-0000-4000-8000-000000000404"
OFFICE = "Boozman, John (Senator)"


def _rows() -> list[list[str]]:
    return [
        search_row(
            "John", "Boozman", OFFICE, BOOZMAN_AMENDMENT, "12/08/2025", "08/24/2026", amendment=1
        ),
        search_row("John", "Boozman", OFFICE, BOOZMAN_B, "12/08/2025", "12/08/2025"),
        search_row("John", "Boozman", OFFICE, BOOZMAN_A, "12/08/2025", "12/08/2025"),
        search_row("John", "Boozman", OFFICE, MISSING, "11/01/2025", "11/01/2025"),  # a 404
        # Fetterman is not tracked here; Blumenthal is not either.
        search_row(
            "John",
            "Fetterman",
            "Fetterman, John (Senator)",
            FETTERMAN_BOND,
            "10/07/2026",
            "10/07/2026",
        ),
        search_row(
            "RICHARD", "BLUMENTHAL", "Senator", PAPER, "08/31/2026", "08/31/2026", kind="paper"
        ),
    ]


@pytest.fixture
def clean(migrated_engine: Engine) -> Iterator[None]:
    with migrated_engine.connect() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()

    def wipe() -> None:
        with migrated_engine.begin() as conn:
            for table in ("senate_ptr_transaction", "senate_ptr_report", "legislator"):
                conn.execute(
                    text(f"DELETE FROM raw.{table} WHERE bioguide_id = :b"),  # noqa: S608
                    {"b": BIOGUIDE},
                )

    wipe()
    with connect() as conn:
        conn.execute(
            "INSERT INTO raw.legislator (bioguide_id, payload, source_url, fetched_at) "
            "VALUES (%s, %s, 'test', %s)",
            (
                BIOGUIDE,
                Jsonb(
                    {
                        "name": {"first": "John", "last": "Boozman"},
                        "terms": [{"type": "sen", "state": "AR", "class": 3}],
                    }
                ),
                datetime.now(UTC),
            ),
        )
        conn.commit()
    try:
        yield
    finally:
        wipe()
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})


def _load(fake: FakeEfd, **kwargs) -> tuple[int, int]:
    client = efd_client(fake)
    with connect() as conn:
        rows = senate_ptr.load(conn, client, [BIOGUIDE], SINCE, **kwargs)
    return rows, client.requests_made


def _reports(engine: Engine) -> dict[str, tuple]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT report_id, status, supersedes, supersedes_note, "
                "(SELECT count(*) FROM raw.senate_ptr_transaction t "
                " WHERE t.report_id = r.report_id) "
                "FROM raw.senate_ptr_report r WHERE bioguide_id = :b"
            ),
            {"b": BIOGUIDE},
        ).all()
    return {r[0]: tuple(r[1:]) for r in rows}


def test_each_report_of_the_senator_is_stored_and_the_amendment_matched(
    migrated_engine: Engine, clean: None
) -> None:
    rows, requests = _load(FakeEfd(_rows()))
    reports = _reports(migrated_engine)
    # Only the tracked senator's three readable reports: the 404 is skipped, not stored, and
    # the other filers are ignored.
    assert set(reports) == {BOOZMAN_A, BOOZMAN_B, BOOZMAN_AMENDMENT}
    assert reports[BOOZMAN_A] == ("parsed", None, None, 12)
    assert reports[BOOZMAN_B] == ("parsed", None, None, 14)
    assert reports[BOOZMAN_AMENDMENT] == ("parsed", BOOZMAN_B, "shares 13 of 14 rows", 14)
    assert rows == 3 + 12 + 14 + 14
    # agree (2), one search page, four reports (the 404 included).
    assert requests == 2 + 1 + 4


def test_the_second_night_fetches_only_the_search_and_unsettled_reports(
    migrated_engine: Engine, clean: None
) -> None:
    fake = FakeEfd(_rows())
    fake.pages[BOOZMAN_A] = fake.pages[BOOZMAN_A].replace(
        "(12 transactions total)", "(13 transactions total)"
    )
    _load(fake)
    assert _reports(migrated_engine)[BOOZMAN_A][0] == "failed"
    _, requests = _load(FakeEfd(_rows()))
    # A filed eFD report never changes, so only the failed one and the 404 are tried again, and
    # a reader fix (here: the page reading back whole) reaches the failed one.
    assert requests == 2 + 1 + 2
    assert _reports(migrated_engine)[BOOZMAN_A] == ("parsed", None, None, 12)
    assert _reports(migrated_engine)[BOOZMAN_AMENDMENT][1] == BOOZMAN_B


def test_full_refresh_reads_every_report_again_without_duplicating_rows(
    migrated_engine: Engine, clean: None
) -> None:
    _load(FakeEfd(_rows()))
    _, requests = _load(FakeEfd(_rows()), full_refresh=True)
    assert requests == 2 + 1 + 4
    assert sum(r[3] for r in _reports(migrated_engine).values()) == 12 + 14 + 14


def test_a_report_that_does_not_read_is_stored_as_failed_and_the_run_succeeds(
    migrated_engine: Engine, clean: None
) -> None:
    fake = FakeEfd(_rows())
    fake.pages[BOOZMAN_A] = fake.pages[BOOZMAN_A].replace(
        "(12 transactions total)", "(13 transactions total)"
    )
    _load(fake)
    status, _, _, trades = _reports(migrated_engine)[BOOZMAN_A]
    assert (status, trades) == ("failed", 0)
    with migrated_engine.connect() as conn:
        error = conn.execute(
            text("SELECT error FROM raw.senate_ptr_report WHERE report_id = :r"), {"r": BOOZMAN_A}
        ).scalar_one()
        run = conn.execute(
            text(
                "SELECT status FROM meta.ingest_run WHERE source = 'senate_ptr' "
                "ORDER BY id DESC LIMIT 1"
            )
        ).scalar_one()
    assert "states 13 transactions; 12 read" in error and run == "success"


def test_a_report_naming_someone_else_is_not_trusted(migrated_engine: Engine, clean: None) -> None:
    # The search row says Boozman, but the page is Fetterman's.
    rows = [search_row("John", "Boozman", OFFICE, FETTERMAN_BOND, "10/07/2026", "10/07/2026")]
    _load(FakeEfd(rows))
    status, _, _, trades = _reports(migrated_engine)[FETTERMAN_BOND]
    assert (status, trades) == ("failed", 0)


def test_a_refusal_keeps_what_is_held(migrated_engine: Engine, clean: None) -> None:
    _load(FakeEfd(_rows()))
    with pytest.raises(SourceUnavailable):
        _load(FakeEfd(_rows(), refuse=True))
    assert len(_reports(migrated_engine)) == 3
    with migrated_engine.connect() as conn:
        status, error = conn.execute(
            text(
                "SELECT status, error FROM meta.ingest_run WHERE source = 'senate_ptr' "
                "ORDER BY id DESC LIMIT 1"
            )
        ).one()
    assert status == "failed" and error.startswith("SourceUnavailable:")


def test_every_fetch_failing_fails_the_run_and_stores_nothing(
    migrated_engine: Engine, clean: None
) -> None:
    with pytest.raises(RuntimeError, match="every eFD report fetch failed"):
        _load(FakeEfd(_rows(), pages={}))
    assert _reports(migrated_engine) == {}
