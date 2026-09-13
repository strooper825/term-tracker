"""Fixture-backed clients for the two vote sources (no network).

House files follow the Congress.gov convention (path with ``/`` as ``__``, ``__offset=N`` for
later pages). Senate files are the path under the LIS base with ``/`` as ``__``. A missing
Senate menu is served as an HTTP 404 here; senate.gov itself answers with a 302 redirect to a
file-not-found page, and the loader treats both as the end of the session list.
"""

from __future__ import annotations

from pathlib import Path

import httpx

from ingest.congress_gov import CongressGovClient, RateLimiter
from ingest.sources import senate_votes
from tests.fixtures.congress_gov import fixture_name as congress_gov_fixture_name

FIXTURE_DIR = Path(__file__).resolve().parent
CONGRESS = 119


def house_fixture_fetch(url: str) -> str:
    path = FIXTURE_DIR / congress_gov_fixture_name(url)
    if not path.exists():
        raise FileNotFoundError(f"no fixture for {url} ({path.name})")
    return path.read_text(encoding="utf-8")


def house_client() -> CongressGovClient:
    return CongressGovClient(
        "test-key-not-real", fetch=house_fixture_fetch, limiter=RateLimiter(10**6)
    )


def senate_fixture_fetch(url: str) -> str:
    name = url.removeprefix(senate_votes.BASE_URL).replace("/", "__")
    path = FIXTURE_DIR / name
    if not path.exists():
        request = httpx.Request("GET", url)
        raise httpx.HTTPStatusError(
            f"404 for {url}", request=request, response=httpx.Response(404, request=request)
        )
    return path.read_text(encoding="utf-8")


def senate_client() -> senate_votes.SenateGovClient:
    return senate_votes.SenateGovClient(fetch=senate_fixture_fetch, limiter=RateLimiter(10**6))
