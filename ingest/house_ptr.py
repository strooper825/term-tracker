"""House Clerk financial-disclosure client: the yearly filing index and the PTR PDFs.

Two things are read, both public files on ``disclosures-clerk.house.gov``:

* ``financial-pdfs/{year}FD.zip``: the filing index (one tab-separated row per filing).
* ``ptr-pdfs/{year}/{DocID}.pdf``: one Periodic Transaction Report.

The reader is written for this project against the Clerk's own PDF layout (ADR 0018); nothing
is taken from capitol-api, which carries no license. An electronic PTR is a table whose columns
sit at fixed x positions: owner, asset, transaction type, transaction date, notification date,
amount. Each transaction starts on the line that holds both a type code and a date; the asset
name and amount may wrap onto following lines in the same (larger) font, and the detail lines
under a row (filing status, sub-holding, description, location, comments) use a smaller font.
Every cell is kept as the PDF prints it; dbt reads dates, amounts, codes and tickers from the
strings.

Failure is explicit rather than guessed at. A PDF with no text layer is ``scanned``; a PDF with
text whose table does not read back as whole rows raises :class:`PtrParseError`, which the
loader records as ``failed`` for a person to look at.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Any

import httpx
import pdfplumber
from pydantic import ValidationError

from ingest.congress_gov import RateLimiter
from ingest.http import USER_AGENT, fetch_response
from ingest.models.house_ptr import INDEX_COLUMNS, IndexRow

BASE_URL = "https://disclosures-clerk.house.gov/public_disc"
PTR_FILING_TYPE = "P"

Fetch = Callable[[str], bytes]


class SourceShapeError(RuntimeError):
    """The Clerk's files do not have the shape ADR 0018 expects. Stop and report."""


class PtrParseError(RuntimeError):
    """A PDF with a text layer whose transaction table did not read back as whole rows."""


def index_url(year: int) -> str:
    return f"{BASE_URL}/financial-pdfs/{year}FD.zip"


def pdf_url(year: int, doc_id: str) -> str:
    return f"{BASE_URL}/ptr-pdfs/{year}/{doc_id}.pdf"


class ClerkClient:
    """Throttled fetcher for the Clerk's files. One request a second, honest user agent."""

    def __init__(self, *, fetch: Fetch | None = None, limiter: RateLimiter | None = None) -> None:
        self._http = httpx.Client(
            headers={"User-Agent": USER_AGENT}, timeout=120.0, follow_redirects=True
        )
        self._fetch: Fetch = fetch or (lambda url: fetch_response(url, client=self._http).content)
        self.limiter = limiter or RateLimiter(1, period_seconds=1.0)
        self.requests_made = 0
        self.bytes_fetched = 0

    def get_bytes(self, url: str) -> bytes:
        self.limiter.acquire()
        self.requests_made += 1
        body = self._fetch(url)
        self.bytes_fetched += len(body)
        return body

    def close(self) -> None:
        self._http.close()


# --- the filing index -------------------------------------------------------------------------


def parse_index(archive: bytes, year: int) -> list[IndexRow]:
    """Every row of ``{year}FD.txt``. A changed header or an unreadable row stops the run."""
    where = f"{year}FD.zip"
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as zf:
            text = zf.read(f"{year}FD.txt").decode("utf-8-sig")
    except (zipfile.BadZipFile, KeyError) as exc:
        raise SourceShapeError(f"{where}: not the archive ADR 0018 expects ({exc})") from exc
    # QUOTE_NONE: names such as Eric A. "Rick" Crawford hold bare quotation marks.
    reader = csv.reader(io.StringIO(text), delimiter="\t", quoting=csv.QUOTE_NONE)
    header = next(reader, None)
    if header is None or tuple(header) != INDEX_COLUMNS:
        raise SourceShapeError(f"{where}: header is {header}, expected {list(INDEX_COLUMNS)}")
    rows: list[IndexRow] = []
    for number, cells in enumerate(reader, start=2):
        if not cells:
            continue
        if len(cells) != len(INDEX_COLUMNS):
            raise SourceShapeError(f"{where} line {number}: {len(cells)} columns, not 9")
        try:
            rows.append(IndexRow.model_validate(dict(zip(INDEX_COLUMNS, cells, strict=True))))
        except ValidationError as exc:
            raise SourceShapeError(
                f"{where} line {number}: shape differs from what ADR 0018 expects. {exc}"
            ) from exc
    return rows


