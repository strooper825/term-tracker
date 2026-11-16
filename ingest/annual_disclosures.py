"""Annual financial disclosures: which reports a member filed, read from the two offices' own
listings (ADR 0027). Stage 1 lists and links them; nothing inside a report is read.

House: the Clerk's yearly filing index (``financial-pdfs/{year}FD.zip``, the file the stock-trades
source already reads) names each filing's type. The index file's year is the calendar year the
reports cover: the annual report for 2024, filed in May 2025, is in ``2024FD.zip``. Its PDF is at
``financial-pdfs/{year}/{DocID}.pdf``. Four types are listed:

* ``O`` the annual report (an original);
* ``H`` a new member's first report, covering the year before they took office. Seen
  2026-11-16: Fedorchak and Begich, first elected in 2024, each filed an ``H`` in August 2025
  under the 2024 index, after an ``X`` that May;
* ``A`` an amendment (of an annual or a new member report);
* ``T`` a termination report, filed on leaving office;
* ``X`` a due-date extension. The index does not say which report an extension is for. Annual
  reports are due on May 15 of the following year, so an extension filed in that following year
  is taken to be for that year's annual or new member report; one filed in the covered year
  itself (a candidate's, for instance) is not shown.

Other types are not shown: ``P`` (periodic transaction reports, the Stock trades tab), ``C``
(candidate reports, which repeat much of the annual report), and ``D``, ``W``, ``E``, ``G``,
``B``, whose meaning the Clerk's index does not state.

Senate: eFD's search, report types 7 (annual, new filer, termination and candidate reports) and
10 (due-date extensions), filed by sitting senators. The titles say what each is and, for an
extension, which report it delays ("Annual Report for 2025 Due Date Extension 1"). Candidate
reports and blind trusts are not shown. A paper report's title has no year ("Annual Report").
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from ingest.house_ptr import BASE_URL as CLERK_BASE_URL
from ingest.senate_efd import DATA_PATH, DATE_RE, SourceShapeError, _text

HOUSE_KINDS = {
    "O": "annual",
    "H": "new_filer",
    "A": "amendment",
    "T": "termination",
    "X": "extension",
}


def house_report_url(year: int, doc_id: str) -> str:
    return f"{CLERK_BASE_URL}/financial-pdfs/{year}/{doc_id}.pdf"


ANNUAL_LINK_RE = re.compile(
    r'href="(/search/view/(annual|paper|extension-notice/regular)/([0-9a-f-]{36})/)"'
)
AMENDMENT = r"(?: \(Amendment(?: (?P<amendment>\d+))?\))?"
EFD_TITLES: list[tuple[str, re.Pattern[str]]] = [
    ("annual", re.compile(rf"^Annual Report for CY (?P<year>\d{{4}}){AMENDMENT}$")),
    ("annual", re.compile(rf"^Annual Report{AMENDMENT}$")),  # paper: no year in the title
    (
        "new_filer",
        re.compile(rf"^New Filer Report for (?P<date>\d{{2}}/\d{{2}}/\d{{4}}){AMENDMENT}$"),
    ),
    (
        "termination",
        re.compile(rf"^Termination Report for (?P<date>\d{{2}}/\d{{2}}/\d{{4}}){AMENDMENT}$"),
    ),
    ("extension", re.compile(r"^Annual Report for (?P<year>\d{4}) Due Date Extension \d+$")),
]


@dataclass(frozen=True)
class EfdAnnualRow:
    first: str
    last: str
    office: str
    title: str
    path: str
    report_id: str
    view: str  # annual, paper or extension-notice/regular
    kind: str  # annual, amendment, new_filer, termination or extension
    covers_year: int | None
    amendment: int
    filed: str

    def as_payload(self) -> dict[str, Any]:
        return {
            "first": self.first,
            "last": self.last,
            "office": self.office,
            "title": self.title,
            "view": self.view,
            "kind": self.kind,
            "covers_year": self.covers_year,
            "amendment": self.amendment,
            "filed": self.filed,
        }


def _classify(title: str) -> tuple[str, int | None, int] | None:
    for kind, pattern in EFD_TITLES:
        found = pattern.match(title)
        if not found:
            continue
        parts = found.groupdict()
        amended = "(Amendment" in title
        number = int(parts["amendment"]) if parts.get("amendment") else (1 if amended else 0)
        year = int(parts["year"]) if parts.get("year") else None
        if kind == "annual" and number:
            kind = "amendment"
        return kind, year, number
    return None


def parse_efd_annual_rows(payload: Mapping[str, Any]) -> tuple[list[EfdAnnualRow], list[str]]:
    """The rows this site lists, and the titles of rows it leaves out (candidate reports, blind
    trusts, anything new). A row of another shape stops the run."""
    rows: list[EfdAnnualRow] = []
    skipped: list[str] = []
    for number, cells in enumerate(payload.get("data", []), start=1):
        where = f"{DATA_PATH} row {number}"
        if not isinstance(cells, list) or len(cells) != 5:
            raise SourceShapeError(f"{where}: expected 5 cells, got {cells!r}"[:300])
        first, last, office, link, filed = (str(c) for c in cells)
        title = _text(link)
        if not DATE_RE.match(filed.strip()):
            raise SourceShapeError(f"{where}: no filed date: {cells!r}"[:300])
        found = ANNUAL_LINK_RE.search(link)
        kind = _classify(title)
        if found is None or kind is None:
            skipped.append(title)
            continue
        rows.append(
            EfdAnnualRow(
                first=" ".join(first.split()),
                last=" ".join(last.split()),
                office=" ".join(office.split()),
                title=title,
                path=found.group(1),
                view=found.group(2),
                report_id=found.group(3),
                kind=kind[0],
                covers_year=kind[1],
                amendment=kind[2],
                filed=filed.strip(),
            )
        )
    return rows, skipped
