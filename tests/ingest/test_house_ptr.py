"""House PTR reader and index matching: real Clerk PDFs, a hand-built index, no network."""

from __future__ import annotations

import io
import zipfile
from datetime import date

import pytest

from ingest.house_ptr import (
    PtrParseError,
    SourceShapeError,
    Transaction,
    normalise_name,
    parse_index,
    parse_ptr,
    validate_rows,
)
from ingest.sources.house_ptr import TrackedHouseMember, match_filings, years_of
from tests.fixtures.house_ptr import (
    ELECTRONIC,
    ELECTRONIC_PARTIAL,
    HEADER,
    NO_TABLE,
    SCANNED,
    index_archive,
    index_row,
    read,
)

# --- the index ----------------------------------------------------------------------------------


def test_index_rows_are_read_with_their_seat() -> None:
    rows = parse_index(
        index_archive(
            2026,
            [
                index_row("Khanna", "Rohit", "P", "CA17", 2026, "2/6/2026", "8221322"),
                index_row("Crawford", 'Eric A. "Rick"', "O", "AR01", 2025, "4/6/2026", "10075175"),
            ],
        ),
        2026,
    )
    assert [r.doc_id for r in rows] == ["8221322", "10075175"]
    assert rows[0].state == "CA" and rows[0].district == 17
    # A bare quotation mark in a name must not swallow the tab-separated cells that follow.
    assert rows[1].first == 'Eric A. "Rick"' and rows[1].filing_type == "O"


def test_a_row_without_a_seat_still_reads() -> None:
    (row,) = parse_index(
        index_archive(2025, [index_row("Aleman", "Katherine", "W", "", 2025, "", "8221241")]), 2025
    )
    assert row.state == "" and row.district is None


def test_a_changed_header_stops_the_run() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("2026FD.txt", HEADER.replace("DocID", "Document") + "\r\n")
    with pytest.raises(SourceShapeError, match="header"):
        parse_index(buffer.getvalue(), 2026)


def test_a_row_of_the_wrong_width_stops_the_run() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("2026FD.txt", HEADER + "\r\n" + "a\tb\tc\r\n")
    with pytest.raises(SourceShapeError, match="columns"):
        parse_index(buffer.getvalue(), 2026)


def test_a_malformed_docid_stops_the_run() -> None:
    bad = index_row("Khanna", "Rohit", "P", "CA17", 2026, "2/6/2026", "not-a-number")
    with pytest.raises(SourceShapeError, match="shape differs"):
        parse_index(index_archive(2026, [bad]), 2026)


def test_a_missing_archive_member_stops_the_run() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("other.txt", "x")
    with pytest.raises(SourceShapeError):
        parse_index(buffer.getvalue(), 2026)


# --- matching filings to tracked members -------------------------------------------------------

MEMBERS = [
    TrackedHouseMember("K000389", normalise_name("Khanna"), "CA", 17),
    TrackedHouseMember("O000172", normalise_name("Ocasio-Cortez"), "NY", 14),
]


def _rows(*lines: str):
    return parse_index(index_archive(2026, list(lines)), 2026)


def test_only_ptrs_of_tracked_seats_match() -> None:
    matched, near = match_filings(
        _rows(
            index_row("Khanna", "Rohit", "P", "CA17", 2026, "2/6/2026", "8221322"),
            index_row("Khanna", "Rohit", "O", "CA17", 2025, "5/15/2026", "10076550"),  # annual
            index_row("Ocasio-Cortez", "Alexandria", "P", "NY14", 2026, "3/1/2026", "9000001"),
            index_row("Someone", "Else", "P", "CA17", 2026, "3/1/2026", "9000002"),
        ),
        MEMBERS,
    )
    assert [(m.row.doc_id, m.bioguide_id) for m in matched] == [
        ("8221322", "K000389"),
        ("9000001", "O000172"),
    ]
    assert near == []


def test_a_same_name_in_another_district_is_a_near_miss_not_a_match() -> None:
    matched, near = match_filings(
        _rows(index_row("Khanna", "Rohit", "P", "CA16", 2026, "2/6/2026", "8221322")), MEMBERS
    )
    assert matched == [] and [r.doc_id for r in near] == ["8221322"]


def test_names_compare_without_punctuation_or_accents() -> None:
    assert normalise_name("Ocasio Cortez") == normalise_name("Ocasio-Cortez")
    assert normalise_name("Velázquez") == "velazquez"