def normalise_name(value: str) -> str:
    """Lower-case letters only, so ``Ocasio-Cortez`` and ``Ocasio Cortez`` compare equal."""
    import unicodedata

    stripped = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", stripped.lower())


# --- reading one PTR --------------------------------------------------------------------------

DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
TYPE_RE = re.compile(r"^(P|S|E)$")
OWNER_RE = re.compile(r"^(SP|DC|JT)$")
FILING_ID_RE = re.compile(r"^Filing ID #\d+$")
LABEL_WORDS = {"filing", "subholding", "description", "location", "comments"}
# First letter of a detail label -> key (Filing Status, Subholding Of, Description, Location,
# Comments). Some PDFs print the label glyphs unmapped (NUL characters), so the letter is what
# identifies them.
DETAIL_KEYS = {
    "F": "filing_status",
    "S": "subholding_of",
    "D": "description",
    "L": "location",
    "C": "comments",
}
X_TOLERANCE = 3.0


@dataclass
class Column:
    owner: float
    asset: float
    type: float
    date: float
    notification: float
    amount: float
    cap_gains: float


@dataclass
class _Line:
    top: float
    words: list[dict[str, Any]]

    @property
    def size(self) -> float:
        return max(w["size"] for w in self.words)

    @property
    def text(self) -> str:
        return " ".join(_clean(w["text"]) for w in self.words)


@dataclass
class Transaction:
    row_number: int
    page: int
    owner: str | None
    asset: str
    type: str
    trade_date: str
    notification_date: str
    amount: str
    detail: dict[str, str] = field(default_factory=dict)
    extra_detail: list[str] = field(default_factory=list)

    def as_payload(self) -> dict[str, Any]:
        return {
            "row_number": self.row_number,
            "page": self.page,
            "owner": self.owner,
            "asset": self.asset,
            "type": self.type,
            "trade_date": self.trade_date,
            "notification_date": self.notification_date,
            "amount": self.amount,
            "detail": self.detail,
            "extra_detail": self.extra_detail,
        }


@dataclass
class ParsedPtr:
    pages: int
    text_chars: int
    filer_name: str | None = None
    state_district: str | None = None
    transactions: list[Transaction] = field(default_factory=list)

    @property
    def scanned(self) -> bool:
        return self.text_chars == 0


@dataclass
class _State:
    """Where the reader is in the table, carried from page to page: a row can begin at the foot
    of one page and wrap onto the head of the next, and its detail lines can follow there."""

    current: Transaction | None = None
    main_size: float = 0.0  # font size of a row's main lines; detail lines are smaller
    in_detail: bool = False  # the current row's detail lines have begun


def _clean(text: str) -> str:
    return text.replace("\x00", "").strip()


def _find_columns(words: list[dict[str, Any]]) -> tuple[Column, float] | None:
    """Column x positions and the bottom of the table header, or None when the page has none."""
    bold = [w for w in words if "Bold" in w["fontname"]]
    by_text: dict[str, list[dict[str, Any]]] = {}
    for w in bold:
        by_text.setdefault(w["text"], []).append(w)
    needed = ("Owner", "Asset", "Transaction", "Notification", "Amount", "Cap.")
    if not all(name in by_text for name in needed):
        return None
    top = by_text["Owner"][0]["top"]
    if any(abs(by_text[name][0]["top"] - top) > 3 for name in needed):
        return None
    transaction_x = by_text["Transaction"][0]["x0"]
    notification_x = by_text["Notification"][0]["x0"]
    dates = [w for w in by_text.get("Date", []) if abs(w["top"] - top) < 3]
    if not dates:
        return None
    date_x = min(dates, key=lambda w: abs(w["x0"] - (transaction_x + notification_x) / 2))["x0"]
    header_bottom = max(w["bottom"] for w in bold if top - 1 <= w["top"] <= top + 45)
    columns = Column(
        owner=by_text["Owner"][0]["x0"],
        asset=by_text["Asset"][0]["x0"],
        type=transaction_x,
        date=date_x,
        notification=notification_x,
        amount=by_text["Amount"][0]["x0"],
        cap_gains=by_text["Cap."][0]["x0"],
    )
    return columns, header_bottom


