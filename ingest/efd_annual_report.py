"""Reading one eFD annual report page: every part's table, kept generically (ADR 0028).

An electronic Senate annual report (``/search/view/annual/{uuid}/``) is one HTML page in parts,
each an ``<h3 class="h4">`` heading followed by either a table or the filer's "No" answer to the
part's question:

    Part 1. Honoraria ...           Part 5. Gifts               Part 9. Agreements
    Part 2. Earned and Non-Investment Income                    Part 10. Compensation
    Part 3. Assets                  Part 6. Travel              Attachments & Comments
    Part 4a. Periodic Transaction Report Summary                Part 7. Liabilities
    Part 4b. Transactions           Part 8. Positions

Every part with a table is stored: its column headings, and per row each cell's main text plus
the notes eFD nests under it (a filer's comment under an asset, a subtype under an asset type, a
city under a creditor). The site reads Parts 2, 3, 5, 6, 7, 8 and 9 (ADR 0028, ADR 0030).

The staging models read those parts' cells by position, so their headings must be exactly the
ones seen on all 35 tracked senators' reports of 2025 and 2026 (checked 2026-11-16), and a report
without a Part 3 is refused. A row whose cell count differs from its part's headings is refused
in any part. A refused report raises :class:`ingest.senate_efd.EfdParseError`.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from typing import Any

from ingest.senate_efd import FILED_RE, EfdParseError

# Bumped when a fix changes what the reader stores; pages read by an older version are read
# again on the next run (ingest.sources.senate_annual.stored_pages).
READER_VERSION = 2
ASSETS = "3"
LIABILITIES = "7"
INCOME = "2"
GIFTS = "5"
TRAVEL = "6"
POSITIONS = "8"
AGREEMENTS = "9"
EXPECTED_COLUMNS = {
    INCOME: ("", "#", "Who Was Paid", "Type", "Who Paid", "Amount Paid", "Comments"),
    GIFTS: ("", "#", "Date", "Recipient", "Gift", "Value", "From", "Comments"),
    TRAVEL: (
        "",
        "#",
        "Date(s)",
        "Traveler(s)",
        "Travel Type",
        "Itinerary",
        "Reimbursed For",
        "Who Paid",
        "Comments",
    ),
    POSITIONS: ("", "#", "Position Dates", "Position Held", "Entity", "Entity Type", "Comments"),
    AGREEMENTS: ("", "#", "Date", "Parties Involved", "Type", "Status and Terms", "Comments"),
    ASSETS: ("", "Asset", "Asset Type", "Owner", "Value", "Income Type", "Income"),
    LIABILITIES: (
        "",
        "#",
        "Incurred",
        "Debtor",
        "Type",
        "Points",
        "Rate (Term)",
        "Amount",
        "Creditor",
        "Comments",
    ),
}
PART_RE = re.compile(r"^Part (\d+[a-z]?)\.")
TITLE_RE = re.compile(
    r"^(?:Annual Report for Calendar (?P<year>\d{4})|New Filer Report.*|Termination Report.*)"
    r"(?: \(Amendment(?: \d+)?\))?$"
)


def _text(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


@dataclass(frozen=True)
class Cell:
    text: str
    notes: tuple[str, ...] = ()

    def as_payload(self) -> dict[str, Any]:
        return {"text": self.text, "notes": list(self.notes)}


@dataclass
class Part:
    key: str  # "3", "4a", "comments"
    title: str
    columns: tuple[str, ...]
    rows: list[tuple[Cell, ...]] = field(default_factory=list)
    answer: str | None = None  # the "No" answer when the part has no table

    def summary(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "columns": list(self.columns),
            "rows": len(self.rows),
            "answer": self.answer,
        }


@dataclass
class AnnualReport:
    title: str
    filer: str
    filed_at: str | None
    covers_year: int | None
    parts: dict[str, Part]


def _cell(fragment: str) -> Cell:
    """A cell's main text (what comes before its first nested block) and the text of each block
    nested in it, in order. Blocks can nest: Cotton's 2025 report prints
    ``<div class="muted"><div class="muted"><em>Type: </em>Savings</div><em>Filer comment: </em>
    ...</div>``, so the text is cut at every ``<div>`` and ``</div>``, not matched in pairs.
    Matching pairs left "Filer comment: ..." in the asset name (fixed 2026-11-16, reader 2)."""
    head, _, rest = fragment.partition("<div")
    pieces = re.split(r"</?div[^>]*>", "<div" + rest) if rest else []
    notes = tuple(n for n in (_text(p) for p in pieces) if n)
    return Cell(_text(head), notes)


def parse_annual_report(page: str) -> AnnualReport:
    heading = re.search(r'<h1 class="mb-2">(.*?)</h1>', page, re.S)
    filer = re.search(r'<h2 class="filedReport">(.*?)</h2>', page, re.S)
    if heading is None or filer is None:
        raise EfdParseError("the report header (title, filer) is missing")
    title = _text(heading.group(1))
    titled = TITLE_RE.match(title)
    if titled is None:
        raise EfdParseError(f"not an annual, new filer or termination report: {title!r}")
    parts: dict[str, Part] = {}
    for chunk in re.split(r'<h3 class="h4">', page)[1:]:
        part_title = _text(chunk.split("</h3>", 1)[0])
        numbered = PART_RE.match(part_title)
        key = numbered.group(1) if numbered else "comments"
        if key in parts:
            raise EfdParseError(f"part {key} appears twice")
        head = re.search(r"<thead>(.*?)</thead>", chunk, re.S)
        body = re.search(r"<tbody>(.*?)</tbody>", chunk, re.S)
        columns = (
            tuple(_text(th) for th in re.findall(r"<th[^>]*>(.*?)</th>", head.group(1), re.S))
            if head
            else ()
        )
        part = Part(key, part_title, columns)
        if body is None:
            part.answer = _text(chunk.split("</h3>", 1)[1])[:500] or None
        else:
            for number, row in enumerate(
                re.findall(r"<tr[^>]*>(.*?)</tr>", body.group(1), re.S), 1
            ):
                cells = tuple(_cell(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S))
                if len(cells) != len(columns):
                    raise EfdParseError(
                        f"part {key} row {number}: {len(cells)} cells under {len(columns)} headings"
                    )
                part.rows.append(cells)
        expected = EXPECTED_COLUMNS.get(key)
        if expected and head is not None and columns != expected:
            raise EfdParseError(
                f"part {key} headings are {list(columns)}, expected {list(expected)}"
            )
        parts[key] = part
    if ASSETS not in parts:
        raise EfdParseError("no Part 3 (Assets)")
    filed = FILED_RE.search(page)
    return AnnualReport(
        title=title,
        filer=_text(filer.group(1)),
        filed_at=filed.group(1) if filed else None,
        covers_year=int(titled.group("year")) if titled.group("year") else None,
        parts=parts,
    )
