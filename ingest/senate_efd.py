"""Senate eFD client and readers: periodic transaction reports of senators (ADR 0026).

``efdsearch.senate.gov`` is a Django site. Reading it takes four kinds of request, each with this
project's own User-Agent:

1. ``GET /search/home/``: the statement a visitor must agree to before searching (the uses
   5 U.S.C. 13107 forbids: commercial purposes, credit ratings, solicitation). Its form carries
   a CSRF token.
2. ``POST /search/home/`` with ``prohibition_agreement=1``: the agreement. The owner decided on
   2026-11-16 that this site, a non-commercial public-information site, agrees to it on every
   run. The answer is a redirect to ``/search/``.
3. ``POST /search/report/data/``: the search behind the results table, as JSON, 100 rows a page.
   One query: periodic transaction reports (report type 11) submitted since the tracked Congress
   began, every filer. Each row is ``[first, last, office, link, filed]``.
4. ``GET /search/view/ptr/{uuid}/`` (an electronic report: an HTML table) or
   ``GET /search/view/paper/{uuid}/`` (a paper report: page images, nothing to read).

Every cell is kept as the page prints it; dbt reads dates, amounts and codes from the strings.
An electronic report states its own transaction count ("(7 transactions total)"); a report
whose table does not read back as that many whole rows raises :class:`EfdParseError`, which the
loader stores as ``failed`` for a person to look at, as the House reader does.

eFD amendments ("Periodic Transaction Report for 12/08/2025 (Amendment 1)") do not say which
report they amend, and a senator may file two reports for the same day. Seen on 2026-11-16, an
amendment restates one original in full: Boozman's amendment of his 12/08/2025 report shares 13
of its 14 rows with one of that day's two reports and none with the other. :func:`amended_report`
picks the original by those shared rows and refuses to guess when they do not decide it.

senate.gov has refused GitHub's runners outright before (ADR 0020). A 403 at any step raises
:class:`ingest.http.SourceUnavailable`, so the nightly carries on with the rows already held.
"""

from __future__ import annotations

import html
import json
import re
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

import httpx

from ingest.congress_gov import RateLimiter
from ingest.http import RETRY_STATUSES, USER_AGENT, SourceUnavailable

BASE_URL = "https://efdsearch.senate.gov"
HOME_PATH = "/search/home/"
SEARCH_PATH = "/search/"
DATA_PATH = "/search/report/data/"
PTR_REPORT_TYPE = 11
ANNUAL_REPORT_TYPE = 7  # annual, new filer, termination and candidate reports (ADR 0027)
EXTENSION_REPORT_TYPE = 10  # due-date extensions
SENATOR_FILER_TYPE = 1
PAGE_SIZE = 100

TITLE_RE = re.compile(
    r"^Periodic Transaction Report for (\d{2}/\d{2}/\d{4})(?: \(Amendment(?: (\d+))?\))?$"
)
LINK_RE = re.compile(r'href="(/search/view/(ptr|paper)/([0-9a-f-]{36})/)"')
TOKEN_RE = re.compile(r'name="csrfmiddlewaretoken" value="([^"]+)"')
TOTAL_RE = re.compile(r"\((\d+) transactions? total\)")
FILED_RE = re.compile(r"Filed\s+(\d{2}/\d{2}/\d{4} @ \d{1,2}:\d{2} [AP]M)")
DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
CELL_COUNT = 9  # #, transaction date, owner, ticker, asset name, asset type, type, amount, comment


class SourceShapeError(RuntimeError):
    """eFD does not have the shape ADR 0026 expects. Stop and report."""


class EfdParseError(RuntimeError):
    """An electronic report whose transaction table did not read back as whole rows."""


def report_url(path: str) -> str:
    return BASE_URL + path


# --- the client ---------------------------------------------------------------------------------


