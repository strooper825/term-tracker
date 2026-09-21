"""Loading House PTRs into raw: statuses, idempotency, retries, run bookkeeping."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from psycopg.types.json import Jsonb
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.house_ptr import index_url, pdf_url
from ingest.sources import house_ptr
from tests.fixtures.house_ptr import (
    ELECTRONIC,
    ELECTRONIC_PARTIAL,
    SCANNED,
    clerk_client,
    files_for,
    index_row,
)

pytestmark = pytest.mark.integration

# A stand-in tracked member whose seat matches the header of the electronic fixture (GA-12,
# Allen), so a real parsed PDF can be attached to a tracked seat without a real tracked member.
BIOGUIDE = "X000099"
YEAR = 2026
TODAY = date(2026, 9, 20)
PARSED, MISMATCH, SCAN, MISSING = "20033945", "20034201", "9116328", "9999999"


def _rows() -> list[str]:
    return [
        index_row("Allen", "Richard W.", "P", "GA12", YEAR, "2/17/2026", PARSED),
        # The index says GA12 but this PDF's own header says MO04: the loader must not trust it.
        index_row("Allen", "Richard W.", "P", "GA12", YEAR, "3/31/2026", MISMATCH),
        index_row("Allen", "Richard W.", "P", "GA12", YEAR, "9/4/2026", SCAN),
        index_row("Allen", "Richard W.", "P", "GA12", YEAR, "9/5/2026", MISSING),  # PDF is a 404
        index_row(
            "Allen", "Richard W.", "O", "GA12", YEAR, "5/1/2026", "10000001"
        ),  # annual report
        index_row("Nobody", "Not Tracked", "P", "TX01", YEAR, "1/1/2026", "20000001"),
    ]


def _files() -> dict[str, bytes]:
    return files_for(
        YEAR, _rows(), {PARSED: ELECTRONIC, MISMATCH: ELECTRONIC_PARTIAL, SCAN: SCANNED}
    )


@pytest.fixture
def clean(migrated_engine: Engine) -> Iterator[None]:
    with migrated_engine.connect() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()

    def wipe() -> None:
        with migrated_engine.begin() as conn:
            conn.execute(
                text("DELETE FROM raw.house_ptr_transaction WHERE bioguide_id = :b"),
                {"b": BIOGUIDE},
            )
            conn.execute(
                text("DELETE FROM raw.house_ptr_filing WHERE bioguide_id = :b"), {"b": BIOGUIDE}
            )
            conn.execute(text("DELETE FROM raw.legislator WHERE bioguide_id = :b"), {"b": BIOGUIDE})

    wipe()
    with connect() as conn:
        conn.execute(
            text_sql(
                "INSERT INTO raw.legislator (bioguide_id, payload, source_url, fetched_at) "
                "VALUES (%s, %s, 'test', %s)"
            ),
            (
                BIOGUIDE,
                Jsonb(
                    {
                        "name": {"first": "Richard", "last": "Allen"},
                        "terms": [{"type": "rep", "state": "GA", "district": 12}],
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


def text_sql(sql: str):
    """psycopg takes plain strings; this only keeps the call sites readable."""
    return sql


def _status(engine: Engine) -> dict[str, tuple[str, str | None]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT doc_id, status, error FROM raw.house_ptr_filing WHERE bioguide_id = :b"),
            {"b": BIOGUIDE},
        ).all()
    return {r[0]: (r[1], r[2]) for r in rows}


def _load(client, **kwargs) -> int:
    with connect() as conn:
        return house_ptr.load(conn, client, [BIOGUIDE], [YEAR], today=TODAY, **kwargs)


def test_each_filing_is_stored_with_the_status_reading_it_gave(
    migrated_engine: Engine, clean: None
) -> None:
    client = clerk_client(_files())
    rows = _load(client)
    status = _status(migrated_engine)
    # Only Allen's four PTRs are fetched: the annual report and the other member are ignored,
    # and the 404 is skipped, not stored.
    assert set(status) == {PARSED, MISMATCH, SCAN}
    assert status[PARSED] == ("parsed", None)
    assert status[SCAN] == ("scanned", None)
    assert status[MISMATCH][0] == "failed"
    assert "MO04" in (status[MISMATCH][1] or "") and "GA12" in (status[MISMATCH][1] or "")
    # 1 index + 4 PDF requests (the 404 included).
    assert client.requests_made == 5
    with migrated_engine.connect() as conn:
        stored = conn.execute(
            text(
                "SELECT row_number, source_url, payload ->> 'asset', payload ->> 'owner' "
                "FROM raw.house_ptr_transaction WHERE bioguide_id = :b ORDER BY doc_id, row_number"
            ),
            {"b": BIOGUIDE},
        ).all()
    assert len(stored) == 4  # only the parsed filing has rows; a failed one stores none
    assert stored[0][1] == f"{pdf_url(YEAR, PARSED)}#page=1"
    assert stored[0][2].endswith("(AWK) [ST]") and stored[0][3] == "SP" and stored[3][3] is None
    assert rows == 3 + 4  # three filings, four transactions


def test_the_second_night_fetches_only_the_index_and_unsettled_filings(
    migrated_engine: Engine, clean: None
) -> None:
    _load(clean_client := clerk_client(_files()))
    assert clean_client.requests_made == 5

    client = clerk_client(_files())
    _load(client)
    # The parsed and scanned PDFs never change, so they are not fetched again; the failed one
    # and the 404 are retried, so a parser fix or a late publication reaches them.
    assert client.requests_made == 3
    assert {k: v[0] for k, v in _status(migrated_engine).items()} == {
        PARSED: "parsed",
        MISMATCH: "failed",
        SCAN: "scanned",
    }
    with migrated_engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM raw.house_ptr_transaction WHERE bioguide_id = :b"),
                {"b": BIOGUIDE},
            ).scalar_one()
            == 4
        )


def test_full_refresh_reads_every_pdf_again_without_duplicating_rows(
    migrated_engine: Engine, clean: None
) -> None:
    _load(clerk_client(_files()))
    client = clerk_client(_files())
    _load(client, full_refresh=True)
    assert client.requests_made == 5
    with migrated_engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM raw.house_ptr_transaction WHERE bioguide_id = :b"),
                {"b": BIOGUIDE},
            ).scalar_one()
            == 4
        )


def test_a_failed_filing_never_fails_the_run(migrated_engine: Engine, clean: None) -> None:
    _load(clerk_client(_files()))
    with migrated_engine.connect() as conn:
        status, rows = conn.execute(
            text(
                "SELECT status, rows_loaded FROM meta.ingest_run "
                "WHERE source = 'house_ptr' ORDER BY id DESC LIMIT 1"
            )
        ).one()
    assert status == "success" and rows == 7


def test_every_fetch_failing_fails_the_run_and_stores_nothing(
    migrated_engine: Engine, clean: None
) -> None:
    files = {index_url(YEAR): _files()[index_url(YEAR)]}  # the index, but no PDFs at all
    with pytest.raises(RuntimeError, match="every PTR fetch failed"):
        _load(clerk_client(files))
    assert _status(migrated_engine) == {}
    with migrated_engine.connect() as conn:
        status, error = conn.execute(
            text(
                "SELECT status, error FROM meta.ingest_run "
                "WHERE source = 'house_ptr' ORDER BY id DESC LIMIT 1"
            )
        ).one()
    assert status == "failed" and "every PTR fetch failed" in error


def test_the_current_years_index_not_being_published_yet_is_not_an_error(
    migrated_engine: Engine, clean: None
) -> None:
    with connect() as conn:
        rows = house_ptr.load(conn, clerk_client({}), [BIOGUIDE], [YEAR], today=TODAY)
    assert rows == 0


def test_an_earlier_years_missing_index_is_an_error(migrated_engine: Engine, clean: None) -> None:
    with connect() as conn, pytest.raises(Exception, match="404"):
        house_ptr.load(conn, clerk_client({}), [BIOGUIDE], [YEAR - 1], today=TODAY)
