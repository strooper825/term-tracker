"""Source: where each tracked member's press releases are, found by probing the official site.

``seed.statement_sources`` is a list of exceptions a person checked (ADR 0015, ADR 0023). Every
other tracked member's Public statements tab links out: to the office's press page when this
probe finds one, else to the official website. Nothing is copied from these sites.

For each such member the probe takes the official website from ``raw.legislator`` (the latest
term's ``url``) and asks for a short list of paths offices are known to use (:data:`PATHS`),
most specific first. The first path that answers with a press listing wins: HTTP 200, still on
the office's own host after redirects, at an address that reads as a listing (the path asked
for, or one with "press-release" in it, and no date in it), and the words "press release" in
the page. Sites send an unknown path to all sorts of places: on 2026-11-15 the looser rule
"anywhere but the home page" accepted a newsletter thank-you page and two posts from 2011 and
2016 among 70 sites. The result is stored in ``raw.press_page``, one row per member:

* ``found``: ``press_url`` is the address that answered.
* ``not_found``: the site answered but no path was a press listing.
* ``disallowed``: robots.txt forbids every path to this reader; nothing was asked for.
* ``unreachable``: the site refused or did not answer (senate.gov has refused GitHub's
  runners for weeks at a time, ADR 0020). Nothing is known, so the site is asked again on the
  next run and a ``found`` row already held is kept.

A settled result (the first three) is asked again after :data:`RECHECK_AFTER`; a member with
no row is probed on the next run. So a run costs requests only for new members, for sites that
did not answer, and once a month for everyone. One request a second, the project's own user
agent, robots.txt honoured per path. No site's failure fails the run.
"""

from __future__ import annotations

import logging
import re
import urllib.robotparser
from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta
from typing import NamedTuple
from urllib.parse import urlsplit

import httpx
from psycopg import Connection
from psycopg.types.json import Jsonb

from ingest.congress_gov import RateLimiter
from ingest.db import connect
from ingest.http import USER_AGENT
from ingest.load import record_run, upsert
from ingest.sources.congress_gov import tracked_member_ids

log = logging.getLogger("ingest.press_pages")

SOURCE = "press_pages"
SOURCE_URL = "https://github.com/unitedstates/congress-legislators"
# Paths seen on office sites (the twenty hand-checked rows of seed.statement_sources, and the
# survey in docs/research), most specific first: a generic /news can be a blog or a clippings
# page, so it is tried only after every press-release path.
PATHS = (
    "/media/press-releases",
    "/media-center/press-releases",
    "/news/press-releases",
    "/newsroom/press-releases",
    "/press-releases",
    "/category/press-releases",
    "/public/index.cfm/press-releases",
    "/public/index.cfm/pressreleases",
    "/news",
    "/newsroom",
    "/media",
)
MARKER = "press release"
DATED = re.compile(r"/(19|20)\d\d/")
RECHECK_AFTER = timedelta(days=30)
REFUSED = frozenset({401, 403, 429})


class Page(NamedTuple):
    status: int
    url: str  # after redirects
    text: str


class Result(NamedTuple):
    outcome: str  # found / not_found / disallowed / unreachable
    press_url: str | None
    detail: str


class Target(NamedTuple):
    bioguide_id: str
    site_url: str


Get = Callable[[str], Page]


class SiteClient:
    """One GET, redirects followed, no retries: a probe that fails is simply asked again."""

    def __init__(self, *, get: Get | None = None, limiter: RateLimiter | None = None) -> None:
        self._http = httpx.Client(
            headers={"User-Agent": USER_AGENT}, timeout=20.0, follow_redirects=True
        )
        self._get: Get = get or self._http_get
        self.limiter = limiter or RateLimiter(60, period_seconds=60.0)
        self.requests_made = 0

    def _http_get(self, url: str) -> Page:
        response = self._http.get(url)
        return Page(response.status_code, str(response.url), response.text)

    def get(self, url: str) -> Page:
        self.limiter.acquire()
        self.requests_made += 1
        return self._get(url)

    def close(self) -> None:
        self._http.close()


def _host(url: str) -> str:
    return urlsplit(url).netloc.lower().removeprefix("www.")


def _reads_as_listing(asked_path: str, final_url: str) -> bool:
    """True when the address the site answered at is the listing asked for, or another one."""
    path = urlsplit(final_url).path.lower().rstrip("/")
    if DATED.search(path + "/"):
        return False  # one dated post, not the listing
    return path == asked_path or "press-release" in path or path.endswith("documentquery.aspx")


def is_press_listing(site_url: str, asked_path: str, page: Page) -> bool:
    """True when ``page`` is a press listing on the office's own site (see the module text)."""
    return (
        page.status == 200
        and _host(page.url) == _host(site_url)
        and _reads_as_listing(asked_path, page.url)
        and MARKER in page.text.lower()
    )


