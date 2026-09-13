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
# (bill_type, bill_number) of every bill or amendment in the fixtures; e2e assertions are
# scoped to these so they hold on a database that also holds live data.
FIXTURE_BILLS = [
    ("hr", "4735"),
    ("hres", "150"),
    ("hamdt", "9"),
    ("hr", "5269"),
    ("hr", "1502"),
    ("s", "2274"),
    ("samdt", "6683"),
    ("sres", "837"),
    ("samdt", "6747"),
    ("s", "5337"),
]
# Bills referenced by the vote fixtures (detail only); fetched by the roll-call phase of the loader.
ROLL_CALL_FIXTURE_BILLS = [("hr", "3424"), ("hr", "276"), ("s", "5"), ("sjres", "13")]
FIXTURE_BILLS_SQL = (
    "(bill_type, bill_number) IN (" + ", ".join(f"('{t}', '{n}')" for t, n in FIXTURE_BILLS) + ")"
)


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


def roll_call_fixtures_cover(conn) -> bool:
    """True when every roll-call bill in the database has a detail fixture.

    On a fixture-only database (CI) this holds; on a database that also holds live roll calls
    it does not, and the roll-call phase must be skipped to keep the loader off the network.
    """
    from ingest.sources.congress_gov import roll_call_legislation_keys

    keys = roll_call_legislation_keys(conn, CONGRESS)
    return all(
        (FIXTURE_DIR / f"bill__{k.congress}__{k.bill_type}__{k.bill_number}.json").exists()
        for k in keys
    )
