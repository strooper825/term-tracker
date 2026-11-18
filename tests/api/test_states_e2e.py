"""/api/v1/states end to end (ADR 0035): fixture people through dbt to the API.

The fixture (tests/fixtures/openstates_people) sets up a Democratic California with a Senate
supermajority, a nonpartisan Nebraska, Puerto Rico under the PNP, an Alaska Senate run by a
coalition, and every other state with a governor and no legislators.
"""

from __future__ import annotations

import pytest

pytestmark = [pytest.mark.integration, pytest.mark.dbt]


@pytest.fixture
def states(client, built_mart):
    response = client.get("/api/v1/states")
    assert response.status_code == 200
    return {s["state"]: s for s in response.json()["states"]}


def _chamber(state: dict, chamber: str) -> dict:
    return next(c for c in state["chambers"] if c["chamber"] == chamber)


def test_every_state_dc_and_puerto_rico_are_listed(states):
    assert len(states) == 52 and {"DC", "PR", "NE"} <= set(states)


def test_california_is_democratic_with_a_senate_supermajority(states):
    ca = states["CA"]
    assert ca["control"] == "D"
    senate, assembly = _chamber(ca, "upper"), _chamber(ca, "lower")
    assert (senate["democratic"], senate["republican"], senate["vacant"]) == (30, 10, 0)
    assert senate["supermajority_seats"] == 27 and senate["control_kind"] == "supermajority"
    assert assembly["control_kind"] == "majority" and assembly["control_party"] == "D"
    assert [p["party"] for p in senate["parties"]] == ["D", "R"]


def test_nebraska_is_nonpartisan(states):
    ne = states["NE"]
    assert ne["control"] == "N"
    (legislature,) = ne["chambers"]
    assert legislature["chamber"] == "legislature" and legislature["nonpartisan"] == 49
    assert legislature["control_kind"] == "nonpartisan"


def test_puerto_rico_parties_stay_apart(states):
    pr = states["PR"]
    assert pr["control"] == "I"
    senate = _chamber(pr, "upper")
    assert senate["control_group"] == "Partido Nuevo Progresista"
    assert {p["party_group"]: p["seats"] for p in senate["parties"]} == {
        "Partido Nuevo Progresista": 15,
        "Partido Popular Democrático": 13,
    }


def test_alaska_senate_is_a_coalition_and_the_state_divided(states):
    ak = states["AK"]
    senate = _chamber(ak, "upper")
    assert senate["control_kind"] == "coalition" and senate["control_party"] is None
    assert ak["control"] == "split"


def test_an_empty_legislature_has_no_majority(states):
    nv = states["NV"]
    assert nv["governor"]["party"] == "R"
    assert all(c["control_kind"] == "none" and c["vacant"] == c["seats"] for c in nv["chambers"])
    assert nv["control"] == "split"


def test_state_detail_lists_districts_and_seated_members(client, built_mart):
    response = client.get("/api/v1/states/ca")
    assert response.status_code == 200
    body = response.json()
    assert body["legislature_name"] == "California State Legislature"
    assert len([d for d in body["districts"] if d["chamber"] == "upper"]) == 40
    senators = [m for m in body["legislators"] if m["chamber"] == "upper"]
    assert len(senators) == 40  # the senator whose role ended in 2025 is not among them
    assert not any("former" in m["name"] for m in senators)
    assert all(m["shape"] for m in senators)
    assert client.get("/api/v1/states/zz").status_code == 404


def test_roster_lists_each_chamber_with_profiles(client, built_mart):
    response = client.get("/api/v1/states/ca/legislators")
    assert response.status_code == 200
    body = response.json()
    assert [(c["slug"], len(c["legislators"])) for c in body["chambers"]] == [
        ("senate", 40),
        ("assembly", 80),
    ]
    senate = body["chambers"][0]["legislators"]
    # natural district order: 1, 2, ... 10, not 1, 10, 11
    assert [m["district"] for m in senate[:3]] == ["1", "2", "3"]
    sen0 = next(m for m in senate if m["name"] == "Invented CA upper 0")
    assert sen0["email"] == "senator0@legislature.example"
    assert sen0["capitol_office"] == {
        "address": "1021 O St., Sacramento, CA 95814",
        "phone": "916-555-0100",
    }
    assert sen0["district_office"]["phone"] == "555-555-0101"
    assert sen0["social"]["twitter"] == "invented_sen0"
    # two unbroken Senate terms read as one span, newest first, then the Assembly
    assert [(t["chamber"], t["start_date"], t["end_date"]) for t in sen0["terms"]] == [
        ("upper", "2020-12-07", None),
        ("lower", "2016-12-05", "2020-11-30"),
    ]
    # the chair first; the unlinked member is nobody's
    assert sen0["committees"] == [
        {"name": "Budget and Fiscal Review", "chamber": "upper", "role": "Chair"},
        {"name": "Joint Legislative Audit", "chamber": "legislature", "role": None},
    ]
    others = [m for m in senate if m["name"] != "Invented CA upper 0"]
    assert all(m["capitol_office"] is None and m["district_office"] is None for m in others)
    assert client.get("/api/v1/states/zz/legislators").status_code == 404


def test_one_chamber_legislatures_get_their_own_slug(client, built_mart):
    ne = client.get("/api/v1/states/ne/legislators").json()
    dc = client.get("/api/v1/states/dc/legislators").json()
    assert [c["slug"] for c in ne["chambers"]] == ["legislature"]
    assert [c["slug"] for c in dc["chambers"]] == ["council"]


def test_governor_card_details(states):
    gov = states["CA"]["governor"]
    # two back-to-back terms are one stretch in office; the term end is the current role's
    assert (gov["start_date"], gov["since"], gov["term_end"]) == (
        "2023-01-02",
        "2019-01-07",
        "2027-01-04",
    )
    assert gov["office"] == {"address": "1021 O St., Sacramento, CA 95814", "phone": "916-555-0200"}
    assert gov["contact_form_url"] == "https://governor.example/contact"
    assert gov["social"]["twitter"] == "InventedGov"
    assert gov["prior_service"] == [
        {
            "chamber": "upper",
            "chamber_name": "Senate",
            "start_date": "2009-01-01",
            "end_date": "2016-12-31",
        }
    ]
    other = states["NV"]["governor"]
    assert other["since"] == other["start_date"] and other["office"] is None
    assert other["prior_service"] == []