def read_robots(client: SiteClient, site_url: str) -> urllib.robotparser.RobotFileParser | None:
    """The site's robots rules, or None when the site refused or did not answer.

    A missing robots.txt (404, or an HTML page served in its place) allows everything, as the
    convention has it.
    """
    try:
        page = client.get(site_url + "/robots.txt")
    except httpx.HTTPError as exc:
        log.info("%s: robots.txt did not answer (%s)", site_url, type(exc).__name__)
        return None
    if page.status in REFUSED or page.status >= 500:
        log.info("%s: robots.txt -> HTTP %d", site_url, page.status)
        return None
    rules = urllib.robotparser.RobotFileParser()
    is_rules = page.status == 200 and "<html" not in page.text[:2000].lower()
    rules.parse(page.text.splitlines() if is_rules else [])
    return rules


def probe(client: SiteClient, site_url: str) -> Result:
    site_url = site_url.rstrip("/")
    rules = read_robots(client, site_url)
    if rules is None:
        return Result("unreachable", None, "robots.txt refused or did not answer")
    allowed = [p for p in PATHS if rules.can_fetch(USER_AGENT, site_url + p)]
    if not allowed:
        return Result("disallowed", None, "robots.txt disallows every path")
    answered = 0
    for path in allowed:
        try:
            page = client.get(site_url + path)
        except httpx.HTTPError:
            continue
        if page.status in REFUSED or page.status >= 500:
            continue
        answered += 1
        if is_press_listing(site_url, path, page):
            return Result("found", page.url, path)
    if not answered:
        return Result("unreachable", None, "no path answered")
    return Result("not_found", None, f"{answered} of {len(allowed)} paths answered, none a listing")


def targets(
    conn: Connection, bioguide_ids: Sequence[str], recheck_before: datetime
) -> list[Target]:
    """Tracked members with no seed row and a website, whose probe is due: never probed, not
    answered last time, or last settled before ``recheck_before``."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT l.bioguide_id, l.payload -> 'terms' -> -1 ->> 'url'
            FROM raw.legislator AS l
            LEFT JOIN seed.statement_sources AS s ON s.bioguide_id = l.bioguide_id
            LEFT JOIN raw.press_page AS p ON p.bioguide_id = l.bioguide_id
            WHERE l.bioguide_id = ANY(%s)
              AND s.bioguide_id IS NULL
              AND coalesce(l.payload -> 'terms' -> -1 ->> 'url', '') <> ''
              AND (p.bioguide_id IS NULL
                   OR p.payload ->> 'outcome' = 'unreachable'
                   OR p.fetched_at <= %s)
            ORDER BY l.bioguide_id
            """,
            (list(bioguide_ids), recheck_before),
        )
        return [Target(row[0], row[1]) for row in cur.fetchall()]


def held_press_url(conn: Connection, bioguide_id: str) -> str | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT payload ->> 'press_url' FROM raw.press_page WHERE bioguide_id = %s",
            (bioguide_id,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def load(
    conn: Connection,
    client: SiteClient,
    bioguide_ids: Sequence[str],
    *,
    full_refresh: bool = False,
    now: datetime | None = None,
) -> int:
    """Probe every due member's site. Returns rows written."""
    with record_run(conn, SOURCE, SOURCE_URL) as run:
        fetched_at = now or datetime.now(UTC)
        recheck_before = fetched_at if full_refresh else fetched_at - RECHECK_AFTER
        due = targets(conn, bioguide_ids, recheck_before)
        outcomes: dict[str, int] = {}
        total = 0
        for target in due:
            result = probe(client, target.site_url)
            outcomes[result.outcome] = outcomes.get(result.outcome, 0) + 1
            press_url = result.press_url
            if result.outcome == "unreachable":
                # Nothing was learned: a page found on an earlier run is still the best known.
                press_url = held_press_url(conn, target.bioguide_id)
            total += upsert(
                conn,
                "raw",
                "press_page",
                ["bioguide_id"],
                [
                    {
                        "bioguide_id": target.bioguide_id,
                        "payload": Jsonb(
                            {
                                "outcome": result.outcome,
                                "press_url": press_url,
                                "detail": result.detail,
                            }
                        ),
                        "source_url": target.site_url,
                        "fetched_at": fetched_at,
                    }
                ],
            )
            # Each site is its own piece of work: keep it if a later site hangs the run.
            conn.commit()
            log.info("%s: %s %s", target.bioguide_id, result.outcome, press_url or result.detail)
        log.info(
            "%d sites probed (%s), %d requests",
            len(due),
            ", ".join(f"{count} {name}" for name, count in sorted(outcomes.items())) or "none due",
            client.requests_made,
        )
        run.rows_loaded = total
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:
    client = SiteClient()
    try:
        with connect() as conn:
            return load(conn, client, tracked_member_ids(conn), full_refresh=full_refresh)
    finally:
        client.close()
