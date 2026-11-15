"""The press-page probe: what counts as a press listing, robots.txt, and the four outcomes."""

from __future__ import annotations

import httpx

from ingest.congress_gov import RateLimiter
from ingest.sources import press_pages as src
from ingest.sources.press_pages import Page

SITE = "https://example.house.gov"
LISTING = "<html><h1>Press Releases</h1><a href='/x'>A release</a></html>"


def _client(pages: dict[str, Page | Exception]) -> src.SiteClient:
    """A site that answers the given addresses and 404s every other one."""

    def get(url: str) -> Page:
        answer = pages.get(url, Page(404, url, "not found"))
        if isinstance(answer, Exception):
            raise answer
        return answer

    return src.SiteClient(get=get, limiter=RateLimiter(10**6, 60.0))


def test_a_press_listing_is_on_the_site_at_a_listing_address_and_says_so() -> None:
    asked = "/media/press-releases"
    url = f"{SITE}{asked}"

    def listing(page: Page, site: str = SITE, path: str = asked) -> bool:
        return src.is_press_listing(site, path, page)

    assert listing(Page(200, url, LISTING))
    assert listing(Page(200, url + "/", LISTING), site="https://www.example.house.gov")
    assert not listing(Page(200, url, "<html>News and photos</html>"))
    assert not listing(Page(200, "https://elsewhere.gov/media/press-releases", LISTING))
    assert not listing(Page(404, url, LISTING))
    # where sites were seen to send an unknown path (2026-11-15)
    assert not listing(Page(200, f"{SITE}/", LISTING))
    assert not listing(Page(200, f"{SITE}/newsletter-subscribe-thankyou/", LISTING))
    assert not listing(Page(200, f"{SITE}/2011/11/24/press-releases/", LISTING))
    # a redirect to another listing is still a listing
    assert listing(Page(200, f"{SITE}/public/press-releases", LISTING))
    assert listing(Page(200, f"{SITE}/news/documentquery.aspx?DocumentTypeID=27", LISTING))
    assert listing(Page(200, f"{SITE}/news/", LISTING), path="/news")


def test_the_first_path_that_answers_with_a_listing_wins() -> None:
    client = _client(
        {
            f"{SITE}/media/press-releases": Page(200, f"{SITE}/", LISTING),  # redirected home
            f"{SITE}/news/press-releases": Page(200, f"{SITE}/news/press-releases/", LISTING),
            f"{SITE}/news": Page(200, f"{SITE}/news", LISTING),
        }
    )
    result = src.probe(client, SITE + "/")
    assert result.outcome == "found"
    assert result.press_url == f"{SITE}/news/press-releases/"
    # robots.txt, then the paths in order up to the one that answered
    assert client.requests_made == 1 + src.PATHS.index("/news/press-releases") + 1


def test_a_site_with_no_listing_is_not_found() -> None:
    client = _client({f"{SITE}/media": Page(200, f"{SITE}/media", "<html>Photos</html>")})
    result = src.probe(client, SITE)
    assert result.outcome == "not_found" and result.press_url is None


def test_robots_txt_is_honoured_per_path() -> None:
    robots = "User-agent: *\nDisallow: /media\nDisallow: /news\n"
    client = _client(
        {
            f"{SITE}/robots.txt": Page(200, f"{SITE}/robots.txt", robots),
            f"{SITE}/media/press-releases": Page(200, f"{SITE}/media/press-releases", LISTING),
            f"{SITE}/press-releases": Page(200, f"{SITE}/press-releases", LISTING),
        }
    )
    result = src.probe(client, SITE)
    assert result.press_url == f"{SITE}/press-releases"

    closed = _client({f"{SITE}/robots.txt": Page(200, "", "User-agent: *\nDisallow: /\n")})
    result = src.probe(closed, SITE)
    assert result.outcome == "disallowed"
    assert closed.requests_made == 1  # nothing but robots.txt was asked for


def test_an_html_page_served_as_robots_txt_allows_everything() -> None:
    client = _client(
        {
            f"{SITE}/robots.txt": Page(200, f"{SITE}/", "<!doctype html><html>Disallow: /</html>"),
            f"{SITE}/media/press-releases": Page(200, f"{SITE}/media/press-releases", LISTING),
        }
    )
    assert src.probe(client, SITE).outcome == "found"


def test_a_site_that_refuses_or_does_not_answer_is_unreachable() -> None:
    refused = _client({f"{SITE}/robots.txt": Page(403, f"{SITE}/robots.txt", "Access Denied")})
    assert src.probe(refused, SITE).outcome == "unreachable"
    assert refused.requests_made == 1

    down = _client({f"{SITE}/robots.txt": httpx.ConnectTimeout("timed out")})
    assert src.probe(down, SITE).outcome == "unreachable"

    # robots.txt is missing (allowed), then every path is refused: still nothing learned
    blocked = _client({f"{SITE}{path}": Page(403, f"{SITE}{path}", "") for path in src.PATHS})
    assert src.probe(blocked, SITE).outcome == "unreachable"
