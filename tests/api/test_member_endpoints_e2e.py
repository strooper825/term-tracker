"""End to end on fixtures: every section 6 endpoint against the built mart.

Assertions are scoped to fixture keys or to invariants so they hold on a database that also
holds live data (see conftest).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.fixtures.congress_gov import FIXTURE_BILLS
from tests.fixtures.votes import FIXTURE_ROLL_CALLS

pytestmark = [pytest.mark.integration, pytest.mark.dbt]

STEIL = "/api/v1/members/S001213"
COTTON = "/api/v1/members/C001095"
SANDERS = "/api/v1/members/S000033"
SLOTKIN = "/api/v1/members/S001208"
KILEY = "/api/v1/members/K000401"
JEFFRIES = "/api/v1/members/J000294"


def test_member_detail(built_mart: None, client: TestClient) -> None:
    body = client.get(STEIL).json()
    assert body["seat"]["label"] == "WI-1"
    assert body["term"] == {
        "congress": 119,
        "end_congress": 119,
        "congresses": [119],
        "tracked_congress": 119,
        "start_date": "2025-01-03",
        "end_date": "2027-01-03",
        "days_remaining": body["term"]["days_remaining"],
        "days_elapsed": body["term"]["days_elapsed"],
    }
    votes = body["votes"]
    assert votes["votes_cast"] + votes["not_voting"] == votes["positions"]
    assert votes["positions"] >= 5 and votes["not_voting"] >= 1
    assert 0 <= votes["attendance_pct"] <= 100
    assert votes["party_unity_pct"] is None or 0 <= votes["party_unity_pct"] <= 100
    assert body["activity"]["bills_sponsored"] >= 2
    assert body["activity"]["committees"] == 6
    # HSHA and Joint Library chairs count; the HSBA21 subcommittee chair does not
    assert body["activity"]["chairmanships"] == 2
    assert body["sources"]

    cotton = client.get(COTTON).json()
    assert cotton["seat"]["label"] == "Arkansas (Class 2)"
    assert cotton["term"]["congresses"] == [117, 118, 119]  # 2021-01-03 to 2027-01-03
    assert (cotton["term"]["congress"], cotton["term"]["end_congress"]) == (117, 119)
    assert cotton["term"]["tracked_congress"] == 119
    assert cotton["votes"]["not_voting"] >= 1


def test_biography_and_service_record(built_mart: None, client: TestClient) -> None:
    steil = client.get(STEIL).json()
    assert steil["bio"]["birthday"] == "1981-03-30" and steil["bio"]["gender"] == "M"
    assert steil["bio"]["age"] >= 45
    assert steil["service"]["serving_since"] == "2019-01-03"
    assert (steil["service"]["term_number"], steil["service"]["chamber_term_number"]) == (4, 4)
    assert steil["leadership"] == []

    # House 2013-01-03 to 2015-01-03, Senate from 2015-01-06: continuous service since 2013
    cotton = client.get(COTTON).json()
    assert cotton["service"]["serving_since"] == "2013-01-03"
    assert cotton["service"]["chamber_since"] == "2015-01-06"
    assert (cotton["service"]["term_number"], cotton["service"]["chamber_term_number"]) == (3, 2)
    assert [t["chamber"] for t in cotton["service"]["terms"]] == ["house", "senate", "senate"]
    assert cotton["leadership"][0]["title"] == "Senate Republican Conference Chair"
    assert cotton["leadership"][0]["is_current"] is True

    # first-term senator with three House terms behind her
    slotkin = client.get(SLOTKIN).json()
    assert slotkin["bio"]["gender"] == "F"
    assert slotkin["service"]["serving_since"] == "2019-01-03"
    assert slotkin["service"]["chamber_since"] == "2025-01-03"
    assert (slotkin["service"]["term_number"], slotkin["service"]["chamber_term_number"]) == (4, 1)
    assert slotkin["term"]["congresses"] == [119, 120, 121]

    sanders = client.get(SANDERS).json()
    assert sanders["service"]["serving_since"] == "1991-01-03"
    assert sanders["service"]["term_number"] == 12
    assert sanders["service"]["chamber_term_number"] == 4
    assert sanders["service"]["chamber_since"] == "2007-01-04"
    assert sanders["bio"]["birthday"] == "1941-09-08"

    jeffries = client.get(JEFFRIES).json()
    assert jeffries["leadership"][0] == {
        "title": "House Minority Leader",
        "chamber": "house",
        "start_date": "2025-01-03",
        "end_date": None,
        "is_current": True,
    }
    assert {r["title"] for r in jeffries["leadership"]} == {
        "House Minority Leader",
        "House Democratic Caucus Chair",
    }


def test_independents_are_scored_against_their_caucus(built_mart: None, client: TestClient) -> None:
    """ADR 0005: Sanders (I, caucus D) scores against the Democratic majority, Kiley (I since
    2026-03-09, caucus R) against the Republican one. On a fixture-only database the figures
    are exact: Sanders agrees with the Democratic majority on two of the three fixture roll
    calls, Kiley with the Republican majority on the only fixture roll call that has one."""
    sanders = client.get(SANDERS).json()
    assert (sanders["party"], sanders["caucus"]) == ("Independent", "Democrat")
    assert sanders["votes"]["scoring_party"] == "D"
    assert sanders["votes"]["party_unity_pct"] is not None
    if sanders["votes"]["positions"] == 3:  # fixture-only database
        assert sanders["votes"]["party_unity_pct"] == 66.67

    kiley = client.get(KILEY).json()
    assert (kiley["party"], kiley["caucus"]) == ("Independent", "Republican")
    assert kiley["votes"]["scoring_party"] == "R"
    if kiley["votes"]["positions"] == 5:  # fixture-only database
        assert kiley["votes"]["party_unity_pct"] == 100.0

    steil = client.get(STEIL).json()
    assert steil["votes"]["scoring_party"] == "R"


def test_key_dates_cover_every_tracked_state(built_mart: None, client: TestClient) -> None:
    for path, label in [
        (SANDERS, "Vermont primary election"),
        (SLOTKIN, "Michigan August primary"),
        (KILEY, "California statewide direct primary"),
        (JEFFRIES, "New York federal and state primary"),
        (STEIL, "Wisconsin partisan primary"),
        (COTTON, "Arkansas preferential primary"),
    ]:
        items = client.get(f"{path}/key-dates").json()["items"]
        assert label in {i["label"] for i in items}, path
        assert "General election day" in {i["label"] for i in items}


def test_votes_recent_with_position(built_mart: None, client: TestClient) -> None:
    body = client.get(f"{STEIL}/votes?limit=500").json()
    items = {(i["chamber"], i["session"], i["roll_number"]): i for i in body["items"]}
    expected = {k for k in FIXTURE_ROLL_CALLS if k[0] == "house"}
    if len(body["items"]) < 500:  # fixture-only database: every fixture roll call is in range
        assert expected <= set(items)
    if ("house", 1, 2) in items:
        speaker = items[("house", 1, 2)]
        assert (speaker["position"], speaker["position_raw"]) == ("Other", "Johnson (LA)")
    if ("house", 1, 353) in items:
        assert items[("house", 1, 353)]["position"] == "Not Voting"
    if ("house", 1, 240) in items:
        hr3424 = items[("house", 1, 240)]
        assert (hr3424["bill_type"], hr3424["bill_number"]) == ("hr", "3424")
        assert hr3424["bill_title"]  # detail fetched because a roll call references it
        assert hr3424["yea_total"] + hr3424["nay_total"] + hr3424["not_voting_total"] <= 7
    assert body["items"]
    assert body["items"] == sorted(body["items"], key=lambda i: i["voted_at"], reverse=True)
    assert all(s["source_url"] for s in body["sources"])

    small = client.get(f"{STEIL}/votes?limit=3").json()
    assert len(small["items"]) == 3


def test_bills_by_role(built_mart: None, client: TestClient) -> None:
    sponsored = client.get(f"{STEIL}/bills?role=sponsor").json()
    keys = {(i["bill_type"], i["bill_number"]) for i in sponsored["items"]}
    assert {("hr", "4735"), ("hamdt", "9")} <= keys
    assert all(
        i["role"] == "sponsor" and i["date"] == i["introduced_date"] for i in sponsored["items"]
    )

    cosponsored = client.get(f"{STEIL}/bills?role=cosponsor").json()
    hr5269 = next(
        i for i in cosponsored["items"] if (i["bill_type"], i["bill_number"]) == ("hr", "5269")
    )
    assert hr5269["date"] == "2026-09-04" and hr5269["introduced_date"] == "2025-09-10"
    assert hr5269["is_original_cosponsor"] is False
    assert hr5269["congress_gov_url"].endswith("/house-bill/5269")

    everything = client.get(f"{STEIL}/bills").json()
    assert everything["role"] is None
    assert len(everything["items"]) >= len(sponsored["items"]) + len(cosponsored["items"])
    fixture_keys = set(FIXTURE_BILLS)
    assert {(i["bill_type"], i["bill_number"]) for i in everything["items"]} & fixture_keys


def test_feed_pagination_and_events(built_mart: None, client: TestClient) -> None:
    first = client.get(f"{STEIL}/feed?limit=3").json()
    assert len(first["items"]) == 3 and first["next_cursor"]
    second = client.get(f"{STEIL}/feed?limit=3&cursor={first['next_cursor']}").json()
    assert len(second["items"]) == 3
    assert {i["event_key"] for i in first["items"]}.isdisjoint(
        i["event_key"] for i in second["items"]
    )
    assert (
        first["items"][0]["event_at"]
        >= first["items"][-1]["event_at"]
        >= second["items"][0]["event_at"]
    )

    everything: list[dict] = []
    cursor = None
    for _ in range(200):
        page = client.get(
            f"{STEIL}/feed?limit=200" + (f"&cursor={cursor}" if cursor else "")
        ).json()
        everything.extend(page["items"])
        cursor = page["next_cursor"]
        if not cursor:
            break
    keys = [i["event_key"] for i in everything]
    assert len(keys) == len(set(keys)), "cursor pagination must not repeat or skip"
    by_key = {i["event_key"]: i for i in everything}
    assert by_key["vote:house:1:2"]["headline"].startswith("Voted Johnson (LA) on")
    assert by_key["vote:house:1:353"]["headline"].startswith("Did not vote on")
    assert by_key["vote:house:1:240"]["headline"].startswith("Voted YEA on H.R. 3424: ")
    assert len(by_key["vote:house:1:240"]["headline"]) > len("Voted YEA on H.R. 3424: ")
    assert by_key["bill_sponsor:119:hr:4735"]["headline"].startswith("Introduced H.R. 4735: ")
    assert by_key["bill_cosponsor:119:hr:5269"]["event_date"] == "2026-09-04"
    assert not any(
        i["event_type"] == "committee_action" and i["bill_number"] == "4735" for i in everything
    )  # H.R. 4735 has only referral actions in the fixture
    assert any(
        i["event_type"] == "committee_action" and i["bill_number"] == "150" for i in everything
    )  # HRES 150: a Committee-type action on a bill Steil sponsors


def test_timeline_buckets(built_mart: None, client: TestClient) -> None:
    body = client.get(f"{STEIL}/timeline?from=2025-07-21&to=2025-07-27").json()
    assert body["from"] == "2025-07-21" and body["to"] == "2025-07-27"
    week = next(w for w in body["weeks"] if w["week_start"] == "2025-07-21")
    assert week["bill_sponsored"] >= 1  # H.R. 4735 introduced 2025-07-23
    assert (
        week["total"]
        == week["vote"]
        + week["bill_sponsored"]
        + week["bill_cosponsored"]
        + week["committee_action"]
    )

    default = client.get(f"{STEIL}/timeline").json()
    assert default["from"] == "2025-01-03"
    # The term started on Friday 2025-01-03; roll call 2 that day lands in the Monday bucket
    # 2024-12-30, which the default range must include.
    first_week = next(w for w in default["weeks"] if w["week_start"] == "2024-12-30")
    assert first_week["vote"] >= 1


def test_committees_and_key_dates(built_mart: None, client: TestClient) -> None:
    committees = client.get(f"{STEIL}/committees").json()
    assert {c["thomas_id"] for c in committees["items"]} >= {"HSBA", "HSHA", "HSBA21"}

    steil_dates = client.get(f"{STEIL}/key-dates").json()
    labels = {d["label"] for d in steil_dates["items"]}
    assert "General election day" in labels and "Wisconsin partisan primary" in labels
    assert not any("Arkansas" in label for label in labels)
    assert steil_dates["items"] == sorted(steil_dates["items"], key=lambda d: d["date"])

    cotton_dates = client.get(f"{COTTON}/key-dates").json()
    assert any("Arkansas" in d["label"] for d in cotton_dates["items"])
    assert all(d["source_url"] for d in cotton_dates["items"])