class EfdClient:
    """Session with eFD: agree to the statement once, then search and read reports.

    One request a second. A 403 is senate.gov refusing this client (SourceUnavailable); a
    redirect back to the statement means the session lapsed, so the client agrees again once.
    ``transport`` lets the tests answer from fixtures.
    """

    def __init__(
        self,
        *,
        transport: httpx.BaseTransport | None = None,
        limiter: RateLimiter | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._http = httpx.Client(
            base_url=BASE_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=60.0,
            follow_redirects=False,
            transport=transport,
        )
        self.limiter = limiter or RateLimiter(1, period_seconds=1.0)
        self._sleep = sleep
        self.requests_made = 0
        self.bytes_fetched = 0
        self._agreed = False

    def close(self) -> None:
        self._http.close()

    def _send(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        delay = 1.0
        for attempt in range(6):
            self.limiter.acquire()
            self.requests_made += 1
            try:
                response = self._http.request(method, path, **kwargs)
            except httpx.TransportError:
                if attempt == 5:
                    raise
                self._sleep(delay)
                delay *= 2
                continue
            if response.status_code == 403:
                raise SourceUnavailable(
                    f"{BASE_URL}{path} answered HTTP 403: senate.gov is refusing this client"
                )
            if response.status_code in RETRY_STATUSES and attempt < 5:
                self._sleep(delay)
                delay *= 2
                continue
            self.bytes_fetched += len(response.content)
            return response
        raise RuntimeError("unreachable")  # pragma: no cover

    def agree(self) -> None:
        """Accept the statement on /search/home/ (see the module docstring)."""
        home = self._send("GET", HOME_PATH)
        home.raise_for_status()
        token = TOKEN_RE.search(home.text)
        if token is None:
            raise SourceShapeError(f"{HOME_PATH}: no CSRF token in the agreement form")
        answer = self._send(
            "POST",
            HOME_PATH,
            data={"prohibition_agreement": "1", "csrfmiddlewaretoken": token.group(1)},
            headers={"Referer": BASE_URL + HOME_PATH},
        )
        if not (answer.is_redirect and answer.headers.get("location", "").endswith(SEARCH_PATH)):
            raise SourceShapeError(
                f"{HOME_PATH}: agreeing answered {answer.status_code} "
                f"{answer.headers.get('location', '')!r}, not a redirect to {SEARCH_PATH}"
            )
        self._agreed = True

    def _lapsed(self, response: httpx.Response) -> bool:
        return response.is_redirect and HOME_PATH in response.headers.get("location", "")

    def search_page(
        self,
        since: date,
        start: int,
        report_types: Sequence[int] = (PTR_REPORT_TYPE,),
        filer_types: Sequence[int] = (),
    ) -> dict[str, Any]:
        """One page of the search: reports of ``report_types`` submitted on or after ``since``,
        by ``filer_types`` (every filer when empty). The default is the PTR search."""
        if not self._agreed:
            self.agree()
        form = {
            "start": str(start),
            "length": str(PAGE_SIZE),
            "report_types": "[" + ", ".join(str(n) for n in report_types) + "]",
            "filer_types": "[" + ", ".join(str(n) for n in filer_types) + "]",
            "submitted_start_date": since.strftime("%m/%d/%Y 00:00:00"),
            "submitted_end_date": "",
            "candidate_state": "",
            "senator_state": "",
            "office_id": "",
            "first_name": "",
            "last_name": "",
        }
        for attempt in range(2):
            csrf = self._http.cookies.get("csrftoken") or ""
            response = self._send(
                "POST",
                DATA_PATH,
                data={**form, "csrfmiddlewaretoken": csrf},
                headers={"Referer": BASE_URL + SEARCH_PATH, "X-CSRFToken": csrf},
            )
            if self._lapsed(response) and attempt == 0:
                self.agree()
                continue
            response.raise_for_status()
            try:
                payload = json.loads(response.text)
            except ValueError as exc:
                raise SourceShapeError(f"{DATA_PATH}: the search did not answer JSON") from exc
            if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
                raise SourceShapeError(f"{DATA_PATH}: no data list in the answer")
            return payload
        raise SourceShapeError(f"{DATA_PATH}: sent back to the statement twice")

    def report(self, path: str) -> str:
        """The page of one report."""
        if not self._agreed:
            self.agree()
        for attempt in range(2):
            response = self._send("GET", path, headers={"Referer": BASE_URL + SEARCH_PATH})
            if self._lapsed(response) and attempt == 0:
                self.agree()
                continue
            response.raise_for_status()
            return response.text
        raise SourceShapeError(f"{path}: sent back to the statement twice")


# --- the search ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class SearchRow:
    first: str
    last: str
    office: str
    title: str
    path: str
    report_id: str
    kind: str  # "ptr" (electronic) or "paper"
    filed: str  # m/d/yyyy as the search prints it
    report_for: str  # the date in the title
    amendment: int  # 0 for an original; "(Amendment)" with no number counts as 1

    def as_payload(self) -> dict[str, Any]:
        return {
            "first": self.first,
            "last": self.last,
            "office": self.office,
            "title": self.title,
            "filed": self.filed,
            "report_for": self.report_for,
            "amendment": self.amendment,
            "kind": self.kind,
        }


def _text(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def parse_search_rows(payload: Mapping[str, Any]) -> list[SearchRow]:
    """Every row of one search page. A row of another shape stops the run."""
    rows: list[SearchRow] = []
    for number, cells in enumerate(payload.get("data", []), start=1):
        where = f"{DATA_PATH} row {number}"
        if not isinstance(cells, list) or len(cells) != 5:
            raise SourceShapeError(f"{where}: expected 5 cells, got {cells!r}"[:300])
        first, last, office, link, filed = (str(c) for c in cells)
        found = LINK_RE.search(link)
        title = _text(link)
        heading = TITLE_RE.match(title)
        if found is None or heading is None or not DATE_RE.match(filed.strip()):
            raise SourceShapeError(
                f"{where}: not a periodic transaction report row: {cells!r}"[:300]
            )
        number_text = heading.group(2)
        is_amendment = "(Amendment" in title
        rows.append(
            SearchRow(
                first=" ".join(first.split()),
                last=" ".join(last.split()),
                office=" ".join(office.split()),
                title=title,
                path=found.group(1),
                kind=found.group(2),
                report_id=found.group(3),
                filed=filed.strip(),
                report_for=heading.group(1),
                amendment=int(number_text) if number_text else (1 if is_amendment else 0),
            )
        )
    return rows


def is_sitting_senator(row: SearchRow) -> bool:
    """The office a sitting senator files under: "(Senator)", or "Senator" on paper rows.
    "(Former Senator)" and candidates are not tracked members."""
    return row.office.endswith("(Senator)") or row.office == "Senator"


# --- one report ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class EfdTransaction:
    row_number: int
    transaction_date: str
    owner: str
    ticker: str | None
    asset_name: str
    asset_detail: dict[str, str]
    asset_type: str
    type: str
    amount: str
    comment: str | None

    def as_payload(self) -> dict[str, Any]:
        return {
            "transaction_date": self.transaction_date,
            "owner": self.owner,
            "ticker": self.ticker,
            "asset_name": self.asset_name,
            "asset_detail": self.asset_detail,
            "asset_type": self.asset_type,
            "type": self.type,
            "amount": self.amount,
            "comment": self.comment,
        }

    def key(self) -> tuple[str, ...]:
        """What makes two reports' rows the same trade: everything the filer entered."""
        return (
            self.transaction_date,
            self.owner,
            self.ticker or "",
            self.asset_name,
            self.asset_type,
            self.type,
            self.amount,
        )


@dataclass
class EfdReport:
    title: str
    filer: str
    filed_at: str | None
    stated_total: int
    transactions: list[EfdTransaction] = field(default_factory=list)


def _blank(value: str) -> str | None:
    return None if value in ("", "--") else value


def _asset_cell(fragment: str) -> tuple[str, dict[str, str]]:
    """The asset name, and the labelled details eFD prints under a bond or an option
    (``<em>Rate/Coupon:</em> 5.6%<br> <em>Matures:</em> 2033-09-15``)."""
    detail: dict[str, str] = {}
    name = fragment
    block = re.search(r'<div class="text-muted">(.*?)</div>', fragment, re.S)
    if block:
        name = fragment[: block.start()] + fragment[block.end() :]
        for label, value in re.findall(r"<em>(.*?)</em>(.*?)(?=<em>|$)", block.group(1), re.S):
            detail[_text(label).rstrip(":")] = _text(value)
    return _text(name), detail


def parse_ptr(page: str) -> EfdReport:
    """An electronic report's header and every transaction row, in the report's own order."""
    heading = re.search(r'<h1 class="mb-2">(.*?)</h1>', page, re.S)
    filer = re.search(r'<h2 class="filedReport">(.*?)</h2>', page, re.S)
    total = TOTAL_RE.search(page)
    if heading is None or filer is None or total is None:
        raise EfdParseError("the report header (title, filer, transaction count) is missing")
    title = _text(heading.group(1))
    if not TITLE_RE.match(title):
        raise EfdParseError(f"not a periodic transaction report: {title!r}")
    body = re.search(r"<tbody>(.*?)</tbody>", page, re.S)
    rows_html = re.findall(r"<tr[^>]*>(.*?)</tr>", body.group(1), re.S) if body else []
    transactions: list[EfdTransaction] = []
    for row_html in rows_html:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.S)
        if len(cells) != CELL_COUNT:
            raise EfdParseError(f"a transaction row has {len(cells)} cells, not {CELL_COUNT}")
        number, when, owner, ticker, asset, asset_type, kind, amount, comment = cells
        name, detail = _asset_cell(asset)
        row_number = _text(number)
        if not row_number.isdigit() or not DATE_RE.match(_text(when)):
            raise EfdParseError(f"row {row_number!r}: no row number or transaction date")
        transactions.append(
            EfdTransaction(
                row_number=int(row_number),
                transaction_date=_text(when),
                owner=_text(owner),
                ticker=_blank(_text(ticker)),
                asset_name=name,
                asset_detail=detail,
                asset_type=_text(asset_type),
                type=_text(kind),
                amount=_text(amount),
                comment=_blank(_text(comment)),
            )
        )
    stated = int(total.group(1))
    if len(transactions) != stated:
        raise EfdParseError(f"the report states {stated} transactions; {len(transactions)} read")
    if sorted(t.row_number for t in transactions) != list(range(1, stated + 1)):
        raise EfdParseError("the row numbers are not 1 to the stated count")
    filed = FILED_RE.search(page)
    return EfdReport(
        title=title,
        filer=_text(filer.group(1)),
        filed_at=filed.group(1) if filed else None,
        stated_total=stated,
        transactions=sorted(transactions, key=lambda t: t.row_number),
    )


def paper_pages(page: str) -> int:
    """How many page images a paper report shows."""
    return len(re.findall(r'class="filingImage"', page))


# --- amendments ---------------------------------------------------------------------------------


def amended_report(
    amendment: Sequence[tuple[str, ...]], candidates: Mapping[str, Sequence[tuple[str, ...]]]
) -> tuple[str | None, str]:
    """The report an amendment replaces, chosen by the rows they share, and why.

    ``candidates`` maps a report id to its row keys: the same filer's earlier reports for the
    same date that nothing has replaced yet. The one sharing the most rows wins only if it
    shares at least half the amendment's rows and strictly more than any other; otherwise no
    report is chosen and the reason says why, so both stay listed and a test flags it.
    """
    if not candidates:
        return None, "no earlier report for the same date"
    mine = set(amendment)
    shared = sorted(
        ((len(mine & set(rows)), report_id) for report_id, rows in candidates.items()),
        reverse=True,
    )
    best, best_id = shared[0]
    runner_up = shared[1][0] if len(shared) > 1 else -1
    if best == 0 or best * 2 < len(mine):
        return None, f"shares {best} of {len(mine)} rows with the closest earlier report"
    if best == runner_up:
        return None, f"two earlier reports share {best} rows each"
    return best_id, f"shares {best} of {len(mine)} rows"
