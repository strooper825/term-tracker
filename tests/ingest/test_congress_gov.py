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


def test_senate_document_types_map_to_bill_types() -> None:
    assert src.SENATE_DOCUMENT_TYPES["S.J.Res."] == "sjres"
    assert src.SENATE_DOCUMENT_TYPES["H.R."] == "hr"
    assert "PN" not in src.SENATE_DOCUMENT_TYPES  # nominations are not legislation


def test_summaries_from_fixtures_including_bills_with_none() -> None:
    """Zero, one, and two versions, all from recorded responses (see FIXTURE_SUMMARY_COUNTS)."""
    from tests.fixtures.congress_gov import FIXTURE_SUMMARY_COUNTS

    client = fixture_client()
    for (bill_type, number), expected in FIXTURE_SUMMARY_COUNTS.items():
        key = LegislationKey("bill", 119, bill_type, number)
        summaries = src.fetch_summaries(client, key)
        assert len(summaries) == expected, key
        for item in summaries:
            assert item["versionCode"] and item["actionDate"] and item["text"]

    laken_riley = src.fetch_summaries(client, LegislationKey("bill", 119, "s", "5"))
    assert [s["actionDesc"] for s in laken_riley] == ["Introduced in Senate", "Public Law"]
    assert laken_riley[0]["text"].startswith("<p>")


def test_summaries_are_never_requested_for_an_amendment() -> None:
    client = fixture_client()
    with pytest.raises(ValueError, match="summaries exist for bills only"):
        src.fetch_summaries(client, LegislationKey("amendment", 119, "hamdt", "9"))


def test_repeated_version_code_stops_the_run() -> None:
    body = {
        "pagination": {"count": 2},
        "summaries": [
            {
                "versionCode": "00",
                "actionDate": "2025-01-06",
                "actionDesc": "Introduced in Senate",
                "text": "<p>a</p>",
                "updateDate": "2025-01-13T16:21:37Z",
            },
            {
                "versionCode": "00",
                "actionDate": "2025-01-07",
                "actionDesc": "Introduced in Senate",
                "text": "<p>b</p>",
                "updateDate": "2025-01-14T16:21:37Z",
            },
        ],
    }
    client = CongressGovClient("k", fetch=lambda url: json.dumps(body), limiter=RateLimiter(10**6))
    with pytest.raises(src.SourceShapeError, match="repeated versionCode"):
        src.fetch_summaries(client, LegislationKey("bill", 119, "s", "5"))


def test_a_summary_missing_a_declared_field_stops_the_run() -> None:
    body = {
        "pagination": {"count": 1},
        "summaries": [{"versionCode": "00", "actionDate": "2025-01-06", "text": "<p>a</p>"}],
    }
    client = CongressGovClient("k", fetch=lambda url: json.dumps(body), limiter=RateLimiter(10**6))
    with pytest.raises(src.SourceShapeError, match="shape differs"):
        src.fetch_summaries(client, LegislationKey("bill", 119, "s", "5"))


def changed_list_fetch(bills: list[str], amendments: list[str], seen: list[str]):
    """A fetch that answers the two changed-record lists and nothing else."""

    def fetch(url: str) -> str:
        seen.append(url)
        if "/v3/bill/119?" in url:
            key, paths = "bills", bills
        elif "/v3/amendment/119?" in url:
            key, paths = "amendments", amendments
        else:
            raise AssertionError(f"unexpected request {url}")
        items = [{"url": f"{BASE_URL}/{path}?format=json"} for path in paths]
        return json.dumps({key: items, "pagination": {"count": len(items)}})

    return fetch


def test_changed_since_asks_both_lists_with_the_exact_timestamp_format() -> None:
    from datetime import UTC, datetime, timedelta, timezone

    seen: list[str] = []
    client = CongressGovClient(
        "k",
        fetch=changed_list_fetch(["bill/119/hr/5269"], ["amendment/119/hamdt/9"], seen),
        limiter=RateLimiter(10**6),
    )
    # 03:30 at UTC-5 is 08:30Z: the API takes UTC only, written to the second with a Z
    since = datetime(2026, 11, 12, 3, 30, 0, tzinfo=timezone(timedelta(hours=-5)))
    keys = src.fetch_changed_since(client, 119, since)
    assert keys == {
        LegislationKey("bill", 119, "hr", "5269"),
        LegislationKey("amendment", 119, "hamdt", "9"),
    }
    assert len(seen) == 2
    assert all("fromDateTime=2026-11-12T08%3A30%3A00Z" in url for url in seen)
    assert since.astimezone(UTC).hour == 8


def test_a_changed_list_item_without_a_url_stops_the_comparison() -> None:
    from datetime import UTC, datetime

    client = CongressGovClient(
        "k",
        fetch=lambda url: json.dumps({"bills": [{"number": "1"}], "pagination": {}}),
        limiter=RateLimiter(10**6),
    )
    with pytest.raises(src.SourceShapeError, match="no url"):
        src.fetch_changed_since(client, 119, datetime(2026, 11, 12, tzinfo=UTC))


def test_filter_comparison_names_a_changed_record_the_lists_did_not_report() -> None:
    from datetime import UTC, datetime

    seen: list[str] = []
    client = CongressGovClient(
        "k",
        fetch=changed_list_fetch(["bill/119/hr/5269", "bill/119/hr/9999"], [], seen),
        limiter=RateLimiter(10**6),
    )
    reported = LegislationKey("bill", 119, "hr", "5269")
    unreported = LegislationKey("bill", 119, "s", "2274")
    started = datetime(2026, 11, 12, 6, 0, tzinfo=UTC)
    result = src.compare_with_filter(
        client, 119, started, in_scope={reported, unreported}, changed={reported, unreported}
    )
    assert result.since == started - src.FILTER_OVERLAP
    assert (result.reported, result.reported_in_scope, result.changed) == (2, 1, 2)
    assert result.missed == [unreported]
    assert result.requests == 2
    assert any("NOT REPORTED" in line and "bill/119/s/2274" in line for line in result.lines())

    clean = src.compare_with_filter(client, 119, started, in_scope={reported}, changed={reported})
    assert clean.missed == []
    assert clean.lines()[-1] == "Every changed record was reported by the filter."