def _group_lines(words: Iterable[dict[str, Any]]) -> list[_Line]:
    lines: list[_Line] = []
    for w in sorted(words, key=lambda w: (round(w["top"], 1), w["x0"])):
        if lines and abs(w["top"] - lines[-1].top) <= 2.0:
            lines[-1].words.append(w)
        else:
            lines.append(_Line(top=w["top"], words=[w]))
    for line in lines:
        line.words.sort(key=lambda w: w["x0"])
    return lines


def _in(word: dict[str, Any], low: float, high: float) -> bool:
    return low - X_TOLERANCE <= word["x0"] < high - X_TOLERANCE


def _join(words: Iterable[dict[str, Any]]) -> str:
    return " ".join(t for t in (_clean(w["text"]) for w in words) if t)


def _is_anchor(line: _Line, columns: Column) -> bool:
    types = [w for w in line.words if _in(w, columns.type, columns.date)]
    dates = [w for w in line.words if _in(w, columns.date, columns.notification)]
    return bool(
        types
        and TYPE_RE.match(_clean(types[0]["text"]))
        and dates
        and DATE_RE.match(_clean(dates[0]["text"]))
    )


def _detail(words: list[dict[str, Any]]) -> tuple[str | None, str]:
    """(key, value) of a detail line that starts a labelled field, else (None, whole text)."""
    first = words[0]["text"]
    labelled = "\x00" in first or _clean(first).lower().rstrip(":") in LABEL_WORDS
    if not labelled:
        return None, _join(words)
    key = DETAIL_KEYS.get(_clean(first)[:1].upper() or first[:1].upper())
    # The label ends at the first word that carries a colon (Filing Status:, Subholding Of:).
    cut = next((i for i, w in enumerate(words[:3]) if ":" in w["text"]), None)
    if key is None or cut is None:
        return None, _join(words)
    return key, _join(words[cut + 1 :])


def _page_transactions(
    page: Any,
    page_number: int,
    columns: Column,
    header_bottom: float,
    carry: list[Transaction],
    state: _State,
) -> tuple[list[Transaction], bool]:
    """Rows on one page, and whether the table ended on it (a footnote or section heading)."""
    words = page.extract_words(extra_attrs=["fontname", "size"])
    body = [w for w in words if w["top"] > header_bottom - 1]
    stop = min(
        (
            w["top"]
            for w in body
            if ("Bold" in w["fontname"] and w["size"] >= 11) or w["text"].startswith("*")
        ),
        default=float("inf"),
    )
    lines = [
        ln
        for ln in _group_lines(w for w in body if w["top"] < stop)
        if not FILING_ID_RE.match(ln.text)
    ]
    found: list[Transaction] = []
    current, main_size, in_detail = state.current, state.main_size, state.in_detail
    for line in lines:
        if _is_anchor(line, columns):
            main_size = line.size
            first = line.words
            owner_words = [w for w in first if _in(w, columns.owner, columns.asset)]
            owner = _join(owner_words) or None
            if owner and not OWNER_RE.match(owner):
                raise PtrParseError(f"page {page_number}: unexpected owner cell {owner!r}")
            current = Transaction(
                row_number=len(carry) + len(found) + 1,
                page=page_number,
                owner=owner,
                asset=_join(w for w in first if _in(w, columns.asset, columns.type)),
                type=_join(w for w in first if _in(w, columns.type, columns.date)),
                trade_date=_join(w for w in first if _in(w, columns.date, columns.notification)),
                notification_date=_join(
                    w for w in first if _in(w, columns.notification, columns.amount)
                ),
                amount=_join(w for w in first if _in(w, columns.amount, columns.cap_gains)),
            )
            found.append(current)
            in_detail = False
        elif current is None:
            raise PtrParseError(
                f"page {page_number}: text before the first transaction: {line.text[:60]!r}"
            )
        elif in_detail or (main_size and line.size < main_size - 0.2):
            in_detail = True
            key, value = _detail(line.words)
            if key:
                current.detail[key] = value
            elif current.detail:
                last = list(current.detail)[-1]
                current.detail[last] = f"{current.detail[last]} {value}".strip()
            else:
                current.extra_detail.append(value)
        else:
            # Asset name or amount wrapped onto a further line of the same row.
            asset = _join(w for w in line.words if _in(w, columns.asset, columns.type))
            amount = _join(w for w in line.words if _in(w, columns.amount, columns.cap_gains))
            leftover = [
                w
                for w in line.words
                if not (
                    _in(w, columns.asset, columns.type) or _in(w, columns.amount, columns.cap_gains)
                )
            ]
            if leftover:
                raise PtrParseError(
                    f"page {page_number}: unplaced text in a wrapped row: {_join(leftover)[:60]!r}"
                )
            current.asset = f"{current.asset} {asset}".strip()
            current.amount = f"{current.amount} {amount}".strip()
    state.current, state.main_size, state.in_detail = current, main_size, in_detail
    return found, stop != float("inf")


