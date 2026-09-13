"""Congress.gov client and bills source: rate limiting, keys, pagination, filtering, shapes."""

from __future__ import annotations

import json

import pytest

from ingest.congress_gov import (
    BASE_URL,
    CongressGovClient,
    LegislationKey,
    RateLimiter,
    parse_legislation_url,
)
from ingest.sources import congress_gov as src
from tests.fixtures.congress_gov import fixture_client, fixture_fetch


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0
        self.slept: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


def test_rate_limiter_sleeps_when_window_is_full() -> None:
    clock = FakeClock()
    limiter = RateLimiter(3, period_seconds=60, clock=clock, sleep=clock.sleep)
    for _ in range(3):
        limiter.acquire()
        clock.now += 5
    assert clock.slept == []
    limiter.acquire()  # 4th call within 60 s: wait until the first one expires
    assert clock.slept == [45.0]
    clock.now += 100
    limiter.acquire()
    assert clock.slept == [45.0]  # window emptied, no further sleep


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (
            "https://api.congress.gov/v3/bill/119/hr/4735?format=json",
            LegislationKey("bill", 119, "hr", "4735"),
        ),
        (
            "https://api.congress.gov/v3/amendment/119/samdt/6683?format=json",
            LegislationKey("amendment", 119, "samdt", "6683"),
        ),
        (
            "https://api.congress.gov/v3/bill/118/sjres/12/actions",
            LegislationKey("bill", 118, "sjres", "12"),
        ),
    ],
)
def test_parse_legislation_url(url: str, expected: LegislationKey) -> None:
    assert parse_legislation_url(url) == expected


def test_parse_legislation_url_rejects_other_urls() -> None:
    with pytest.raises(ValueError, match="not a Congress.gov"):
        parse_legislation_url("https://api.congress.gov/v3/member/S001213?format=json")


def test_api_key_travels_in_header_not_url() -> None:
    client = CongressGovClient("secret-key", fetch=lambda url: "{}", limiter=RateLimiter(10))
    url = client.url("member/S001213/sponsored-legislation", limit=250, offset=None)
    assert "secret-key" not in url
    assert url == f"{BASE_URL}/member/S001213/sponsored-legislation?format=json&limit=250"
    assert client._http.headers["X-Api-Key"] == "secret-key"
    client.close()


def test_paginate_follows_next() -> None:
    client = fixture_client()
    items = list(
        client.paginate("member/C001095/cosponsored-legislation", "cosponsoredLegislation")
    )
    assert len(items) == 3
    assert client.requests_made == 2


def test_member_legislation_filters_to_congress_and_handles_amendments() -> None:
    client = fixture_client()
    items = src.fetch_member_legislation(client, "S001213", "sponsor", 119)
    keys = [key for key, _ in items]
    assert keys == [
        LegislationKey("bill", 119, "hr", "4735"),
        LegislationKey("bill", 119, "hres", "150"),
        LegislationKey("amendment", 119, "hamdt", "9"),
    ]
    raw_page = json.loads(fixture_fetch(client.url("member/S001213/sponsored-legislation")))
    assert len(raw_page["sponsoredLegislation"]) == 4  # the 118th Congress item was dropped


def test_detail_actions_cosponsors_from_fixtures() -> None:
    client = fixture_client()
    key = LegislationKey("bill", 119, "hr", "5269")
    detail = src.fetch_detail(client, key)
    assert detail["introducedDate"] == "2025-09-10"  # not the 2026-09-04 shown on the list
    actions = src.fetch_actions(client, key)
    assert actions and all("actionDate" in a for a in actions)
    cosponsors = src.fetch_cosponsors(client, key)
    steil = next(c for c in cosponsors if c["bioguideId"] == "S001213")
    assert steil["sponsorshipDate"] == "2026-09-04"


@pytest.mark.parametrize(
    ("path", "body"),
    [
        (
            "member/S001213/sponsored-legislation",
            {"sponsoredLegislation": [{"congress": 119}], "pagination": {"count": 1}},
        ),
        (
            "bill/119/hr/4735",
            {"bill": {"congress": 119, "type": "HR", "number": "4735", "title": "x"}},
        ),
        (
            "bill/119/hr/4735/actions",
            {"actions": [{"text": "no date"}], "pagination": {"count": 1}},
        ),
        (
            "bill/119/hr/4735/cosponsors",
            {"cosponsors": [{"bioguideId": "S001213"}], "pagination": {"count": 1}},
        ),
    ],
)
def test_shape_changes_stop_the_run(path: str, body: dict) -> None:
    client = CongressGovClient("k", fetch=lambda url: json.dumps(body), limiter=RateLimiter(10))
    key = LegislationKey("bill", 119, "hr", "4735")
    with pytest.raises(src.SourceShapeError, match="shape differs"):
        if path.startswith("member"):
            src.fetch_member_legislation(client, "S001213", "sponsor", 119)
        elif path.endswith("actions"):
            src.fetch_actions(client, key)
        elif path.endswith("cosponsors"):
            src.fetch_cosponsors(client, key)
        else:
            src.fetch_detail(client, key)
    client.close()