def test_years_of_the_congress_that_have_begun() -> None:
    assert years_of(119, date(2026, 9, 20)) == [2025, 2026]
    assert years_of(119, date(2025, 6, 1)) == [2025]


# --- one PDF -------------------------------------------------------------------------------------


def test_electronic_ptr_rows_are_read_cell_by_cell() -> None:
    parsed = parse_ptr(read(ELECTRONIC))
    assert (parsed.pages, parsed.filer_name, parsed.state_district) == (
        2,
        "Hon. Richard W. Allen",
        "GA12",
    )
    assert not parsed.scanned
    rows = [t.as_payload() for t in parsed.transactions]
    assert [(r["owner"], r["type"], r["trade_date"], r["amount"]) for r in rows] == [
        ("SP", "S", "01/14/2026", "$50,001 - $100,000"),
        ("SP", "S", "01/14/2026", "$15,001 - $50,000"),
        ("SP", "P", "01/14/2026", "$15,001 - $50,000"),
        (None, "P", "01/26/2026", "$100,001 - $250,000"),
    ]
    # An asset name wrapped onto a second line is joined; the bracketed code stays on the end.
    assert rows[0]["asset"] == "American Water Works Company, Inc. Common Stock (AWK) [ST]"
    assert rows[3]["asset"] == "US Treasury Note 3.5% DUE 01/31/28 (91282CGH8) [GS]"
    assert {r["notification_date"] for r in rows} == {"02/04/2026"}
    assert rows[0]["detail"] == {
        "filing_status": "New",
        "subholding_of": "R.W. Allen & Associates, Inc. > RWA&A - Securities",
    }
    # Detail lines that spill onto the next page (locations) are not mistaken for rows.
    assert [t.row_number for t in parsed.transactions] == [1, 2, 3, 4]


def test_a_multi_page_ptr_keeps_row_order_and_page_numbers() -> None:
    parsed = parse_ptr(read(ELECTRONIC_PARTIAL))
    assert len(parsed.transactions) == 9
    assert [t.row_number for t in parsed.transactions] == list(range(1, 10))
    assert [t.page for t in parsed.transactions] == [1, 1, 1, 1, 2, 2, 2, 2, 2]
    assert {t.type for t in parsed.transactions} == {"S (partial)"}
    assert parsed.transactions[4].asset == (
        "DIA - State Street SPDR Dow Jones Indust Avg ETF Trust NYSEARCA: DIA [OT]"
    )
    # The description is long and wraps; it is kept whole on the row it belongs to.
    description = parsed.transactions[0].detail["description"]
    assert description.startswith("The full transaction included the following sales:")
    assert description.endswith("PYPL – 9.021 shares sold @ $47.735/share")
    assert parsed.transactions[4].detail["location"] == "US"


def test_a_scanned_paper_filing_is_reported_as_scanned_with_no_rows() -> None:
    parsed = parse_ptr(read(SCANNED))
    assert parsed.scanned and parsed.text_chars == 0 and parsed.pages == 1
    assert parsed.transactions == []


def test_a_text_pdf_without_transaction_rows_is_refused() -> None:
    with pytest.raises(PtrParseError, match="before the first transaction"):
        parse_ptr(read(NO_TABLE))


def test_bytes_that_are_not_a_pdf_are_refused() -> None:
    with pytest.raises(PtrParseError, match="not a readable PDF"):
        parse_ptr(b"<html>503 Service Unavailable</html>")


def _row(**overrides) -> Transaction:
    cells = {
        "row_number": 1,
        "page": 1,
        "owner": None,
        "asset": "Apple Inc. (AAPL) [ST]",
        "type": "P",
        "trade_date": "01/02/2026",
        "notification_date": "01/03/2026",
        "amount": "$1,001 - $15,000",
    }
    return Transaction(**{**cells, **overrides})


def test_a_whole_row_has_no_problems() -> None:
    assert validate_rows([_row(), _row(amount="Over $50,000,000")]) == []


@pytest.mark.parametrize(
    ("override", "fragment"),
    [
        ({"asset": ""}, "no asset"),
        ({"asset": "Apple Inc. (AAPL)"}, "no [type] code"),
        ({"notification_date": ""}, "notification date"),
        ({"amount": "$1,001 -"}, "amount"),
        ({"amount": ""}, "amount"),
    ],
)
def test_a_row_missing_a_cell_is_not_whole(override: dict, fragment: str) -> None:
    problems = validate_rows([_row(**override)])
    assert len(problems) == 1 and fragment in problems[0]
