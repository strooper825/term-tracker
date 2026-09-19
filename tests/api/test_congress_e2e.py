"""End to end on fixtures: raw load -> dbt build -> GET /api/v1/congress/overview.

The composition seed is fixed, so those figures are asserted exactly. The activity figures
depend on the fixture bills, so they are checked for agreeing with each other and with the rows
the API lists, which is the property the page relies on (ADR 0013).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = [pytest.mark.integration, pytest.mark.dbt]


def _overview(client: TestClient) -> dict:
    response = client.get("/api/v1/congress/overview")
    assert response.status_code == 200
    return response.json()


def test_composition_is_the_seed_and_adds_up(built_mart: None, client: TestClient) -> None:
    body = _overview(client)
    composition = body["composition"]
    assert (composition["seats"], composition["seated"], composition["vacant"]) == (535, 533, 2)

    house, senate = composition["chambers"]
    assert (house["chamber"], house["seats"], house["majority_threshold"]) == ("house", 435, 218)
    assert (senate["chamber"], senate["seats"], senate["majority_threshold"]) == ("senate", 100, 50)
    assert {g["party_group"]: g["seats"] for g in house["groups"]} == {
        "republican": 218,
        "democratic": 214,
        "independent": 1,
        "vacant": 2,
    }
    # Independents count with the party they caucus with, for the margin only.
    assert (house["republican_caucus"], house["democratic_caucus"]) == (219, 214)
    assert (house["majority_letter"], house["majority_margin"]) == ("R", 5)
    # the majority line sits at threshold / seats along the bar
    assert house["majority_pct"] == pytest.approx(50.11, abs=0.01)
    assert senate["majority_pct"] == pytest.approx(50, abs=0.01)
    # ADR 0014: a Republican Vice President breaks ties, so the Senate line sits at 50, not 51.
    assert (house["tiebreak_letter"], senate["tiebreak_letter"]) == (None, "R")
    assert (senate["republican_caucus"], senate["democratic_caucus"]) == (53, 47)
    assert (senate["majority_letter"], senate["majority_margin"]) == ("R", 6)

    for chamber in (house, senate):
        assert sum(g["seats"] for g in chamber["groups"]) == chamber["seats"]
        assert sum(g["seat_pct"] for g in chamber["groups"]) == pytest.approx(100, abs=0.05)
    assert [g["caucus_with"] for g in senate["groups"] if g["party_group"] == "independent"] == [
        "democratic"
    ]


def test_activity_figures_agree_with_each_other(built_mart: None, client: TestClient) -> None:
    body = _overview(client)
    a = body["activity"]
    assert a["bills_house"] + a["bills_senate"] == a["bills_in_dataset"]
    assert (
        a["passed_chamber_house_origin"] + a["passed_chamber_senate_origin"]
        == (a["passed_chamber"])
    )
    assert a["vetoed_overridden"] + a["vetoed_not_overridden"] == a["vetoed"]
    # one dataset, so each figure fits inside the one it is a subset of
    assert a["became_law"] <= a["passed_chamber"] <= a["bills_in_dataset"]


def test_passed_both_table_matches_its_header_counts(built_mart: None, client: TestClient) -> None:
    body = _overview(client)
    passed = body["passed_both"]
    assert passed["total"] == len(passed["items"])
    assert passed["total"] <= body["activity"]["passed_chamber"]
    outcomes = [item["outcome"] for item in passed["items"]]
    assert passed["enacted"] == outcomes.count("law")
    assert passed["adopted"] == outcomes.count("adopted")
    assert passed["vetoed"] == outcomes.count("vetoed") + outcomes.count("overridden")
    for item in passed["items"]:
        assert item["congress_gov_url"].startswith("https://www.congress.gov/")
        if item["outcome"] == "law":
            assert item["public_law_number"]
