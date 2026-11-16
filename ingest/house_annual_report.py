"""Reading one House annual financial disclosure PDF: Schedules A and D (ADR 0029).

The Clerk's annual reports (``financial-pdfs/{year}/{DocID}.pdf``) are the same layout as its
periodic transaction reports (ADR 0018): Georgia text at fixed column positions, a bold 9.4pt
header row repeated on each page of a schedule, 9pt body lines, 8.5pt detail lines under a row
(Description, Location, Comments, whose labels can print as unmapped glyphs), and each schedule
opened by a bold 12pt heading whose readable part is its letter ("S........ A: A....." is
"Schedule A: Assets and 'Unearned' Income"). Seen on 2026-11-16 across the tracked members' 2024
and 2025 reports.

Two schedules are read, the two the net-worth figures need:

* **A, Assets and "Unearned" Income**: Asset, Owner, Value of Asset, Income Type(s), Income,
  Tx. > $1,000?. An asset ends with its two-character type code in brackets; one held in an
  account is printed "ACCOUNT NAME ⇒ asset name [XX]".
* **D, Liabilities**: Owner, Creditor, Date Incurred, Type, Amount of Liability.

Rows are found by spacing: lines of one row sit about 10.5pt apart, rows 20pt or more. A row may
run from the foot of one page onto the head of the next, so a page's first line continues the
open row when that row is not yet whole (an asset without its code, a value band printed only
to its dash). Every cell is kept as printed; dbt reads values, codes and accounts from the
strings, as it does for the Senate (ADR 0028).

Failure is explicit, as in the PTR reader: a PDF with no text layer is ``scanned``; text whose
schedules do not read back as whole rows raises :class:`AnnualReportParseError`. Schedule A must
be present, either with rows or as "None disclosed."
"""

from __future__ import annotations

import io
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

import pdfplumber

from ingest.house_ptr import FILING_ID_RE

ASSETS = "A"
LIABILITIES = "D"
# Header words (bold 9.4pt) that open each column, left to right, and the cell each fills. An
# annual report's Schedule A ends with "Tx. > $1,000?"; a new member's report (filing type H) has
# two income columns instead, the current year to filing and the preceding year.
LAYOUTS: dict[str, list[tuple[tuple[str, ...], tuple[str, ...]]]] = {
    ASSETS: [
        (
            ("Asset", "Owner", "Value", "Income", "Income", "Tx."),
            ("asset", "owner", "value", "income_type", "income", "tx_over_1000"),
        ),
        (
            ("Asset", "Owner", "Value", "Income", "Income", "Income"),
            ("asset", "owner", "value", "income_type", "income", "income_preceding"),
        ),
    ],
    LIABILITIES: [
        (
            ("Owner", "Creditor", "Date", "Type", "Amount"),
            ("owner", "creditor", "date_incurred", "type", "amount"),
        ),
    ],
}
HEADING_RE = re.compile(r"^([A-J]):$")
ROW_GAP = 16.0  # points between the tops of two lines that start a new row
X_TOLERANCE = 3.0
DETAIL_KEYS = {"D": "description", "L": "location", "C": "comments"}
CODE_RE = re.compile(r"\[[A-Z0-9]{2}\]$")
BAND_RE = re.compile(r"^(?:Spouse/DC )?(?:\$[\d,]+ - \$[\d,]+|Over \$[\d,]+)$")
OPEN_BAND_RE = re.compile(r"\$[\d,]+ -$")


class AnnualReportParseError(RuntimeError):
    """A PDF with text whose schedules did not read back as whole rows."""


@dataclass
class Row:
    page: int
    cells: dict[str, str]
    detail: dict[str, str] = field(default_factory=dict)

    def as_payload(self) -> dict[str, Any]:
        return {"page": self.page, "cells": self.cells, "detail": self.detail}


@dataclass
class Schedule:
    letter: str
    rows: list[Row] = field(default_factory=list)
    none_disclosed: bool = False


