"""Reading House annual report PDFs and storing them: Schedules A and D (ADR 0029), C and E to H
(ADR 0031).

Fixtures (tests/fixtures/house_annual/, real Clerk PDFs, kept whole):

* ``annual_10075925_wi01_2025.pdf``: an annual report for 2025, WI-01. 26 assets over three pages,
  most held in accounts ("ACCOUNT ⇒ fund [MF]"), rows that run from one page onto the next, a
  Comments line under a holding, and one mortgage in Schedule D.
* ``new_member_10067251_nd00_2024.pdf``: a new member's report (filing type H) for 2024, ND-AL,
  whose Schedule A has two income columns instead of "Tx. > $1,000?".
* ``annual_10068065_page_spill.pdf``: an annual report for 2024, VA-03, where a whole row's income
  type spills onto the next page under the repeated header.
* ``annual_10076090_sc06_2025_travel.pdf``: an annual report for 2025, SC-06, with income,
  positions, an agreement and four trips; the second trip's source and itinerary run from page 2
  onto page 3 under the repeated header.
* ``annual_10076550_ny08_2025_gift.pdf``: an annual report for 2025, NY-08, with a gift and an
  agreement whose parties wrap onto a second line.
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
TRAVEL = "annual_10076090_sc06_2025_travel.pdf"
GIFT = "annual_10076550_ny08_2025_gift.pdf"


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


def test_income_positions_and_agreements_read_as_rows() -> None:
    report = parse_annual_report(_read(TRAVEL))
    (pension,) = report.schedules["C"].rows
    assert pension.cells == {
        "source": "South Carolina Retirement System",
        "type": "Retirement from State of South Carolina",
        "amount": "$61,334.34",
    }
    positions = report.schedules["E"].rows
    assert [p.cells for p in positions] == [
        {"position": "Board Member (uncompensated)", "organization": "Allen University"},
        {
            "position": "Board Member (uncompensated)",
            "organization": "Congressional Black Caucus Education & Leadership Institute",
        },
    ]
    (pension_plan,) = report.schedules["F"].rows
    assert pension_plan.cells == {
        "date": "June 1992",
        "parties": "Myself and South Carolina Retirement System",
        "terms": "Retirement Pension",
    }
    assert report.schedules["G"].none_disclosed and not report.schedules["G"].rows


def test_a_trip_runs_across_the_page_break_without_starting_a_new_one() -> None:
    trips = parse_annual_report(_read(TRAVEL)).schedules["H"].rows
    assert len(trips) == 4
    # Starts at the foot of page 2; "Company" and "York NY - Washington, DC" are on page 3.
    assert trips[1].page == 2
    assert trips[1].cells == {
        "source": "Little, Brown and Company",
        "start_date": "11/09/2025",
        "end_date": "11/12/2025",
        "itinerary": "Columbia, SC - New York NY - Washington, DC",
        "days_at_own_expense": "0",
        "lodging": "",
        "food": "",
        "family": "",
    }
    assert trips[3].cells["itinerary"] == "Columbia, SC - Philadelphia, PA - Washington, DC"


def test_a_gift_and_wrapped_agreement_parties() -> None:
    report = parse_annual_report(_read(GIFT))
    (gift,) = report.schedules["G"].rows
    assert gift.cells == {
        "source": "Catherine B. Davis (Durham, NC, US)",
        "description": "Birthday Gift",
        "value": "$500.00",
    }
    (agreement,) = report.schedules["F"].rows
    assert agreement.cells["parties"] == "New York State Common Retirement Fund/ Hakeem S. Jeffries"
    assert report.schedules["C"].rows[0].cells["amount"] == "N/A"


def test_a_new_members_income_has_two_amounts_and_positions_keep_comments() -> None:
    report = parse_annual_report(_read(NEW_MEMBER))
    (salary,) = report.schedules["C"].rows
    assert salary.cells == {
        "source": "ND Public Service Commission",
        "type": "Salary",
        "amount": "N/A",
        "amount_preceding": "$127,500.00",
    }
    president, *_ = report.schedules["E"].rows
    assert president.cells == {"position": "President", "organization": "NARUC"}
    assert president.detail["comments"].startswith("I Completed this term as president")
    assert len(report.schedules["E"].rows) == 4


def test_a_travel_row_without_an_end_date_is_refused() -> None:
    from ingest.house_annual_report import ParsedAnnualReport, Row, Schedule, _validate

    parsed = ParsedAnnualReport(pages=1, text_chars=1)
    parsed.schedules["A"] = Schedule("A", none_disclosed=True)
    parsed.schedules["H"] = Schedule(
        "H", rows=[Row(1, {"source": "X", "start_date": "01/01/2025", "end_date": ""})]
    )
    with pytest.raises(AnnualReportParseError, match="Schedule H row 1 .*no end_date"):
        _validate(parsed)


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
    # Schedules A (26), D (1) and F (2); C, E, G and H are "None disclosed."
    assert _page(migrated_engine) == ("parsed", None, "26", 26 + 1 + 2)
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
def test_a_report_read_by_an_older_reader_is_read_again(
    migrated_engine: Engine, clean: None
) -> None:
    _load(_files(_read(STEIL)))
    with migrated_engine.begin() as conn:
        # As reader 1 stored it: no reader in the payload, no Schedule F rows.
        conn.execute(
            text(
                "UPDATE raw.annual_report_page SET payload = payload - 'reader' WHERE doc_id = :d"
            ),
            {"d": DOC},
        )
        conn.execute(
            text("DELETE FROM raw.annual_report_row WHERE doc_id = :d AND part = 'F'"), {"d": DOC}
        )
    assert _load(_files(_read(STEIL))) == 2  # the old report is opened again
    assert _page(migrated_engine)[3] == 26 + 1 + 2
    assert _load(_files(_read(STEIL))) == 1  # and then not again


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
