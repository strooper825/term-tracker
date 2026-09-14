"""OpenFEC API v1 client: authentication, pagination, and rate limiting.

The key travels in the ``X-Api-Key`` header (api.data.gov convention) so it never appears in a
URL, a log line, or a fixture. Two sliding-window limiters apply: the documented 1,000
requests per hour per key, and the 60 per minute the API reported in its ``X-RateLimit-Limit``
header on first use (2026-09-13). 429 responses are additionally retried with backoff by
:func:`ingest.http.fetch_text`.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any
from urllib.parse import urlencode

import httpx

from ingest.congress_gov import RateLimiter
from ingest.http import USER_AGENT, fetch_text

BASE_URL = "https://api.open.fec.gov/v1"
SITE_URL = "https://www.fec.gov/data"
PER_PAGE = 100
DEFAULT_REQUESTS_PER_HOUR = 1000
DEFAULT_REQUESTS_PER_MINUTE = 60

Fetch = Callable[[str], str]


def candidate_page_url(candidate_id: str, cycle: int) -> str:
    """The public candidate summary page, two-year totals for ``cycle``."""
    return f"{SITE_URL}/candidate/{candidate_id}/?cycle={cycle}&election_full=false"


def committee_page_url(committee_id: str, cycle: int) -> str:
    return f"{SITE_URL}/committee/{committee_id}/?cycle={cycle}"


class FecClient:
    def __init__(
        self,
        api_key: str,
        *,
        fetch: Fetch | None = None,
        hourly: RateLimiter | None = None,
        per_minute: RateLimiter | None = None,
        timeout: float = 60.0,
    ) -> None:
        self._http = httpx.Client(
            headers={"X-Api-Key": api_key, "User-Agent": USER_AGENT},
            timeout=timeout,
            follow_redirects=True,
        )
        self._fetch: Fetch = fetch or (lambda url: fetch_text(url, client=self._http))
        self.hourly = hourly or RateLimiter(DEFAULT_REQUESTS_PER_HOUR)
        self.per_minute = per_minute or RateLimiter(DEFAULT_REQUESTS_PER_MINUTE, 60.0)
        self.requests_made = 0

    @staticmethod
    def url(path: str, **params: Any) -> str:
        # doseq: a list value becomes a repeated parameter (candidate_id=A&candidate_id=B), which
        # is how OpenFEC takes several values; without it the list is sent as its Python repr.
        query = urlencode({k: v for k, v in params.items() if v is not None}, doseq=True)
        return f"{BASE_URL}/{path.strip('/')}/" + (f"?{query}" if query else "")

    def get(self, path: str, **params: Any) -> dict[str, Any]:
        self.hourly.acquire()
        self.per_minute.acquire()
        self.requests_made += 1
        data = json.loads(self._fetch(self.url(path, **params)))
        if not isinstance(data, dict) or not isinstance(data.get("results"), list):
            raise ValueError(f"{path}: expected a JSON object with a results list")
        return data

    def results(self, path: str, **params: Any) -> list[dict[str, Any]]:
        """Every result of a list endpoint, following ``pagination.pages``."""
        items: list[dict[str, Any]] = []
        page = 1
        while True:
            data = self.get(path, per_page=PER_PAGE, page=page, **params)
            items.extend(data["results"])
            pages = (data.get("pagination") or {}).get("pages") or 1
            if page >= pages:
                return items
            page += 1

    def close(self) -> None:
        self._http.close()
