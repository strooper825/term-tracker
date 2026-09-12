"""Fixture-backed Congress.gov client (no network).

Files are named after the API path with ``/`` replaced by ``__``, plus ``__offset=N`` for a
later page, e.g. ``member__C001095__cosponsored-legislation__offset=250.json``.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import parse_qs, urlparse

from ingest.congress_gov import BASE_URL, CongressGovClient, RateLimiter

FIXTURE_DIR = Path(__file__).resolve().parent
TRACKED = ["S001213", "C001095"]
CONGRESS = 119


def fixture_name(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.removeprefix(urlparse(BASE_URL).path).strip("/")
    offset = int(parse_qs(parsed.query).get("offset", ["0"])[0])
    return path.replace("/", "__") + (f"__offset={offset}" if offset else "") + ".json"


def fixture_fetch(url: str) -> str:
    path = FIXTURE_DIR / fixture_name(url)
    if not path.exists():
        raise FileNotFoundError(f"no fixture for {url} ({path.name})")
    return path.read_text(encoding="utf-8")


def fixture_client() -> CongressGovClient:
    return CongressGovClient("test-key-not-real", fetch=fixture_fetch, limiter=RateLimiter(10**6))
