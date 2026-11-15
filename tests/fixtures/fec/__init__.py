"""Fixture-backed OpenFEC client (no network).

Files are named after the API path with ``/`` replaced by ``__`` plus ``__cycle=N`` when the
request carries a cycle, e.g. ``candidate__H8WI01156__committees__cycle=2026.json``. Page
parameters are ignored (every recorded list fits one page). Recorded 2026-09-13 for the six
tracked members' candidate ids; contact fields were removed (see tests/fixtures/README.md).

The loader asks for many ids at a time (``/candidates/``, ``/committees/``,
``/totals/house-senate/``). Those answers are put together here from the per-record files:
on 2026-11-15 the batched endpoints returned the same records, field for field the pipeline
declares, for all twenty tracked members. An id with no file is left out, as the API leaves
out an id it does not know.
"""

from __future__ import annotations

import json
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


def _recorded(name: str) -> list[dict]:
    path = FIXTURE_DIR / name
    return json.loads(path.read_text(encoding="utf-8"))["results"] if path.exists() else []


def _batched(url: str) -> list[dict] | None:
    """The results of a many-ids request, or None when ``url`` is a per-record address."""
    parsed = urlparse(url)
    path = parsed.path.removeprefix(urlparse(BASE_URL).path).strip("/")
    query = parse_qs(parsed.query)
    cycle = query.get("cycle", [None])[0]
    if path == "candidates":
        return [r for i in query["candidate_id"] for r in _recorded(f"candidate__{i}.json")]
    if path == "committees":
        found = {
            r["committee_id"]: r
            for i in query["candidate_id"]
            for r in _recorded(f"candidate__{i}__committees__cycle={cycle}.json")
        }
        return list(found.values())
    if path == "totals/house-senate":
        return [
            r
            for i in query["committee_id"]
            for r in _recorded(f"committee__{i}__totals__cycle={cycle}.json")
        ]
    return None


def fixture_fetch(url: str) -> str:
    batched = _batched(url)
    if batched is not None:
        return json.dumps({"results": batched, "pagination": {"pages": 1}})
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
