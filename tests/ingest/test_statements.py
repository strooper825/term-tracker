"""Press-feed parsing, paging rules, and failure handling (no network, no database)."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from email.utils import format_datetime

import httpx
import pytest

from ingest import run
from ingest.sources import statements
from ingest.sources.statements import (
    FeedTarget,
    FeedUnavailable,
    SourceShapeError,
    congress_start,
    fetch_page,
    page_url,
    parse_feed,
    walk_feed,
)
from tests.fixtures.statements import (
    JEFFRIES,
    SANDERS,
    SLOTKIN,
    feed_client,
    read,
)

SINCE = datetime(2025, 1, 3, tzinfo=UTC)


def _rss(items: list[tuple[str, datetime]]) -> str:
    body = "".join(
        f"<item><title>{guid}</title><link>https://x.gov/{guid}</link><guid>{guid}</guid>"
        f"<pubDate>{format_datetime(when)}</pubDate></item>"
        for guid, when in items
    )
    return (
        f'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>{body}</channel></rss>'
    )


def _http_error(status: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://x.gov/feed/")
    return httpx.HTTPStatusError(
        str(status), request=request, response=httpx.Response(status, request=request)
    )


def _client(pages: dict[str, str | Exception]) -> statements.FeedClient:
    def fetch(url: str) -> str:
        page = pages.get(url)
        if page is None:
            raise _http_error(404)
        if isinstance(page, Exception):
            raise page
        return page

    return statements.FeedClient(
        fetch=fetch, limiter=statements.RateLimiter(10_000, period_seconds=1.0)
    )


def test_parses_a_full_text_feed() -> None:
    items = parse_feed(read("sanders_page1.xml"), "sanders")
    assert len(items) == 3
    first = items[0]
    assert first.payload["title"] and first.payload["link"].startswith("https://www.sanders")
    assert first.guid == first.payload["guid"]
    assert first.published.tzinfo is not None
    assert first.payload["content_html"] and "<" in first.payload["content_html"]
    assert first.payload["creator"]


def test_keeps_categories_and_dates() -> None:
    items = parse_feed(read("slotkin_page1.xml"), "slotkin")
    assert [i.payload["categories"] for i in items] == [["Press Releases"], ["Press Releases"]]
    assert items[0].published > items[1].published
    assert items[0].payload["pub_date"].endswith("+0000")


def test_skips_an_untitled_item_and_says_so(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    # migrations/env.py runs logging.config.fileConfig, which disables loggers that already
    # exist; once the migrated-database fixture has run, this one is silent unless re-enabled.
    monkeypatch.setattr(statements.log, "disabled", False)
    with caplog.at_level(logging.WARNING, logger="ingest.statements"):
        items = parse_feed(read("jeffries_page53.xml"), "jeffries[53]")
    assert len(items) == 2
    assert all(i.payload["title"] for i in items)
    assert "skipped an item without a usable title" in caplog.text


def test_an_empty_channel_is_no_items_not_an_error() -> None:
    assert parse_feed(read("empty_channel.xml"), "empty") == []


@pytest.mark.parametrize(
    "text",
    [
        "<html><body>Service unavailable</body></html>",
        '<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title></feed>',
        "not xml at all",
    ],
)
def test_a_document_that_is_not_rss_is_a_shape_error(text: str) -> None:
    with pytest.raises(SourceShapeError):
        parse_feed(text, "feed")


def test_a_page_where_no_item_is_usable_is_a_shape_error() -> None:
    text = (
        '<rss version="2.0"><channel><item><title>Only a title</title></item>'
        "<item><link>https://x.gov/a</link></item></channel></rss>"
    )
    with pytest.raises(SourceShapeError, match="none of the 2 items"):
        parse_feed(text, "feed")


def test_guid_falls_back_to_the_link() -> None:
    text = (
        '<rss version="2.0"><channel><item><title>T</title><link>https://x.gov/a</link>'
        "<pubDate>Fri, 18 Sep 2026 22:10:00 +0000</pubDate></item></channel></rss>"
    )
    (item,) = parse_feed(text, "feed")
    assert item.guid == "https://x.gov/a"


def test_page_url() -> None:
    assert page_url("https://x.gov/feed/", 1) == "https://x.gov/feed/"
    assert page_url("https://x.gov/feed/", 3) == "https://x.gov/feed/?paged=3"
    assert page_url("https://x.gov/?feed=rss2", 2) == "https://x.gov/?feed=rss2&paged=2"


def test_congress_start() -> None:
    assert congress_start(119) == date(2025, 1, 3)
    assert congress_start(118) == date(2023, 1, 3)


def test_statements_run_last_so_they_cannot_block_other_sources() -> None:
    assert list(run.SOURCES)[-1] == statements.SOURCE


def test_a_missing_later_page_ends_the_feed_but_a_missing_first_page_does_not() -> None:
    client = _client({})
    assert fetch_page(client, "https://x.gov/feed/", 2) == []
    with pytest.raises(FeedUnavailable, match="HTTP 404"):
        fetch_page(client, "https://x.gov/feed/", 1)


@pytest.mark.parametrize("failure", [_http_error(503), httpx.ConnectError("no route")])
def test_transport_failures_are_unavailable_not_fatal(failure: Exception) -> None:
    with pytest.raises(FeedUnavailable):
        fetch_page(_client({"https://x.gov/feed/": failure}), "https://x.gov/feed/", 1)


def _day(n: int) -> datetime:
    return datetime(2026, 1, n, tzinfo=UTC)


def test_first_load_pages_back_to_the_start_of_the_congress() -> None:
    url = "https://x.gov/feed/"
    old = datetime(2024, 12, 20, tzinfo=UTC)
    client = _client(
        {
            url: _rss([("a", _day(9)), ("b", _day(8))]),
            f"{url}?paged=2": _rss([("c", _day(7)), ("d", datetime(2025, 2, 1, tzinfo=UTC))]),
            f"{url}?paged=3": _rss([("e", datetime(2025, 1, 2, tzinfo=UTC)), ("f", old)]),
            f"{url}?paged=4": _rss([("g", old)]),
        }
    )
    kept = walk_feed(client, FeedTarget("X", url), SINCE, set(), full_refresh=False)
    assert [i.guid for i in kept] == ["a", "b", "c", "d"]
    assert client.requests_made == 3  # page 3 held an item older than the Congress: stop


def test_a_normal_night_stops_at_the_first_page_holding_a_stored_item() -> None:
    url = "https://x.gov/feed/"
    client = _client(
        {
            url: _rss([("new1", _day(9)), ("new2", _day(8)), ("old", _day(7))]),
            f"{url}?paged=2": _rss([("older", _day(6))]),
        }
    )
    kept = walk_feed(client, FeedTarget("X", url), SINCE, {"old", "older"}, full_refresh=False)
    assert [i.guid for i in kept] == ["new1", "new2", "old"]  # page 1 is always written whole
    assert client.requests_made == 1


def test_a_busy_night_reads_on_until_it_meets_a_stored_item() -> None:
    url = "https://x.gov/feed/"
    client = _client(
        {
            url: _rss([("n1", _day(9)), ("n2", _day(8))]),
            f"{url}?paged=2": _rss([("n3", _day(7)), ("old", _day(6))]),
            f"{url}?paged=3": _rss([("older", _day(5))]),
        }
    )
    kept = walk_feed(client, FeedTarget("X", url), SINCE, {"old", "older"}, full_refresh=False)
    assert [i.guid for i in kept] == ["n1", "n2", "n3", "old"]
    assert client.requests_made == 2


def test_full_refresh_ignores_stored_items() -> None:
    url = "https://x.gov/feed/"
    client = _client(
        {
            url: _rss([("a", _day(9)), ("old", _day(8))]),
            f"{url}?paged=2": _rss([("b", _day(7))]),
        }
    )
    kept = walk_feed(client, FeedTarget("X", url), SINCE, {"old"}, full_refresh=True)
    assert [i.guid for i in kept] == ["a", "old", "b"]
    assert client.requests_made == 3  # page 3 is a 404: the end


def test_an_empty_first_page_is_skipped_like_a_dead_feed() -> None:
    client = feed_client({SANDERS.feed_url: "empty_channel.xml"})
    with pytest.raises(FeedUnavailable, match="no items"):
        walk_feed(client, SANDERS, SINCE, set(), full_refresh=False)


def test_the_fixture_feeds_walk_to_their_own_end() -> None:
    for target, expected in ((SANDERS, 3), (SLOTKIN, 2), (JEFFRIES, 2)):
        kept = walk_feed(feed_client(), target, SINCE, set(), full_refresh=False)
        assert len(kept) == expected
