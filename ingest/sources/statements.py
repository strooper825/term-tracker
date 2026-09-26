"""Source: official press-release feeds of tracked members (Public statements tab, ADR 0015).

Which members have a feed, and where, is the hand-verified seed ``seed.statement_sources``
(rows with ``mode = 'feed'``); nothing here discovers feeds. Each feed is an RSS 2.0 document
whose items carry the full release in ``content:encoded``. Items are parsed with xmltodict and
stored whole in ``raw.statement`` keyed ``(bioguide_id, guid)``.

Paging: page 1 is the feed URL, later pages append ``paged=N`` (WordPress). A feed is read
until a page is empty or 404s, its oldest item predates the tracked Congress, or, unless
``--full-refresh`` is given, a page holds an item that is already stored. A normal night is
therefore one request per feed; a first load is about one request per ten statements. A feed's
rows are written only once its whole walk succeeded, so a failure part-way cannot leave a gap
that a later night would never fill.

Failure handling: a feed that cannot be fetched or comes back empty is skipped with a warning
and keeps its stored rows; the run fails only if every feed failed. A document that is not RSS,
or an item missing its title, link or date, raises :class:`SourceShapeError` (plan section 11).
Requests are throttled to one a second and identify as ``term-tracker`` (ingest.http).
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime
from email.utils import parsedate_to_datetime
from typing import Any, NamedTuple

import httpx
import xmltodict
from psycopg import Connection
from psycopg.types.json import Jsonb

from api.config import get_settings
from ingest.congress_gov import RateLimiter
from ingest.db import connect
from ingest.http import USER_AGENT, fetch_text
from ingest.load import record_run, upsert
from ingest.shape import SourceShapeError

log = logging.getLogger("ingest.statements")

SOURCE = "statements"
SEED_URL = "https://github.com/strooper825/term-tracker/blob/main/dbt/seeds/statement_sources.csv"
KEY_COLUMNS = ["bioguide_id", "guid"]
MAX_PAGES = 300
NAMESPACES = {
    "http://purl.org/rss/1.0/modules/content/": "content",
    "http://purl.org/dc/elements/1.1/": "dc",
}

Fetch = Callable[[str], str]


class FeedUnavailable(RuntimeError):
    """The feed could not be read tonight (transport failure, 404, empty). Skip it."""


class FeedTarget(NamedTuple):
    bioguide_id: str
    feed_url: str


class Item(NamedTuple):
    guid: str
    published: datetime
    payload: dict[str, Any]


class FeedClient:
    def __init__(self, *, fetch: Fetch | None = None, limiter: RateLimiter | None = None) -> None:
        self._http = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60.0)
        self._fetch: Fetch = fetch or (lambda url: fetch_text(url, client=self._http))
        self.limiter = limiter or RateLimiter(60, period_seconds=60.0)
        self.requests_made = 0

    def get_text(self, url: str) -> str:
        self.limiter.acquire()
        self.requests_made += 1
        return self._fetch(url)

    def close(self) -> None:
        self._http.close()


def page_url(feed_url: str, page: int) -> str:
    if page == 1:
        return feed_url
    return f"{feed_url}{'&' if '?' in feed_url else '?'}paged={page}"


def _text(value: Any) -> str | None:
    """Text of an xmltodict node: a string, or a dict when the element has attributes."""
    if isinstance(value, dict):
        value = value.get("#text")
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return None


def parse_feed(text: str, where: str) -> list[Item]:
    """Items of one RSS 2.0 page, newest first as published. ``[]`` for an empty channel."""
    try:
        doc = xmltodict.parse(
            text, force_list=("item", "category"), process_namespaces=True, namespaces=NAMESPACES
        )
    except Exception as exc:  # expat raises ExpatError; anything unparseable is a shape error
        raise SourceShapeError(f"{where}: not XML ({exc})") from exc
    rss = doc.get("rss") if isinstance(doc, dict) else None
    if not isinstance(rss, dict):
        raise SourceShapeError(f"{where}: not an RSS 2.0 document (root {list(doc)[:1]})")
    channel = rss.get("channel")
    raw_items = channel.get("item", []) if isinstance(channel, dict) else []

    items: list[Item] = []
    skipped = 0
    for index, raw in enumerate(raw_items):
        label = f"{where}[{index}]"
        title = _text(raw.get("title")) if isinstance(raw, dict) else None
        link = _text(raw.get("link")) if isinstance(raw, dict) else None
        pub_date = _text(raw.get("pubDate")) if isinstance(raw, dict) else None
        published = None
        if pub_date:
            try:
                published = parsedate_to_datetime(pub_date)
            except (TypeError, ValueError):
                published = None
        if not (title and link and published):
            # One malformed item in an office's history (Jeffries has an untitled one from
            # 2025-05-23) must not fail every night; a page where none is usable is a new shape.
            log.warning("%s: skipped an item without a usable title, link or date", label)
            skipped += 1
            continue
        if published.tzinfo is None:
            published = published.replace(tzinfo=UTC)
        guid = _text(raw.get("guid")) or link
        categories = [c for c in (_text(v) for v in raw.get("category", [])) if c]
        items.append(
            Item(
                guid=guid,
                published=published,
                payload={
                    "title": title,
                    "link": link,
                    "guid": guid,
                    "pub_date": pub_date,
                    "creator": _text(raw.get("dc:creator")),
                    "categories": categories,
                    "description": _text(raw.get("description")),
                    "content_html": _text(raw.get("content:encoded")),
                },
            )
        )
    if raw_items and not items:
        raise SourceShapeError(
            f"{where}: none of the {skipped} items has a title, link and pubDate; "
            "the feed shape differs from what ADR 0015 expects. Not adapting in place."
        )
    return items


def fetch_page(client: FeedClient, feed_url: str, page: int) -> list[Item]:
    """One page of items. A missing later page is the end of the feed, not an error."""
    url = page_url(feed_url, page)
    try:
        text = client.get_text(url)
    except httpx.HTTPStatusError as exc:
        if page > 1 and exc.response.status_code == 404:
            return []
        raise FeedUnavailable(f"{url}: HTTP {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise FeedUnavailable(f"{url}: {exc}") from exc
    return parse_feed(text, url)


def stored_guids(conn: Connection, bioguide_id: str) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT guid FROM raw.statement WHERE bioguide_id = %s", (bioguide_id,))
        return {row[0] for row in cur.fetchall()}


def walk_feed(
    client: FeedClient, target: FeedTarget, since: datetime, known: set[str], *, full_refresh: bool
) -> list[Item]:
    """Every item to write for one feed, following the paging rules in the module docstring."""
    kept: list[Item] = []
    for page in range(1, MAX_PAGES + 1):
        items = fetch_page(client, target.feed_url, page)
        if not items:
            if page == 1:
                raise FeedUnavailable(f"{target.feed_url}: the feed has no items")
            break
        kept.extend(i for i in items if i.published >= since)
        if min(i.published for i in items) < since:
            break
        if not full_refresh and any(i.guid in known for i in items):
            break
    else:
        log.warning("%s: stopped at %d pages", target.feed_url, MAX_PAGES)
    return kept


def load(
    conn: Connection,
    client: FeedClient,
    targets: Sequence[FeedTarget],
    since: date,
    *,
    full_refresh: bool = False,
) -> int:
    """Load every feed. Returns rows upserted."""
    since_at = datetime(since.year, since.month, since.day, tzinfo=UTC)
    with record_run(conn, SOURCE, SEED_URL) as run:
        fetched_at = datetime.now(UTC)
        total = 0
        skipped: list[str] = []
        for target in targets:
            try:
                items = walk_feed(
                    client,
                    target,
                    since_at,
                    stored_guids(conn, target.bioguide_id),
                    full_refresh=full_refresh,
                )
            except FeedUnavailable as exc:
                log.warning("%s: skipped tonight (%s)", target.bioguide_id, exc)
                skipped.append(target.bioguide_id)
                continue
            total += upsert(
                conn,
                "raw",
                "statement",
                KEY_COLUMNS,
                [
                    {
                        "bioguide_id": target.bioguide_id,
                        "guid": i.guid,
                        "payload": Jsonb(i.payload),
                        "source_url": target.feed_url,
                        "fetched_at": fetched_at,
                    }
                    for i in items
                ],
            )
            log.info("%s: %d statements from %s", target.bioguide_id, len(items), target.feed_url)
        if targets and len(skipped) == len(targets):
            raise RuntimeError(f"every statement feed failed tonight: {', '.join(skipped)}")
        log.info(
            "%d feeds, %d skipped, %d requests, %d rows",
            len(targets),
            len(skipped),
            client.requests_made,
            total,
        )
        run.rows_loaded = total
    return run.rows_loaded


def feed_targets(conn: Connection) -> list[FeedTarget]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT bioguide_id, feed_url FROM seed.statement_sources "
            "WHERE mode = 'feed' ORDER BY bioguide_id"
        )
        return [FeedTarget(row[0], row[1]) for row in cur.fetchall()]


def congress_start(congress: int) -> date:
    """January 3 of the year the Congress convened (the 119th convened 2025-01-03)."""
    return date(1789 + 2 * (congress - 1), 1, 3)


def run(*, full_refresh: bool = False) -> int:
    settings = get_settings()
    client = FeedClient()
    try:
        with connect() as conn:
            return load(
                conn,
                client,
                feed_targets(conn),
                congress_start(settings.current_congress),
                full_refresh=full_refresh,
            )
    finally:
        client.close()
