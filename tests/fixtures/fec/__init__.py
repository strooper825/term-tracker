"""Fixture-backed OpenFEC client (no network).

Files are named after the API path with ``/`` replaced by ``__`` plus ``__cycle=N`` when the
request carries a cycle, e.g. ``candidate__H8WI01156__committees__cycle=2026.json``. Page
parameters are ignored (every recorded list fits one page). Recorded 2026-09-13 for the six
tracked members' candidate ids; contact fields were removed (see tests/fixtures/README.md).
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import parse_qs, urlparse

from ingest.congress_gov import RateLimiter
from ingest.fec import BASE_URL, FecClient

FIXTURE_DIR = Path(__file__).resolve().parent
CYCLE = 2026
# bioguide -> (current-office candidate, principal campaign committee) as recorded
PRINCIPAL = {
    "S001213": ("H8WI01156", "C00677286"),
    "C001095": ("S4AR00103", "C00499988"),
    "S000033": ("S4VT00033", "C00411330"),
    "S001208": ("S4MI00470", "C00834218"),
    "K000401": ("H2CA03157", "C00801985"),
    "J000294": ("H2NY10092", "C00503052"),
}
# Every candidate id in the legislators fixture for those members (prior-office ids included)
CANDIDATE_IDS = [
    "H8WI01156",
    "H2AR04083",
    "S4AR00103",
    "H8VT01016",
    "S4VT00033",
    "H8MI08102",
    "S4MI00470",
    "H2CA03157",
    "H2NY10092",
]


def fixture_name(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.removeprefix(urlparse(BASE_URL).path).strip("/")
    cycle = parse_qs(parsed.query).get("cycle", [None])[0]
    return path.replace("/", "__") + (f"__cycle={cycle}" if cycle else "") + ".json"


def fixture_fetch(url: str) -> str:
    path = FIXTURE_DIR / fixture_name(url)
    if not path.exists():
        raise FileNotFoundError(f"no fixture for {url} ({path.name})")
    return path.read_text(encoding="utf-8")


def fixture_client() -> FecClient:
    return FecClient(
        "test-key-not-real",
        fetch=fixture_fetch,
        hourly=RateLimiter(10**6),
        per_minute=RateLimiter(10**6, 60.0),
    )
