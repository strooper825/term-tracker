"""Reading eFD: search rows, report pages, amendments, matching senators, the session (ADR 0026)."""

from __future__ import annotations

from datetime import date

import pytest

from ingest.http import SourceUnavailable
from ingest.senate_efd import (
    EfdParseError,
    SourceShapeError,
    amended_report,
    is_sitting_senator,
    paper_pages,
    parse_ptr,
    parse_search_rows,
)
from ingest.sources.senate_ptr import TrackedSenator, efd_last_name, match_reports
from tests.fixtures.senate_efd import (
    BOOZMAN_A,
    BOOZMAN_AMENDMENT,
    BOOZMAN_B,
    FETTERMAN_BOND,
    PAGES,
    PAPER,
    FakeEfd,
    efd_client,
    read,
    search_row,
)


def _keys(report_id: str) -> list[tuple[str, ...]]:
    return [t.key() for t in parse_ptr(read(PAGES[report_id])).transactions]


# --- search rows ---------------------------------------------------------------------------------


def test_search_rows_carry_the_report_id_kind_date_and_amendment() -> None:
    rows = parse_search_rows(
        {
            "data": [
                search_row(
                    "John",
                    "Boozman",
                    "Boozman, John (Senator)",
                    BOOZMAN_AMENDMENT,
                    "12/08/2025",
                    "08/24/2026",
                    amendment=1,
                ),
                search_row(
                    "RICHARD ",
                    "BLUMENTHAL",
                    "Senator",
                    PAPER,
                    "08/31/2026",
                    "08/31/2026",
                    kind="paper",
                ),
            ]
        }
    )
    amendment, paper = rows
    assert amendment.report_id == BOOZMAN_AMENDMENT and amendment.kind == "ptr"
    assert amendment.report_for == "12/08/2025" and amendment.filed == "08/24/2026"
    assert amendment.amendment == 1 and amendment.path == f"/search/view/ptr/{BOOZMAN_AMENDMENT}/"
    assert paper.kind == "paper" and paper.amendment == 0 and paper.first == "RICHARD"


def test_an_amendment_without_a_number_counts_as_the_first() -> None:
    row = search_row("A", "B", "B, A (Senator)", PAPER, "10/02/2025", "10/02/2025", kind="paper")
    row[3] = row[3].replace("10/02/2025</a>", "10/02/2025 (Amendment)</a>")
    assert parse_search_rows({"data": [row]})[0].amendment == 1


@pytest.mark.parametrize(
    "cells",
    [
        ["John", "Boozman", "Boozman, John (Senator)", "<a>no link</a>", "08/24/2026"],
        ["John", "Boozman", "Boozman, John (Senator)"],
        [
            "John",
            "Boozman",
            "Boozman, John (Senator)",
            f'<a href="/search/view/annual/{BOOZMAN_A}/">Annual Report for CY 2025</a>',
            "05/15/2026",
        ],
    ],
)
def test_a_search_row_of_another_shape_stops_the_run(cells: list[str]) -> None:
    with pytest.raises(SourceShapeError):
        parse_search_rows({"data": [cells]})


def test_only_sitting_senators_are_matched() -> None:
    rows = parse_search_rows(
        {
            "data": [
                search_row(
                    "John",
                    "Boozman",
                    "Boozman, John (Senator)",
                    BOOZMAN_A,
                    "12/08/2025",
                    "12/08/2025",
                ),
                search_row(
                    "John",
                    "Boozman",
                    "Boozman, John (Former Senator)",
                    BOOZMAN_B,
                    "12/08/2025",
                    "12/08/2025",
                ),
                search_row(
                    "RICHARD",
                    "BLUMENTHAL",
                    "Senator",
                    PAPER,
                    "08/31/2026",
                    "08/31/2026",
                    kind="paper",
                ),
            ]
        }
    )
    assert [is_sitting_senator(r) for r in rows] == [True, False, True]


# --- matching to tracked senators ----------------------------------------------------------------


def test_a_suffix_and_capitals_do_not_stop_a_match() -> None:
    assert efd_last_name("McConnell, Jr.") == "mcconnell"
    assert efd_last_name("BLUMENTHAL") == "blumenthal"


def test_a_shared_last_name_is_decided_by_a_given_name_or_not_at_all() -> None:
    senators = [
        TrackedSenator("S000001", "scott", frozenset({"richard", "rick"})),
        TrackedSenator("S000002", "scott", frozenset({"timothy", "eugene", "tim"})),
        TrackedSenator("M000355", "mcconnell", frozenset({"addison", "mitchell", "mitch"})),
    ]
    rows = parse_search_rows(
        {
            "data": [
                search_row(
                    "Rick", "Scott", "Scott, Rick (Senator)", BOOZMAN_A, "01/02/2026", "01/02/2026"
                ),
                search_row(
                    "Timothy E",
                    "Scott",
                    "Scott, Tim (Senator)",
                    BOOZMAN_B,
                    "01/02/2026",
                    "01/02/2026",
                ),
                search_row(
                    "Pat",
                    "Scott",
                    "Scott, Pat (Senator)",
                    FETTERMAN_BOND,
                    "01/02/2026",
                    "01/02/2026",
                ),
                search_row(
                    "A. Mitchell",
                    "McConnell, Jr.",
                    "McConnell, A. Mitchell Jr. (Senator)",
                    BOOZMAN_AMENDMENT,
                    "01/02/2026",
                    "01/02/2026",
                ),
            ]
        }
    )
    matched, ambiguous = match_reports(rows, senators)
    assert [(m.row.first, m.bioguide_id) for m in matched] == [
        ("Rick", "S000001"),
        ("Timothy E", "S000002"),
        ("A. Mitchell", "M000355"),
    ]
    # "Pat Scott" names neither tracked Scott, so it is not stored; it is not ambiguous either.
    assert ambiguous == []


