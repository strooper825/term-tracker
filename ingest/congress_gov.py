"""Congress.gov API v3 client: authentication, pagination, and the hourly rate limit.

The key travels in the ``X-Api-Key`` header (api.data.gov convention) so it never appears in
a URL, a log line, or a fixture. Requests are throttled by a sliding-window limiter sized to
the documented 5,000 requests per hour per key (plan section 3, principle 4); 429 responses
are additionally retried with backoff by :func:`ingest.http.fetch_text`.
"""

from __future__ import annotations

import json
import re
import time
from collections import deque
from collections.abc import Callable, Iterator
from typing import Any, NamedTuple
from urllib.parse import urlencode

import httpx

from ingest.http import USER_AGENT, fetch_text

BASE_URL = "https://api.congress.gov/v3"
PAGE_SIZE = 250
DEFAULT_REQUESTS_PER_HOUR = 5000

Fetch = Callable[[str], str]


class RateLimiter:
    """Allow at most ``max_requests`` calls in any rolling ``period_seconds`` window."""

    def __init__(
        self,
        max_requests: int,
        period_seconds: float = 3600.0,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.max_requests = max_requests
        self.period = period_seconds
        self._clock = clock
        self._sleep = sleep
        self._times: deque[float] = deque()

    def _prune(self, now: float) -> None:
        while self._times and now - self._times[0] >= self.period:
            self._times.popleft()

    def acquire(self) -> None:
        now = self._clock()
        self._prune(now)
        if len(self._times) >= self.max_requests:
            wait = self.period - (now - self._times[0])
            self._sleep(max(wait, 0.0))
            now = self._clock()
            self._prune(now)
        self._times.append(now)


class LegislationKey(NamedTuple):
    kind: str  # bill or amendment
    congress: int
    bill_type: str  # lower case: hr, s, hres, ..., hamdt, samdt
    bill_number: str

    @property
    def path(self) -> str:
        return f"{self.kind}/{self.congress}/{self.bill_type}/{self.bill_number}"


_URL_RE = re.compile(r"/v3/(bill|amendment)/(\d+)/([a-z]+)/(\d+)(?:[/?]|$)")


def parse_legislation_url(url: str) -> LegislationKey:
    """Natural key from an API URL such as .../v3/bill/119/hr/4735?format=json."""
    match = _URL_RE.search(url)
    if match is None:
        raise ValueError(f"not a Congress.gov bill or amendment URL: {url}")
    kind, congress, bill_type, number = match.groups()
    return LegislationKey(kind, int(congress), bill_type, number)


class CongressGovClient:
    def __init__(
        self,
        api_key: str,
        *,
        fetch: Fetch | None = None,
        limiter: RateLimiter | None = None,
        timeout: float = 60.0,
    ) -> None:
        self._http = httpx.Client(
            headers={"X-Api-Key": api_key, "User-Agent": USER_AGENT},
            timeout=timeout,
            follow_redirects=True,
        )
        self._fetch: Fetch = fetch or (lambda url: fetch_text(url, client=self._http))
        self.limiter = limiter or RateLimiter(DEFAULT_REQUESTS_PER_HOUR)
        self.requests_made = 0

    @staticmethod
    def url(path: str, **params: Any) -> str:
        query = {"format": "json", **{k: v for k, v in params.items() if v is not None}}
        return f"{BASE_URL}/{path.lstrip('/')}?{urlencode(query)}"

    def get(self, path: str, **params: Any) -> dict[str, Any]:
        self.limiter.acquire()
        self.requests_made += 1
        data = json.loads(self._fetch(self.url(path, **params)))
        if not isinstance(data, dict):
            raise ValueError(f"{path}: expected a JSON object")
        return data

    def paginate(self, path: str, items_key: str) -> Iterator[dict[str, Any]]:
        """Yield every item of a list endpoint, following ``pagination.next``."""
        offset = 0
        while True:
            page = self.get(path, limit=PAGE_SIZE, offset=offset or None)
            items = page.get(items_key)
            if not isinstance(items, list):
                raise ValueError(f"{path}: expected list under {items_key!r}, keys={list(page)}")
            yield from items
            if not (page.get("pagination") or {}).get("next"):
                return
            offset += PAGE_SIZE

    def close(self) -> None:
        self._http.close()
