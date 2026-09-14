"""End to end on fixtures: raw load -> dbt build -> GET /api/v1/bills.

Assertions are scoped to fixture bills or to invariants, so they hold on a database that also
holds live data (see conftest).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.fixtures.congress_gov import FIXTURE_BILLS, FIXTURE_SUMMARY_COUNTS

pytestmark = [pytest.mark.integration, pytest.mark.dbt]


def _get(client: TestClient, bill_type: str, number: str) -> dict:
    response = client.get(f"/api/v1/bills/119/{bill_type}/{number}")
    assert response.status_code == 200, (bill_type, number, response.text[:200])
    return response.json()


def test_every_fixture_bill_has_a_page(built_mart: None, client: TestClient) -> None:
    for bill_type, number in FIXTURE_BILLS:
        body = _get(client, bill_type, number)
        assert body["title"]
        assert body["sponsor"]["name"], (bill_type, number)
        assert body["congress_gov_url"].startswith("https://www.congress.gov/")
        assert body["sources"], (bill_type, number)
        # the counts on the row agree with the lists beside them
        assert body["cosponsors"]["total"] == len(body["cosponsor_list"])
        assert body["summary_count"] == len(body["summary_versions"])
        assert (
            body["cosponsors"]["democratic"]
            + body["cosponsors"]["republican"]
            + body["cosponsors"]["other"]
            == body["cosponsors"]["total"]
        )


def test_summary_versions_match_what_was_recorded(built_mart: None, client: TestClient) -> None:
    for (bill_type, number), expected in FIXTURE_SUMMARY_COUNTS.items():
        body = _get(client, bill_type, number)
        assert body["summary_count"] == expected, (bill_type, number)
        assert body["has_summary"] is (expected > 0)
        if expected == 0:
            assert body["summary"] is None
        else:
            assert body["summary"]["is_latest"] is True
            assert body["summary"]["text_html"].startswith("<")
            assert sum(v["is_latest"] for v in body["summary_versions"]) == 1


def test_laken_riley_act_carries_both_versions_newest_first(
    built_mart: None, client: TestClient
) -> None:
    """S. 5 was introduced 2025-01-06 and became law 2025-01-29; the page shows the later one."""
    body = _get(client, "s", "5")
    assert [v["action_desc"] for v in body["summary_versions"]] == [
        "Public Law",
        "Introduced in Senate",
    ]
    assert body["summary"]["action_desc"] == "Public Law"
    assert body["summary"]["action_date"] == "2025-01-29"
    assert body["summary_versions"][1]["is_latest"] is False


def test_amendments_have_no_summary_and_say_which_bill_they_amend(
    built_mart: None, client: TestClient
) -> None:
    body = _get(client, "hamdt", "9")
    assert body["kind"] == "amendment"
    assert body["summary"] is None and body["summary_count"] == 0
    assert body["amended_bill_type"] and body["amended_bill_number"]


def test_a_roll_call_bill_has_cosponsors_and_actions_of_its_own(
    built_mart: None, client: TestClient
) -> None:
    """S. 5 reaches the mart only because a roll call names it; it still gets a full page."""
    body = _get(client, "s", "5")
    assert body["action_count"] > 0 and len(body["actions"]) == body["action_count"]
    assert body["cosponsors"]["total"] > 0
    assert body["roll_call_count"] >= 1
    call = body["roll_calls"][0]
    assert call["yea_total"] >= 0 and call["nay_total"] >= 0
    assert {p["position"] for p in call["tracked_positions"]} <= {
        "Yea",
        "Nay",
        "Present",
        "Not Voting",
        "Other",
    }


def test_actions_are_newest_first_and_cosponsors_earliest_first(
    built_mart: None, client: TestClient
) -> None:
    body = _get(client, "hr", "5269")
    dates = [a["action_date"] for a in body["actions"]]
    assert dates == sorted(dates, reverse=True)
    joined = [c["date"] for c in body["cosponsor_list"]]
    assert joined == sorted(joined)


def test_listing_pages_through_every_bill(built_mart: None, client: TestClient) -> None:
    first = client.get("/api/v1/bills?limit=5&offset=0").json()
    assert first["total"] >= len(FIXTURE_BILLS)
    assert len(first["items"]) == min(5, first["total"])
    second = client.get("/api/v1/bills?limit=5&offset=5").json()
    assert second["total"] == first["total"]
    keys = {(i["bill_type"], i["bill_number"]) for i in first["items"] + second["items"]}
    assert len(keys) == len(first["items"]) + len(second["items"])  # no overlap between pages


def test_a_bill_outside_the_mart_is_404(built_mart: None, client: TestClient) -> None:
    assert client.get("/api/v1/bills/119/hr/999999").status_code == 404


def test_feed_rows_carry_the_bill_label_only_when_a_page_exists(
    built_mart: None, client: TestClient
) -> None:
    items = client.get("/api/v1/members/S001213/feed?limit=200").json()["items"]
    assert items, "the fixture member has feed events"
    for item in items:
        assert item["congress"] == 119
        if item["bill_label"] is not None:
            assert item["bill_type"] and item["bill_number"]
            assert item["bill_label"] in item["headline"]
            page = client.get(
                f"/api/v1/bills/{item['congress']}/{item['bill_type']}/{item['bill_number']}"
            )
            assert page.status_code == 200, item["bill_label"]


def _stages(body: dict) -> dict[str, dict]:
    return {stage["stage_key"]: stage for stage in body["journey"]}


def test_journey_shown_stages_are_ordered_and_votes_add_up(
    built_mart: None, client: TestClient
) -> None:
    """ADR 0009 invariants on every fixture bill: stages run 1..n in order, every vote stage has
    its roll call, and the party split adds up to the tally."""
    for bill_type, number in FIXTURE_BILLS:
        body = _get(client, bill_type, number)
        if body["kind"] == "amendment":
            assert body["journey"] == [], (bill_type, number)
            continue
        orders = [stage["order"] for stage in body["journey"]]
        assert orders == list(range(1, len(orders) + 1)), (bill_type, number)
        assert body["journey"][0]["stage_key"] == "introduced"
        assert body["journey"][0]["date"] == body["introduced_date"]
        for stage in body["journey"]:
            vote = stage["vote"]
            assert (vote is not None) == (stage["status"] in ("passed", "failed")), stage
            if vote:
                assert sum(p["yea"] for p in vote["parties"]) == vote["yea_total"]
                assert sum(p["nay"] for p in vote["parties"]) == vote["nay_total"]
                assert vote["passed"] is (stage["status"] == "passed")


def test_journey_house_passage_votes_from_the_fixture_roll_calls(
    built_mart: None, client: TestClient
) -> None:
    """House roll call 1-122 (On Passage, H.R. 276) and 1-240 (suspension, H.R. 3424)."""
    on_passage = _stages(_get(client, "hr", "276"))
    assert list(on_passage)[:3] == ["introduced", "house_vote", "senate_vote"]
    house = on_passage["house_vote"]
    assert (house["status"], house["status_label"]) == ("passed", "Passed")
    assert (house["vote"]["session"], house["vote"]["roll_number"]) == (1, 122)
    assert house["vote"]["question"] == "On Passage"
    assert house["vote"]["majority_label"] is None

    suspension = _stages(_get(client, "hr", "3424"))["house_vote"]
    assert (suspension["vote"]["session"], suspension["vote"]["roll_number"]) == (1, 240)
    assert suspension["vote"]["question"] == "On Motion to Suspend the Rules and Pass"
    assert suspension["vote"]["majority_label"] == "2/3 required"


def test_journey_enacted_joint_resolution_senate_first_with_no_house_roll_call(
    built_mart: None, client: TestClient
) -> None:
    """S.J.Res. 13: Senate roll call 1-237 is in the fixtures, the House roll call is not, and the
    Library of Congress actions record presentation and the public law."""
    body = _get(client, "sjres", "13")
    stages = _stages(body)
    assert list(stages) == [
        "introduced",
        "senate_vote",
        "house_vote",
        "to_president",
        "became_law",
    ]  # chamber of origin first
    senate = stages["senate_vote"]
    assert senate["status"] == "passed"
    # the vote fixtures trim member lists, so the tally is compared with the same roll call's row
    # in roll_calls rather than with the live 52-47
    call = next(
        r for r in body["roll_calls"] if (r["chamber"], r["roll_number"]) == ("senate", 237)
    )
    assert senate["vote"]["roll_number"] == 237
    assert (senate["vote"]["yea_total"], senate["vote"]["nay_total"]) == (
        call["yea_total"],
        call["nay_total"],
    )
    assert senate["vote"]["result"] == "Joint Resolution Passed"
    assert stages["house_vote"]["status"] == "no_roll_call"  # a later stage is on record
    assert stages["house_vote"]["vote"] is None
    assert (stages["to_president"]["status_label"], stages["to_president"]["date"]) == (
        "Presented",
        "2025-06-10",
    )
    law = stages["became_law"]
    assert (law["status"], law["date"], law["detail"]) == (
        "complete",
        "2025-06-20",
        "Became Public Law No: 119-19.",
    )
    assert not any(stage["ends_journey"] for stage in stages.values())


def test_journey_simple_resolution_has_only_its_chamber(
    built_mart: None, client: TestClient
) -> None:
    assert list(_stages(_get(client, "sres", "837"))) == ["introduced", "senate_vote"]
    assert list(_stages(_get(client, "hres", "150"))) == ["introduced", "house_vote"]
