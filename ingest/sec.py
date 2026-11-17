"""Reading a company's industry from the SEC (ADR 0032).

Two public files, both JSON and free:

* ``https://www.sec.gov/files/company_tickers.json``: every ticker the SEC lists, with the
  company's Central Index Key (CIK) and name. About a megabyte; read once a run.
* ``https://data.sec.gov/submissions/CIK##########.json``: one company's filing record, which
  carries its Standard Industrial Classification code (``sic``) and its description
  (``sicDescription``).

The SEC's fair-access policy asks automated clients to declare who they are and how to reach
them in the User-Agent, and to stay under ten requests a second. :class:`SecClient` sends the
project name and the contact address the owner chose (``SEC_CONTACT_EMAIL``), and keeps to five
a second.

Tickers are compared in one form: upper case, with a class separator written as ``-``
(``BRK.B``, ``BRK/B`` and ``BRK-B`` are the same share class).
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

from ingest.congress_gov import RateLimiter
from ingest.http import fetch_response
from ingest.shape import SourceShapeError

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
Fetch = Callable[[str], bytes]


def user_agent(contact: str) -> str:
    return f"Term (term-tracker) {contact}"


def normalise_ticker(ticker: str) -> str:
    return re.sub(r"[./]", "-", ticker.strip().upper())


class SecClient:
    """Throttled fetcher for the SEC's JSON files, declaring the project's contact address."""

    def __init__(
        self,
        contact: str,
        *,
        fetch: Fetch | None = None,
        limiter: RateLimiter | None = None,
    ) -> None:
        self._http = httpx.Client(
            headers={"User-Agent": user_agent(contact), "Accept-Encoding": "gzip, deflate"},
            timeout=60.0,
            follow_redirects=True,
        )
        self._fetch: Fetch = fetch or (lambda url: fetch_response(url, client=self._http).content)
        self.limiter = limiter or RateLimiter(5, period_seconds=1.0)
        self.requests_made = 0

    def get_json(self, url: str) -> Any:
        self.limiter.acquire()
        self.requests_made += 1
        try:
            return json.loads(self._fetch(url))
        except json.JSONDecodeError as exc:
            raise SourceShapeError(f"{url}: not JSON ({exc})") from exc

    def close(self) -> None:
        self._http.close()


def parse_tickers(data: Any) -> dict[str, tuple[int, str]]:
    """``company_tickers.json`` as {normalised ticker: (CIK, company name)}."""
    if not isinstance(data, dict) or not data:
        raise SourceShapeError(f"{TICKERS_URL}: expected an object of companies")
    out: dict[str, tuple[int, str]] = {}
    for key, row in data.items():
        try:
            out[normalise_ticker(row["ticker"])] = (int(row["cik_str"]), str(row["title"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise SourceShapeError(f"{TICKERS_URL}: entry {key} is {row!r}") from exc
    return out


@dataclass(frozen=True)
class Company:
    cik: int
    name: str
    sic: str | None
    sic_description: str | None
    tickers: tuple[str, ...]


def parse_submissions(data: Any, cik: int) -> Company:
    """The industry fields of one company's submissions file. A company with no SIC code (a fund,
    a trust) is kept with ``sic`` null: it has no industry to compare."""
    url = SUBMISSIONS_URL.format(cik=cik)
    if not isinstance(data, dict) or "name" not in data:
        raise SourceShapeError(f"{url}: expected a company record")
    sic = str(data.get("sic") or "").strip() or None
    if sic is not None and not re.fullmatch(r"\d{4}", sic):
        raise SourceShapeError(f"{url}: SIC code {sic!r} is not four digits")
    return Company(
        cik=cik,
        name=str(data["name"]),
        sic=sic,
        sic_description=(str(data.get("sicDescription") or "").strip() or None),
        tickers=tuple(str(t) for t in data.get("tickers") or ()),
    )
