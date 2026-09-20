"""Fixture-backed press-feed client (no network).

Recorded 2026-09-19 from three live feeds and trimmed to a few whole items each, with the long
``content:encoded`` bodies cut to a short prefix: Sanders and Slotkin (page 1), and Jeffries's
page 53 (served here as its page 1), which holds the one untitled item the loader must skip.
``empty_channel.xml`` is a hand-written valid feed with no items. A page the fixtures do not
hold answers 404, which is how a real feed ends.
"""

from __future__ import annotations

from pathlib import Path

import httpx

from ingest.congress_gov import RateLimiter
from ingest.sources.statements import FeedClient, FeedTarget

FIXTURE_DIR = Path(__file__).resolve().parent

SANDERS = FeedTarget("S000033", "https://www.sanders.senate.gov/press-releases/feed/")
SLOTKIN = FeedTarget("S001208", "https://www.slotkin.senate.gov/category/press-releases/feed/")
JEFFRIES = FeedTarget("J000294", "https://jeffries.house.gov/feed/")
TARGETS = [JEFFRIES, SANDERS, SLOTKIN]

PAGES = {
    SANDERS.feed_url: "sanders_page1.xml",
    SLOTKIN.feed_url: "slotkin_page1.xml",
    JEFFRIES.feed_url: "jeffries_page53.xml",
}
# Statements the fixtures hold once parsed (Jeffries's untitled item is skipped)
EXPECTED = {JEFFRIES.bioguide_id: 2, SANDERS.bioguide_id: 3, SLOTKIN.bioguide_id: 2}


def read(name: str) -> str:
    return (FIXTURE_DIR / name).read_text(encoding="utf8")


def fixture_fetch(pages: dict[str, str] | None = None):
    """A fetch function answering from ``pages`` (URL -> fixture file); anything else is 404."""
    table = PAGES if pages is None else pages

    def fetch(url: str) -> str:
        name = table.get(url)
        if name is None:
            request = httpx.Request("GET", url)
            raise httpx.HTTPStatusError(
                "404", request=request, response=httpx.Response(404, request=request)
            )
        return read(name)

    return fetch


def feed_client(pages: dict[str, str] | None = None) -> FeedClient:
    return FeedClient(fetch=fixture_fetch(pages), limiter=RateLimiter(10_000, period_seconds=1.0))
