"""Census Bureau access shared by the two Census sources: the Data API client and which
Congress's districts each Census product describes.

The Data API takes its key as the ``key`` query parameter (there is no header form), so the key
is in every request URL. This client therefore never logs or raises a URL: requests are
described by :meth:`CensusClient.describe` instead, and an error body is scrubbed before it is
re-raised. (GitHub Actions also masks the secret in run logs, but ``meta.ingest_run.error`` is
stored in the database.)
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable, Sequence
from typing import Any
from urllib.parse import quote, urlencode

import httpx

from ingest.http import USER_AGENT, fetch_text

BASE_URL = "https://api.census.gov/data"
# The API accepts 50 variables per request, and NAME counts as one.
MAX_VARIABLES = 49

# Which Congress's districts each Census product describes. A district number means nothing
# without this: the 119th Congress holds until 2027-01-03, the 120th uses new lines in CA, TX
# and other states (ADR 0016). Add a year only after reading Census's own statement of the
# boundaries it uses; an unknown year stops the run rather than guessing.
#   Boundary files: the GENZ vintage year names the Congress of the cd file in it
#   (https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_cd119_500k.zip).
#   ACS 5-year: "Congressional district data in the 2020-2024 release are based on the 119th
#   Congress" (https://www.census.gov/data/developers/data-sets/acs-5year.html, read 2026-09-20).
GEOGRAPHY_CONGRESS: dict[int, int] = {2025: 119}
ACS_CONGRESS: dict[int, int] = {2024: 119}

Fetch = Callable[[str], str]


class _RedactKey(logging.Filter):
    """httpx logs every request URL at INFO, and a Census URL carries the key: mask it."""

    _KEY = re.compile(r"([?&]key=)[^&\s\"']+")  # the value runs to the next & or whitespace

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if "key=" in message:
            record.msg, record.args = self._KEY.sub(r"\1***", message), None
        return True


def _install_redaction() -> None:
    logger = logging.getLogger("httpx")
    if not any(isinstance(f, _RedactKey) for f in logger.filters):
        logger.addFilter(_RedactKey())


_install_redaction()


class SourceShapeError(RuntimeError):
    """A Census response does not have the shape the pipeline expects. Stop and report."""


def congress_for(table: dict[int, int], year: int, what: str) -> int:
    try:
        return table[year]
    except KeyError:
        known = ", ".join(str(y) for y in sorted(table))
        raise SourceShapeError(
            f"{what} {year} is not in the table of years whose Congress is known ({known}); "
            "check which Congress's districts it describes on census.gov, then add it to "
            "ingest/census.py and write an ADR if the boundaries changed (ADR 0016)."
        ) from None


# `for=` and `in=` clauses of the two geographies the Constituency tab needs.
GEOGRAPHIES: dict[str, list[tuple[str, str]]] = {
    "state": [("for", "state:*")],
    "district": [("for", "congressional district:*"), ("in", "state:*")],
}


class CensusClient:
    def __init__(self, api_key: str, *, fetch: Fetch | None = None, timeout: float = 120.0) -> None:
        self._key = api_key
        self._http = httpx.Client(
            headers={"User-Agent": USER_AGENT}, timeout=timeout, follow_redirects=True
        )
        self._fetch: Fetch = fetch or self._http_fetch
        self.requests_made = 0

    def _http_fetch(self, url: str) -> str:
        return fetch_text(url, client=self._http, log_url=url.replace(self._key, "***"))

    @staticmethod
    def describe(path: str, geography: str) -> str:
        return f"{BASE_URL}/{path.strip('/')} ({geography})"

    def url(self, path: str, variables: Sequence[str], geography: str) -> str:
        if geography not in GEOGRAPHIES:
            raise ValueError(f"unknown geography {geography!r}")
        params = [("get", ",".join(["NAME", *variables])), *GEOGRAPHIES[geography]]
        params.append(("key", self._key))
        # spaces as %20 ("congressional district"); commas, colons and * left as they are
        return f"{BASE_URL}/{path.strip('/')}?" + urlencode(params, quote_via=quote, safe=",:*")

    def table(
        self, path: str, variables: Sequence[str], geography: str
    ) -> list[dict[str, str | None]]:
        """One dict per geography for the variables, straight from the API's array-of-arrays."""
        if len(variables) > MAX_VARIABLES:
            raise ValueError(f"{len(variables)} variables; the API allows {MAX_VARIABLES} and NAME")
        where = self.describe(path, geography)
        self.requests_made += 1
        try:
            body = self._fetch(self.url(path, variables, geography))
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:200].replace(self._key, "***")
            raise RuntimeError(f"{where}: HTTP {exc.response.status_code}: {detail}") from None
        try:
            data = json.loads(body)
        except ValueError:
            raise SourceShapeError(
                f"{where}: response is not JSON: {body[:120].replace(self._key, '***')!r}"
            ) from None
        return _rows(data, ["NAME", *variables], geography, where)

    def close(self) -> None:
        self._http.close()


def _rows(
    data: Any, expected: list[str], geography: str, where: str
) -> list[dict[str, str | None]]:
    if not isinstance(data, list) or len(data) < 2 or not all(isinstance(r, list) for r in data):
        raise SourceShapeError(f"{where}: expected a header row and at least one data row")
    header = data[0]
    geo_columns = ["state"] if geography == "state" else ["state", "congressional district"]
    missing = [c for c in [*expected, *geo_columns] if c not in header]
    if missing:
        raise SourceShapeError(f"{where}: columns missing from the response: {missing}")
    rows = []
    for values in data[1:]:
        if len(values) != len(header):
            raise SourceShapeError(f"{where}: a row has {len(values)} values for {len(header)}")
        rows.append(dict(zip(header, values, strict=True)))
    return rows


def geoid(row: dict[str, str | None]) -> str:
    """State FIPS, plus the two-digit district code for a district row: ``55``, ``5501``."""
    return f"{row['state']}{row.get('congressional district') or ''}"
