"""Reading eFD annual reports and storing their parts (ADR 0028)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from psycopg.types.json import Jsonb
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.efd_annual_report import parse_annual_report
from ingest.senate_efd import EfdParseError
from ingest.sources import senate_annual
from tests.fixtures.senate_efd import (
    ANNUAL_PAGES,
    JOHNSON_2025,
    SANDERS_2025,
    SLOTKIN_2024_AMENDMENT,
    FakeEfd,
    efd_client,
    read,
)


def _report(report_id: str):
    return parse_annual_report(read(ANNUAL_PAGES[report_id]))


# --- reading -------------------------------------------------------------------------------------


def test_every_part_is_kept_with_its_headings_and_rows() -> None:
    report = _report(SANDERS_2025)
    assert report.title == "Annual Report for Calendar 2025" and report.covers_year == 2025
    assert report.filer.startswith("The Honorable Bernard Sanders")
    assert report.filed_at == "08/13/2026 @ 10:15 AM"
    assert list(report.parts) == [
        "1",
        "2",
        "3",
        "4a",
        "4b",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "comments",
    ]
    assets = report.parts["3"]
    assert assets.columns == ("", "Asset", "Asset Type", "Owner", "Value", "Income Type", "Income")
    assert len(assets.rows) == 33
    assert len(report.parts["7"].rows) == 2
    # A part the filer answered "No" to has no rows and keeps the answer.
    assert report.parts["1"].rows == [] and report.parts["1"].answer.startswith("Did any")


def test_a_cell_keeps_its_main_text_and_the_notes_nested_under_it() -> None:
    plan, fund = _report(SANDERS_2025).parts["3"].rows[:2]
    assert plan[0].text == "1" and plan[1].text == "Spouse Retirement plan"
    assert plan[1].notes[0].startswith("Filer comment: These are not individually held stocks")
    assert (plan[2].text, plan[2].notes) == (
        "Retirement Plans",
        ("401(k), 403(b), or other Defined Contribution Plan.",),
    )
    assert plan[4].text == "--"
    assert (fund[0].text, fund[1].text, fund[4].text) == (
        "1.1",
        "CREF Stock Account - R1",
        "$15,001 - $50,000",
    )
    mortgage = _report(SANDERS_2025).parts["7"].rows[0]
    assert (mortgage[7].text, mortgage[8].text, mortgage[8].notes) == (
        "$100,001 - $250,000",
        "Quicken Loans/Rocket Mortgage",
        ("Detroit, MI",),
    )


def test_a_report_with_no_liabilities_reads_with_an_empty_part_7() -> None:
    report = _report(JOHNSON_2025)
    assert len(report.parts["3"].rows) == 13 and report.parts["7"].rows == []


def test_an_amendment_title_still_gives_the_year() -> None:
    report = _report(SLOTKIN_2024_AMENDMENT)
    assert report.title == "Annual Report for Calendar 2024 (Amendment 1)"
    assert report.covers_year == 2024


def test_changed_asset_headings_are_refused() -> None:
    page = read(ANNUAL_PAGES[SANDERS_2025]).replace(">Income Type<", ">Kind of Income<", 1)
    with pytest.raises(EfdParseError, match="part 3 headings"):
        parse_annual_report(page)


def test_a_row_with_a_missing_cell_is_refused() -> None:
    page = read(ANNUAL_PAGES[SANDERS_2025]).replace("<td>Spouse</td>", "", 1)
    with pytest.raises(EfdParseError, match="cells under"):
        parse_annual_report(page)


def test_a_page_without_assets_is_refused() -> None:
    page = read(ANNUAL_PAGES[SANDERS_2025]).replace("Part 3. Assets", "Part 3x. Assets")
    with pytest.raises(EfdParseError, match="no Part 3"):
        parse_annual_report(page)


# --- storing -------------------------------------------------------------------------------------

SENATOR = "X000095"  # stand-in senator named Sanders, so the real fixture page can be attached
OFFICE = "Sanders, Bernard (Senator)"


def _link(view: str, report_id: str, title: str) -> str:
    return f'<a href="/search/view/{view}/{report_id}/" target="_blank">{title}</a>'


def _rows() -> list[list[str]]:
    return [
        [
            "Bernard",
            "Sanders",
            OFFICE,
            _link("annual", SANDERS_2025, "Annual Report for CY 2025"),
            "08/13/2026",
        ],
        [
            "Bernard",
            "Sanders",
            OFFICE,
            _link(
                "extension-notice/regular",
                "00000000-0000-4000-8000-000000000001",
                "Annual Report for 2025 Due Date Extension 1",
            ),
            "05/15/2026",
        ],
        # A paper report is stored as paper without being opened.
        [
            "BERNARD",
            "SANDERS",
            "Senator",
            _link("paper", "00000000-0000-4000-8000-000000000002", "Annual Report"),
            "06/01/2025",
        ],
    ]


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
                    {"b": SENATOR},
                )

    wipe()
    with connect() as conn:
        conn.execute(
            "INSERT INTO raw.legislator (bioguide_id, payload, source_url, fetched_at) "
            "VALUES (%s, %s, 'test', %s)",
            (
                SENATOR,
                Jsonb(
                    {
                        "name": {"first": "Bernard", "last": "Sanders"},
                        "terms": [{"type": "sen", "state": "VT"}],
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


def _load(fake: FakeEfd, **kwargs) -> int:
    client = efd_client(fake)
    with connect() as conn:
        senate_annual.load(conn, client, [SENATOR], date(2025, 1, 3), **kwargs)
    return client.requests_made


def _pages(engine: Engine) -> dict[str, tuple]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT p.doc_id, p.status, p.payload -> 'parts' -> '3' ->> 'rows', "
                "(SELECT count(*) FROM raw.annual_report_row r "
                " WHERE r.source = p.source AND r.doc_id = p.doc_id) "
                "FROM raw.annual_report_page p WHERE p.bioguide_id = :b"
            ),
            {"b": SENATOR},
        ).all()
    return {r[0]: tuple(r[1:]) for r in rows}


@pytest.mark.integration
def test_each_report_is_opened_once_and_every_part_stored(
    migrated_engine: Engine, clean: None
) -> None:
    assert _load(FakeEfd(_rows())) == 2 + 1 + 1  # agree, one search page, one report
    pages = _pages(migrated_engine)
    report = _report(SANDERS_2025)
    all_rows = sum(len(p.rows) for p in report.parts.values())
    assert pages[SANDERS_2025] == ("parsed", "33", all_rows)
    assert pages["00000000-0000-4000-8000-000000000002"] == ("paper", None, 0)
    # The extension is listed, never opened.
    assert "00000000-0000-4000-8000-000000000001" not in pages
    with migrated_engine.connect() as conn:
        cells = conn.execute(
            text(
                "SELECT payload -> 'cells' FROM raw.annual_report_row "
                "WHERE doc_id = :d AND part = '3' AND row_index = 2"
            ),
            {"d": SANDERS_2025},
        ).scalar_one()
    assert cells[1] == {"text": "CREF Stock Account - R1", "notes": []}
    # The second night opens nothing: a filed report never changes.
    assert _load(FakeEfd(_rows())) == 2 + 1


@pytest.mark.integration
def test_a_report_that_does_not_read_is_failed_and_tried_again(
    migrated_engine: Engine, clean: None
) -> None:
    broken = FakeEfd(_rows())
    broken.pages[SANDERS_2025] = broken.pages[SANDERS_2025].replace(">Income Type<", ">Kind<", 1)
    _load(broken)
    assert _pages(migrated_engine)[SANDERS_2025] == ("failed", None, 0)
    assert _load(FakeEfd(_rows())) == 2 + 1 + 1
    assert _pages(migrated_engine)[SANDERS_2025][0] == "parsed"


@pytest.mark.integration
def test_a_report_naming_someone_else_is_not_trusted(migrated_engine: Engine, clean: None) -> None:
    fake = FakeEfd(_rows())
    fake.pages[SANDERS_2025] = read(ANNUAL_PAGES[JOHNSON_2025])
    _load(fake)
    assert _pages(migrated_engine)[SANDERS_2025] == ("failed", None, 0)


def test_nested_blocks_are_notes_and_never_part_of_the_name() -> None:
    from ingest.efd_annual_report import _cell

    # Cotton's 2025 report: a block nested inside the comment block.
    cell = _cell(
        '<strong>Marcus by Goldman Sachs</strong><div class="muted noWrap">(NYC, New York)</div>'
        '<div class="muted"><div class="muted"><em>Type: </em>Savings</div>'
        "<em>Filer comment:  </em>Marcus Savings Account #1 (of 3).</div>"
    )
    assert cell.text == "Marcus by Goldman Sachs"
    assert cell.notes == (
        "(NYC, New York)",
        "Type: Savings",
        "Filer comment: Marcus Savings Account #1 (of 3).",
    )


@pytest.mark.integration
def test_a_report_read_by_an_older_reader_is_read_again(
    migrated_engine: Engine, clean: None
) -> None:
    _load(FakeEfd(_rows()))
    with migrated_engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE raw.annual_report_page SET payload = payload - 'reader' WHERE doc_id = :d"
            ),
            {"d": SANDERS_2025},
        )
    assert _load(FakeEfd(_rows())) == 2 + 1 + 1  # the old page is opened again
    assert _load(FakeEfd(_rows())) == 2 + 1  # and then not again