# --- one report ----------------------------------------------------------------------------------


def test_an_electronic_report_reads_every_row_in_number_order() -> None:
    report = parse_ptr(read(PAGES[BOOZMAN_B]))
    assert report.title == "Periodic Transaction Report for 12/08/2025"
    assert report.filer.startswith("The Honorable John Boozman")
    assert report.filed_at == "12/08/2025 @ 10:31 AM"
    assert report.stated_total == 14 and len(report.transactions) == 14
    assert [t.row_number for t in report.transactions] == list(range(1, 15))
    assert {t.owner for t in report.transactions} == {"Joint"}


def test_a_bond_keeps_its_coupon_and_maturity_and_a_blank_ticker_is_none() -> None:
    bond = parse_ptr(read(PAGES[FETTERMAN_BOND])).transactions[0]
    assert bond.asset_name == "DELL INTL LLC/EMC CORP"
    assert bond.asset_detail == {"Rate/Coupon": "5.6%", "Matures": "2033-09-15"}
    assert bond.ticker is None and bond.comment is None
    assert (bond.owner, bond.asset_type, bond.type, bond.amount) == (
        "Child",
        "Corporate Bond",
        "Purchase",
        "$1,001 - $15,000",
    )


def test_html_entities_are_read_as_text() -> None:
    names = [t.asset_name for t in parse_ptr(read(PAGES[BOOZMAN_A])).transactions]
    assert not any("&amp;" in n for n in names)


def test_a_report_whose_rows_do_not_add_up_to_its_stated_count_is_refused() -> None:
    page = read(PAGES[BOOZMAN_B]).replace("(14 transactions total)", "(15 transactions total)")
    with pytest.raises(EfdParseError, match="states 15 transactions; 14 read"):
        parse_ptr(page)


def test_a_row_with_a_missing_cell_is_refused() -> None:
    page = read(PAGES[FETTERMAN_BOND]).replace("<td>Child</td>", "", 1)
    with pytest.raises(EfdParseError, match="cells"):
        parse_ptr(page)


def test_a_page_that_is_not_a_report_is_refused() -> None:
    with pytest.raises(EfdParseError, match="header"):
        parse_ptr("<html><h1>Search</h1></html>")


def test_a_paper_report_counts_its_page_images() -> None:
    assert paper_pages(read(PAGES[PAPER])) == 9


# --- amendments ----------------------------------------------------------------------------------


def test_an_amendment_replaces_the_same_day_report_it_restates() -> None:
    chosen, why = amended_report(
        _keys(BOOZMAN_AMENDMENT), {BOOZMAN_A: _keys(BOOZMAN_A), BOOZMAN_B: _keys(BOOZMAN_B)}
    )
    assert chosen == BOOZMAN_B and why == "shares 13 of 14 rows"


def test_an_amendment_is_not_matched_on_a_guess() -> None:
    amendment = _keys(BOOZMAN_AMENDMENT)
    # Nothing in common.
    assert amended_report(amendment, {BOOZMAN_A: _keys(BOOZMAN_A)})[0] is None
    # A tie between two reports.
    tie, why = amended_report(amendment, {"x": amendment[:10], "y": amendment[4:14]})
    assert tie is None and "two earlier reports" in why
    # Fewer than half its rows in common.
    few, _ = amended_report(amendment, {"x": amendment[:6]})
    assert few is None
    assert amended_report(amendment, {}) == (None, "no earlier report for the same date")


# --- the session ---------------------------------------------------------------------------------


def test_the_client_agrees_once_then_searches_and_reads() -> None:
    fake = FakeEfd(
        [
            search_row(
                "John", "Boozman", "Boozman, John (Senator)", BOOZMAN_B, "12/08/2025", "12/08/2025"
            )
        ]
    )
    client = efd_client(fake)
    page = client.search_page(date(2025, 1, 3), 0)
    assert page["recordsTotal"] == 1 and fake.agreed == 1
    form = fake.searches[0]
    assert form["report_types"] == ["[11]"]
    assert form["submitted_start_date"] == ["01/03/2025 00:00:00"]
    assert form["csrfmiddlewaretoken"] == ["fixture-cookie"]
    assert "Periodic Transaction Report" in client.report(f"/search/view/ptr/{BOOZMAN_B}/")
    assert fake.agreed == 1 and client.requests_made == 4


def test_a_lapsed_session_agrees_again_once() -> None:
    fake = FakeEfd([], lapse_once=True)
    client = efd_client(fake)
    assert client.search_page(date(2025, 1, 3), 0)["recordsTotal"] == 0
    assert fake.agreed == 2


def test_a_refusal_is_the_source_being_unavailable_not_a_failure() -> None:
    with pytest.raises(SourceUnavailable, match="403"):
        efd_client(FakeEfd([], refuse=True)).search_page(date(2025, 1, 3), 0)
