"""Reading House annual report PDFs (Schedules A and D) and storing them (ADR 0029).

Fixtures (tests/fixtures/house_annual/, real Clerk PDFs, kept whole):

* ``annual_10075925_wi01_2025.pdf``: an annual report for 2025, WI-01. 26 assets over three pages,
  most held in accounts ("ACCOUNT ⇒ fund [MF]"), rows that run from one page onto the next, a
  Comments line under a holding, and one mortgage in Schedule D.
* ``new_member_10067251_nd00_2024.pdf``: a new member's report (filing type H) for 2024, ND-AL,
  whose Schedule A has two income columns instead of "Tx. > $1,000?".
* ``annual_10068065_page_spill.pdf``: an annual report for 2024, VA-03, where a whole row's income
  type spills onto the next page under the repeated header.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from psycopg.types.json import Jsonb
from sqlalchemy import Engine, text

from ingest.annual_disclosures import house_report_url
from ingest.db import connect
from ingest.house_annual_report import AnnualReportParseError, parse_annual_report
from ingest.house_ptr import index_url
from ingest.sources import house_annual
from tests.fixtures.house_ptr import SCANNED, clerk_client, index_archive, index_row
from tests.fixtures.house_ptr import read as read_ptr_fixture

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "house_annual"
STEIL = "annual_10075925_wi01_2025.pdf"
NEW_MEMBER = "new_member_10067251_nd00_2024.pdf"
SPILL = "annual_10068065_page_spill.pdf"


def _read(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


# --- reading -------------------------------------------------------------------------------------


def test_an_annual_report_reads_its_header_assets_and_liabilities() -> None:
    report = parse_annual_report(_read(STEIL))
    assert (report.state_district, report.filing_type, report.filing_year) == (
        "WI01",
        "Annual Report",
        2025,
    )
    assets = report.schedules["A"].rows
    assert len(assets) == 26
    assert assets[0].cells == {
        "asset": "JOHNSON BANK CHECKING ACCOUNT [BA]",
        "owner": "",
        "value": "$15,001 - $50,000",
        "income_type": "Interest",
        "income": "$1 - $200",
        "tx_over_1000": "",
    }
    # A holding in an account, its value band wrapped onto the next line.
    assert (
        assets[2].cells["asset"]
        == "JP MORGAN SECURITIES LLC BROKERAGE ACCOUNT ⇒ Caterpillar, Inc. (CAT) [ST]"
    )
    assert assets[2].cells["value"] == "$50,001 - $100,000"
    assert assets[4].detail == {
        "comments": "NAME CHANGED FROM GENERAL ELECTRIC COMPANY ON 04/02/2024"
    }
    # The row that runs from the foot of page 1 onto page 2.
    cash = assets[7]
    assert cash.cells["asset"].endswith("INTEREST BEARING BROKERAGE CASH ACCOUNT [BA]")
    assert cash.cells["value"] == "$100,001 - $250,000" and cash.page == 1
    assert [a.cells["value"] for a in assets].count("None") == 1
    (mortgage,) = report.schedules["D"].rows
    assert mortgage.cells == {
        "owner": "",
        "creditor": "JOHNSON BANK, JANESVILLE, WI",
        "date_incurred": "OCTOBER 2014",
        "type": "MORTGAGE ON PERSONAL RESIDENCE, JANESVILLE, WI (NOT RENTED)",
        "amount": "$15,001 - $50,000",
    }
    assert report.schedules["C"].none_disclosed


def test_a_new_members_report_has_two_income_columns() -> None:
    report = parse_annual_report(_read(NEW_MEMBER))
    assert report.filing_type == "New Filer Report" and report.filing_year == 2024
    first = report.schedules["A"].rows[0]
    assert first.cells == {
        "asset": "Checking Account [BA]",
        "owner": "",
        "value": "$50,001 - $100,000",
        "income_type": "Interest",
        "income": "Not Applicable",
        "income_preceding": "$1 - $200",
    }
    assert first.detail == {"description": "Starion Bank"}
    assert len(report.schedules["A"].rows) == 31


def test_a_whole_rows_spilled_income_type_joins_it_across_the_page() -> None:
    rows = parse_annual_report(_read(SPILL)).schedules["A"].rows
    assert len(rows) == 60
    (domini,) = [r for r in rows if r.cells["asset"].startswith("Domini Impact Equity")]
    assert domini.cells["income_type"] == "Capital Gains, Dividends"
    assert domini.detail == {"description": "Domini Impact Social Equity Fund (DSEFX)"}


def test_a_scanned_pdf_is_scanned_not_failed() -> None:
    assert parse_annual_report(read_ptr_fixture(SCANNED)).scanned


def test_not_a_pdf_is_refused() -> None:
    with pytest.raises(AnnualReportParseError, match="not a readable PDF"):
        parse_annual_report(b"<html>not found</html>")


# --- storing -------------------------------------------------------------------------------------

MEMBER = "X000094"  # stand-in member holding WI-01 under the fixture's name
YEAR = 2025
DOC = "10075925"


@pytest.fixture
def clean(migrated_engine: Engine) -> Iterator[None]:
    with migrated_engine.connect() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()

    def wipe() -> None:
        with migrated_engine.begin() as conn:
            for table in (
                "annual_report_row",
                "annual_report_page",
                "annual_disclosure",
                "legislator",
            ):
                conn.execute(
                    text(f"DELETE FROM raw.{table} WHERE bioguide_id = :b"),  # noqa: S608
                    {"b": MEMBER},
                )

    wipe()
    with connect() as conn:
        conn.execute(
            "INSERT INTO raw.legislator (bioguide_id, payload, source_url, fetched_at) "
            "VALUES (%s, %s, 'test', %s)",
            (
                MEMBER,
                Jsonb(
                    {
                        "name": {"first": "Bryan", "last": "Steil"},
                        "terms": [{"type": "rep", "state": "WI", "district": 1}],
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


def _files(pdf: bytes, state_dst: str = "WI01") -> dict[str, bytes]:
    rows = [
        index_row("Steil", "Bryan George", "O", state_dst, YEAR, "5/12/2026", DOC),
        index_row("Steil", "Bryan George", "X", state_dst, YEAR, "4/1/2026", "30000009"),
    ]
    return {index_url(YEAR): index_archive(YEAR, rows), house_report_url(YEAR, DOC): pdf}


def _load(files: dict[str, bytes]) -> int:
    client = clerk_client(files)
    with connect() as conn:
        house_annual.load(
            conn, client, [MEMBER], [YEAR], date(2025, 1, 3), today=date(2026, 11, 16)
        )
    return client.requests_made


def _page(engine: Engine) -> tuple:
    with engine.connect() as conn:
        return tuple(
            conn.execute(
                text(
                    "SELECT status, error, payload -> 'schedules' -> 'A' ->> 'rows', "
                    "(SELECT count(*) FROM raw.annual_report_row r "
                    " WHERE r.source = p.source AND r.doc_id = p.doc_id) "
                    "FROM raw.annual_report_page p WHERE doc_id = :d"
                ),
                {"d": DOC},
            ).one()
        )


@pytest.mark.integration
def test_each_report_pdf_is_read_once_and_its_schedules_stored(
    migrated_engine: Engine, clean: None
) -> None:
    assert _load(_files(_read(STEIL))) == 2  # the index and the report; the extension is not opened
    assert _page(migrated_engine) == ("parsed", None, "26", 26 + 1)  # Schedules A and D
    with migrated_engine.connect() as conn:
        payload = conn.execute(
            text(
                "SELECT payload FROM raw.annual_report_row "
                "WHERE doc_id = :d AND part = 'D' AND row_index = 1"
            ),
            {"d": DOC},
        ).scalar_one()
    assert payload["cells"]["creditor"] == "JOHNSON BANK, JANESVILLE, WI"
    assert _load(_files(_read(STEIL))) == 1  # the next night reads only the index


@pytest.mark.integration
def test_a_pdf_for_another_seat_is_not_trusted(migrated_engine: Engine, clean: None) -> None:
    # The index lists the report under WI-01, but this PDF is ND-AL's.
    _load(_files(_read(NEW_MEMBER)))
    status, error, _, rows = _page(migrated_engine)
    assert (status, rows) == ("failed", 0) and "ND00" in error


@pytest.mark.integration
def test_a_scanned_report_is_paper(migrated_engine: Engine, clean: None) -> None:
    _load(_files(read_ptr_fixture(SCANNED)))
    assert _page(migrated_engine)[0] == "paper"