@dataclass
class ParsedAnnualReport:
    pages: int
    text_chars: int
    filer_name: str | None = None
    state_district: str | None = None
    filing_type: str | None = None
    filing_year: int | None = None
    schedules: dict[str, Schedule] = field(default_factory=dict)

    @property
    def scanned(self) -> bool:
        return self.text_chars == 0


def _clean(text: str) -> str:
    return text.replace("\x00", "").strip()


def _join(words: Iterable[dict[str, Any]]) -> str:
    return " ".join(t for t in (_clean(w["text"]) for w in words) if t)


@dataclass
class _Line:
    top: float
    words: list[dict[str, Any]]

    @property
    def size(self) -> float:
        return max(w["size"] for w in self.words)

    @property
    def bold(self) -> bool:
        return all("Bold" in w["fontname"] for w in self.words)

    @property
    def text(self) -> str:
        return _join(self.words)


def _lines(words: Iterable[dict[str, Any]]) -> list[_Line]:
    lines: list[_Line] = []
    for w in sorted(words, key=lambda w: (round(w["top"], 1), w["x0"])):
        if lines and abs(w["top"] - lines[-1].top) <= 2.0:
            lines[-1].words.append(w)
        else:
            lines.append(_Line(top=w["top"], words=[w]))
    for line in lines:
        line.words.sort(key=lambda w: w["x0"])
    return lines


def _header_columns(line: _Line, letter: str) -> tuple[list[float], tuple[str, ...]] | None:
    """x positions and cell names of the columns, when ``line`` is this schedule's header row."""
    if not line.bold or line.size >= 11:
        return None
    texts = [_clean(w["text"]) for w in line.words]
    for heads, names in LAYOUTS[letter]:
        wanted = list(heads)
        xs: list[float] = []
        for w, text in zip(line.words, texts, strict=True):
            if wanted and text == wanted[0]:
                xs.append(w["x0"])
                wanted.pop(0)
        # Every heading word found, and no further "Income" left over (the other layout).
        if not wanted and texts.count("Income") == heads.count("Income"):
            return xs, names
    return None


def _split(line: _Line, xs: list[float], names: tuple[str, ...]) -> dict[str, str]:
    bounds = [*xs, float("inf")]
    cells = {}
    for i, name in enumerate(names):
        low, high = bounds[i] - X_TOLERANCE, bounds[i + 1] - X_TOLERANCE
        cells[name] = _join(w for w in line.words if low <= w["x0"] < high)
    return cells


def _whole(letter: str, row: Row) -> bool:
    """A row needs nothing more: its asset has its code and no band is cut at its dash (a value,
    an income or an amount printed "$100,001 -" continues on the next line, or the next page)."""
    if any(OPEN_BAND_RE.search(text) for text in row.cells.values()):
        return False
    return letter != ASSETS or bool(CODE_RE.search(row.cells["asset"]))


def _detail(line: _Line) -> tuple[str | None, str]:
    first = line.words[0]["text"]
    if ":" not in first:
        return None, line.text
    return DETAIL_KEYS.get(_clean(first)[:1].upper()), _join(line.words[1:])


def parse_annual_report(data: bytes) -> ParsedAnnualReport:
    try:
        pdf = pdfplumber.open(io.BytesIO(data))
    except Exception as exc:  # pdfminer raises several types for a damaged file
        raise AnnualReportParseError(f"not a readable PDF: {type(exc).__name__}: {exc}") from exc
    with pdf:
        text_chars = sum(1 for page in pdf.pages for c in page.chars if _clean(c["text"]))
        parsed = ParsedAnnualReport(pages=len(pdf.pages), text_chars=text_chars)
        if parsed.scanned:
            return parsed
        try:
            _read(pdf, parsed)
        except AnnualReportParseError:
            raise
        except Exception as exc:
            raise AnnualReportParseError(f"{type(exc).__name__}: {exc}") from exc
    _validate(parsed)
    return parsed


