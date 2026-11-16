"""Annual financial disclosures, listed and linked (ADR 0027): reading, matching, loading."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from psycopg.types.json import Jsonb
from sqlalchemy import Engine, text

from ingest.annual_disclosures import house_report_url, parse_efd_annual_rows
from ingest.db import connect
from ingest.house_ptr import index_url
from ingest.http import SourceUnavailable
from ingest.models.house_ptr import INDEX_COLUMNS, IndexRow
from ingest.senate_efd import SourceShapeError
from ingest.sources import house_annual, senate_annual
from ingest.sources.house_ptr import SeatIndex, TrackedHouseMember
from tests.fixtures.house_ptr import clerk_client, index_archive, index_row
from tests.fixtures.senate_efd import ANNUAL_PAGES, JOHNSON_2025, FakeEfd, efd_client, read

UUID = "{:08x}-0000-4000-8000-000000000000"


def efd_row(
    last: str,
    title: str,
    filed: str,
    n: int,
    *,
    view: str = "annual",
    office: str | None = None,
    first: str = "John",
) -> list[str]:
    link = f'<a href="/search/view/{view}/{UUID.format(n)}/" target="_blank">{title}</a>'
    return [first, last, office or f"{last}, {first} (Senator)", link, filed]


# --- eFD titles ----------------------------------------------------------------------------------


def test_efd_titles_say_what_each_report_is_and_which_year() -> None:
    rows, skipped = parse_efd_annual_rows(
        {
            "data": [
                efd_row("Cotton", "Annual Report for CY 2025", "07/18/2026", 1),
                efd_row("Cotton", "Annual Report for CY 2024 (Amendment 2)", "09/01/2025", 2),
                efd_row(
                    "Cotton",
                    "Annual Report for 2025 Due Date Extension 1",
                    "03/17/2026",
                    3,
                    view="extension-notice/regular",
                ),
                efd_row("Blumenthal", "Annual Report (Amendment)", "06/01/2025", 4, view="paper"),
                efd_row("Doe", "New Filer Report for 01/03/2025", "02/03/2025", 5),
                efd_row("Doe", "Termination Report for 01/03/2027", "02/01/2027", 6),
                efd_row("Doe", "Candidate Report", "05/01/2026", 7),
                efd_row(
                    "Doe",
                    "Candidate Report Due Date Extension 1",
                    "04/01/2026",
                    8,
                    view="extension-notice/regular",
                ),
                efd_row("Doe", "Blind Trust", "04/01/2026", 9, view="paper"),
            ]
        }
    )
    got = [(r.kind, r.covers_year, r.amendment, r.view) for r in rows]
    assert got == [
        ("annual", 2025, 0, "annual"),
        ("amendment", 2024, 2, "annual"),
        ("extension", 2025, 0, "extension-notice/regular"),
        ("amendment", None, 1, "paper"),
        ("new_filer", None, 0, "annual"),
        ("termination", None, 0, "annual"),
    ]
    assert rows[2].path == f"/search/view/extension-notice/regular/{UUID.format(3)}/"
    # Candidate reports and blind trusts are left out, not errors.
    assert skipped == ["Candidate Report", "Candidate Report Due Date Extension 1", "Blind Trust"]


def test_an_efd_row_of_another_shape_stops_the_run() -> None:
    with pytest.raises(SourceShapeError):
        parse_efd_annual_rows({"data": [["John", "Cotton", "Cotton, John (Senator)"]]})


# --- matching a House filer ----------------------------------------------------------------------


def _row(last: str, first: str, state_dst: str, kind: str = "O") -> IndexRow:
    cells = index_row(last, first, kind, state_dst, 2025, "8/13/2026", "10076278").split("\t")
    return IndexRow.model_validate(dict(zip(INDEX_COLUMNS, cells, strict=True)))


def test_a_member_filing_under_another_surname_is_matched_by_seat_and_name() -> None:
    seats = SeatIndex([TrackedHouseMember("H001091", "hinson", "IA", 2)])
    # The Clerk lists Ashley Hinson as "Arenholz, Ashley Hinson".
    assert seats.member(_row("Arenholz", "Ashley Hinson", "IA02")).bioguide_id == "H001091"
    # A challenger for the same seat is not her.
    assert seats.member(_row("Techau", "Kevin W.", "IA02")) is None
    # Her name in another district is not her seat.
    assert seats.member(_row("Arenholz", "Ashley Hinson", "IA01")) is None


# --- loading -------------------------------------------------------------------------------------

HOUSE = "X000097"  # stand-in House member, IA-02, filing as Arenholz
SENATOR = "X000096"  # stand-in senator, Cotton
SINCE = date(2025, 1, 3)


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
                    text(f"DELETE FROM raw.{table} WHERE bioguide_id IN (:h, :s)"),  # noqa: S608
                    {"h": HOUSE, "s": SENATOR},
                )

    wipe()
    with connect() as conn:
        for bioguide, name, term in (
            (
                HOUSE,
                {"first": "Ashley", "last": "Hinson"},
                {"type": "rep", "state": "IA", "district": 2},
            ),
            (SENATOR, {"first": "Tom", "last": "Cotton"}, {"type": "sen", "state": "AR"}),
        ):
            conn.execute(
                "INSERT INTO raw.legislator (bioguide_id, payload, source_url, fetched_at) "
                "VALUES (%s, %s, 'test', %s)",
                (bioguide, Jsonb({"name": name, "terms": [term]}), datetime.now(UTC)),
            )
        conn.commit()
    try:
        yield
    finally:
        wipe()
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})


def _stored(engine: Engine, bioguide: str) -> list[tuple]:
    with engine.connect() as conn:
        return [
            tuple(r)
            for r in conn.execute(
                text(
                    "SELECT doc_id, kind, covers_year, filing_date, source_url "
                    "FROM raw.annual_disclosure WHERE bioguide_id = :b ORDER BY filing_date"
                ),
                {"b": bioguide},
            ).all()
        ]


@pytest.mark.integration
def test_house_reports_since_the_congress_began_are_listed_with_their_pdf(
    migrated_engine: Engine, clean: None
) -> None:
    files = {
        index_url(2024): index_archive(
            2024,
            [
                # Filed before the Congress began: not listed.
                index_row("Arenholz", "Ashley Hinson", "X", "IA02", 2024, "12/1/2024", "30000001"),
                index_row("Arenholz", "Ashley Hinson", "X", "IA02", 2024, "4/23/2025", "30022811"),
                index_row("Arenholz", "Ashley Hinson", "O", "IA02", 2024, "8/13/2025", "10066620"),
                # Candidate reports, trade reports and other filers are not listed.
                index_row("Arenholz", "Ashley Hinson", "C", "IA02", 2024, "5/1/2025", "10000002"),
                index_row("Arenholz", "Ashley Hinson", "P", "IA02", 2024, "5/2/2025", "20000002"),
                index_row("Techau", "Kevin W.", "O", "IA02", 2024, "5/2/2025", "10000003"),
            ],
        ),
        index_url(2025): index_archive(
            2025,
            [
                index_row("Arenholz", "Ashley Hinson", "H", "IA02", 2025, "8/2/2025", "10067251"),
                index_row("Arenholz", "Ashley Hinson", "A", "IA02", 2025, "2/4/2026", "8221318"),
            ],
        ),
    }
    # The listed reports are also opened (ADR 0029); these stand-ins are not PDFs, so each is
    # stored as failed. Reading is tested in test_house_annual_report.py.
    for year, doc in ((2024, "10066620"), (2025, "10067251"), (2025, "8221318")):
        files[house_report_url(year, doc)] = b"not a pdf"
    with connect() as conn:
        rows = house_annual.load(
            conn, clerk_client(files), [HOUSE], [2024, 2025, 2026], SINCE, today=date(2026, 11, 16)
        )
    stored = _stored(migrated_engine, HOUSE)
    assert [(d, k, y) for d, k, y, _, _ in stored] == [
        ("30022811", "extension", 2024),
        ("10067251", "new_filer", 2025),
        ("10066620", "annual", 2024),
        ("8221318", "amendment", 2025),
    ]
    assert stored[2][4] == house_report_url(2024, "10066620")
    assert rows == 4 + 3  # four listed, three report pages stored


@pytest.mark.integration
def test_house_a_later_years_index_not_published_yet_is_not_an_error(
    migrated_engine: Engine, clean: None
) -> None:
    files = {index_url(2025): index_archive(2025, [])}
    with connect() as conn:
        house_annual.load(
            conn, clerk_client(files), [HOUSE], [2025, 2026], SINCE, today=date(2026, 11, 16)
        )
        with pytest.raises(Exception, match="404"):
            house_annual.load(
                conn, clerk_client({}), [HOUSE], [2025], SINCE, today=date(2026, 11, 16)
            )


def _senate_rows() -> list[list[str]]:
    return [
        efd_row("Cotton", "Annual Report for CY 2025", "07/18/2026", 1, first="Tom"),
        efd_row(
            "Cotton",
            "Annual Report for 2025 Due Date Extension 1",
            "03/17/2026",
            2,
            view="extension-notice/regular",
            first="Tom",
        ),
        efd_row("Cotton", "Candidate Report", "05/01/2026", 3, first="Tom"),
        efd_row("Sanders", "Annual Report for CY 2025", "08/13/2026", 4, first="Bernard"),
    ]


@pytest.mark.integration
def _senate_fake(**kwargs) -> FakeEfd:
    # The annual report is also opened (ADR 0028). The page served is another senator's, so it
    # is stored as failed; reading is tested in test_efd_annual_report.py.
    return FakeEfd(
        _senate_rows(), pages={UUID.format(1): read(ANNUAL_PAGES[JOHNSON_2025])}, **kwargs
    )


def test_senate_reports_of_tracked_senators_are_listed_with_their_efd_page(
    migrated_engine: Engine, clean: None
) -> None:
    fake = _senate_fake()
    client = efd_client(fake)
    with connect() as conn:
        rows = senate_annual.load(conn, client, [SENATOR], SINCE)
    stored = _stored(migrated_engine, SENATOR)
    assert [(k, y, str(f)) for _, k, y, f, _ in stored] == [
        ("extension", 2025, "2026-03-17"),
        ("annual", 2025, "2026-07-18"),
    ]
    assert stored[1][4] == f"https://efdsearch.senate.gov/search/view/annual/{UUID.format(1)}/"
    assert rows == 2 + 1  # two listed, one report page stored
    # Annual reports and extensions, by sitting senators only.
    assert fake.searches[0]["report_types"] == ["[7, 10]"]
    assert fake.searches[0]["filer_types"] == ["[1]"]
    assert client.requests_made == 4  # agree (2), one search page, the annual report


@pytest.mark.integration
def test_senate_a_refusal_keeps_what_is_held(migrated_engine: Engine, clean: None) -> None:
    with connect() as conn:
        senate_annual.load(conn, efd_client(_senate_fake()), [SENATOR], SINCE)
        with pytest.raises(SourceUnavailable):
            senate_annual.load(conn, efd_client(FakeEfd([], refuse=True)), [SENATOR], SINCE)
    assert len(_stored(migrated_engine, SENATOR)) == 2