def parse_ptr(data: bytes) -> ParsedPtr:
    """Read one PTR. ``scanned`` when the PDF has no text; :class:`PtrParseError` when it has
    text but the table does not read back as whole rows."""
    try:
        pdf = pdfplumber.open(io.BytesIO(data))
    except Exception as exc:  # pdfminer raises several types for a damaged file
        raise PtrParseError(f"not a readable PDF: {type(exc).__name__}: {exc}") from exc
    with pdf:
        text_chars = sum(1 for page in pdf.pages for c in page.chars if _clean(c["text"]))
        parsed = ParsedPtr(pages=len(pdf.pages), text_chars=text_chars)
        if parsed.scanned:
            return parsed
        try:
            first_text = pdf.pages[0].extract_text() or ""
            name = re.search(r"^Name:\s*(.+)$", first_text, re.M)
            state = re.search(r"^State/District:\s*(\S+)", first_text, re.M)
            parsed.filer_name = name.group(1).strip() if name else None
            parsed.state_district = state.group(1) if state else None
            columns: tuple[Column, float] | None = None
            state = _State()
            for number, page in enumerate(pdf.pages, start=1):
                words = page.extract_words(extra_attrs=["fontname", "size"])
                found = _find_columns(words)
                columns = found or columns
                if columns is None:
                    continue
                # A continuation page with no header repeats the previous page's layout and
                # starts below the page margin instead of below a header.
                header_bottom = found[1] if found else 0.0
                found_rows, ended = _page_transactions(
                    page, number, columns[0], header_bottom, parsed.transactions, state
                )
                parsed.transactions.extend(found_rows)
                if ended:
                    break  # later pages hold investment-vehicle details, IPOs, the signature
        except PtrParseError:
            raise
        except Exception as exc:
            raise PtrParseError(f"{type(exc).__name__}: {exc}") from exc
    if not parsed.transactions:
        raise PtrParseError("the PDF has text but no transaction rows were found")
    problems = validate_rows(parsed.transactions)
    if problems:
        raise PtrParseError("; ".join(problems[:5]))
    return parsed


# A band ("$1,001 - $15,000"), a top band ("Over $50,000,000", or "Spouse/DC Over $1,000,000" for
# an asset of a spouse or dependent child), or an exact figure a filer
# chose to enter ("$823.45"), which is kept as printed and flagged as exact downstream.
AMOUNT_RE = re.compile(r"^((?:Spouse/DC )?Over \$[\d,]+|\$[\d,]+ - \$[\d,]+|\$[\d,]+(?:\.\d{2})?)$")
ASSET_TAIL_RE = re.compile(r"\[[A-Z0-9]{2}\]$")


def validate_rows(rows: list[Transaction]) -> list[str]:
    """Reasons a row is not whole. A trade with a missing cell is worse than no trade."""
    problems: list[str] = []
    for row in rows:
        where = f"row {row.row_number} (page {row.page})"
        if not row.asset:
            problems.append(f"{where}: no asset")
        elif not ASSET_TAIL_RE.search(row.asset):
            problems.append(f"{where}: asset {row.asset[-30:]!r} has no [type] code")
        if not DATE_RE.match(row.notification_date):
            problems.append(f"{where}: notification date {row.notification_date!r}")
        if not AMOUNT_RE.match(row.amount):
            problems.append(f"{where}: amount {row.amount!r}")
    return problems