def _read(pdf: Any, parsed: ParsedAnnualReport) -> None:
    first_text = pdf.pages[0].extract_text() or ""
    for key, attr in (
        ("Name", "filer_name"),
        ("State/District", "state_district"),
        ("Filing Type", "filing_type"),
    ):
        found = re.search(rf"^{re.escape(key)}:\s*(.+)$", first_text, re.M)
        setattr(parsed, attr, found.group(1).strip() if found else None)
    year = re.search(r"^Filing Year:\s*(\d{4})", first_text, re.M)
    parsed.filing_year = int(year.group(1)) if year else None

    letter: str | None = None  # the schedule being read
    xs: list[float] | None = None
    names: tuple[str, ...] = ()
    current: Row | None = None
    last_top = 0.0
    body_size = 0.0
    for number, page in enumerate(pdf.pages, start=1):
        words = page.extract_words(extra_attrs=["fontname", "size"])
        page_start = True
        for line in _lines(words):
            if not line.text or FILING_ID_RE.match(line.text) or line.text.startswith("* "):
                continue
            heading = (
                line.bold
                and line.size >= 11
                and next(
                    (m.group(1) for w in line.words if (m := HEADING_RE.match(_clean(w["text"])))),
                    None,
                )
            )
            if heading:
                letter = heading
                xs, current = None, None
                parsed.schedules.setdefault(letter, Schedule(letter))
                continue
            if letter is None:
                continue
            schedule = parsed.schedules[letter]
            if line.text == "None disclosed.":
                schedule.none_disclosed = True
                continue
            if letter not in LAYOUTS:
                continue  # a schedule this reader does not read (B, C, E to I)
            header = _header_columns(line, letter)
            if header:
                xs, names = header
                continue
            if line.bold:
                continue  # the second line of a wrapped header ("$1,000?", "Liability")
            if xs is None:
                continue  # text after the schedule's table (a notes block)
            if line.size >= 8.9:
                body_size = body_size or line.size
                cells = _split(line, xs, names)
                # A row starts with its name (the asset; for a liability, the creditor). A line
                # without one carries on the row above, even across a page break, where a whole
                # row can still spill a wrapped income type onto the next page.
                named = bool(cells.get("asset") or cells.get("creditor"))
                continues = current is not None and (
                    not named
                    or (page_start and not _whole(letter, current))
                    or (not page_start and line.top - last_top < ROW_GAP)
                )
                if continues and not current.detail:
                    for name, text in cells.items():
                        if text:
                            current.cells[name] = f"{current.cells[name]} {text}".strip()
                elif continues:
                    raise AnnualReportParseError(
                        f"page {number}: row text after its detail lines: {line.text[:60]!r}"
                    )
                else:
                    current = Row(number, cells)
                    schedule.rows.append(current)
            else:
                if current is None:
                    raise AnnualReportParseError(
                        f"page {number}: a detail line before any row: {line.text[:60]!r}"
                    )
                key, value = _detail(line)
                if key:
                    current.detail[key] = value
                elif current.detail:
                    last = list(current.detail)[-1]
                    current.detail[last] = f"{current.detail[last]} {value}".strip()
                else:
                    current.detail["note"] = value
            last_top = line.top
            page_start = False


def _validate(parsed: ParsedAnnualReport) -> None:
    assets = parsed.schedules.get(ASSETS)
    if assets is None:
        raise AnnualReportParseError("no Schedule A")
    if not assets.rows and not assets.none_disclosed:
        raise AnnualReportParseError("Schedule A has neither rows nor 'None disclosed.'")
    problems = []
    for letter in (ASSETS, LIABILITIES):
        schedule = parsed.schedules.get(letter)
        for i, row in enumerate(schedule.rows if schedule else [], start=1):
            where = f"Schedule {letter} row {i} (page {row.page})"
            if letter == ASSETS:
                if not CODE_RE.search(row.cells["asset"]):
                    problems.append(f"{where}: asset {row.cells['asset'][-40:]!r} has no [code]")
                if not row.cells["value"]:
                    problems.append(f"{where}: no value")
            elif not row.cells["amount"]:
                problems.append(f"{where}: no amount")
    if problems:
        raise AnnualReportParseError("; ".join(problems[:5]))
