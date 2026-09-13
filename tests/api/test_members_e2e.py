"""End to end on fixtures: raw load -> dbt build -> GET /api/v1/members.

Needs Postgres and the dbt CLI (see the built_mart fixture in conftest).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from ingest.sources import legislators as src

pytestmark = [pytest.mark.integration, pytest.mark.dbt]


SIX = {"S001213", "C001095", "S000033", "S001208", "K000401", "J000294"}


def test_members_returns_the_six_tracked_members(built_mart: None, client: TestClient) -> None:
    response = client.get("/api/v1/members")
    assert response.status_code == 200
    body = response.json()
    members = {m["bioguide_id"]: m for m in body["members"]}
    assert set(members) == SIX  # B001230 is in raw but not tracked

    steil = members["S001213"]
    assert steil["name"]["official_full"] == "Bryan Steil"
    assert steil["party"] == "Republican"
    assert steil["seat"] == {
        "chamber": "house",
        "state": "WI",
        "state_name": "Wisconsin",
        "fips_state": "55",
        "district": 1,
        "senate_class": None,
        "state_rank": None,
        "label": "WI-1",
    }
    assert steil["term"] == {
        "congress": 119,
        "start_date": "2025-01-03",
        "end_date": "2027-01-03",
        "party": "Republican",
    }
    assert steil["photo_url"] == "https://www.congress.gov/img/member/s001213_200.jpg"
    assert steil["ids"]["fec"] == ["H8WI01156"]
    assert steil["ids"]["opensecrets"] == "N00043379"
    assert steil["ids"]["wikipedia"] == "Bryan Steil"
    assert steil["caucus"] is None
    steil_committees = {c["thomas_id"]: c for c in steil["committees"]}
    assert steil_committees["HSHA"]["title"] == "Chair"
    assert steil_committees["HSHA"]["name"] == "House Committee on House Administration"
    assert steil_committees["HSBA"]["rank"] == 12
    assert steil_committees["HSBA21"]["parent_thomas_id"] == "HSBA"
    assert steil_committees["HSBA21"]["title"] == "Chairman"

    cotton = members["C001095"]
    assert cotton["seat"]["chamber"] == "senate"
    assert cotton["seat"]["state"] == "AR"
    assert cotton["seat"]["fips_state"] == "05"
    assert cotton["seat"]["district"] is None
    assert cotton["seat"]["senate_class"] == 2
    assert cotton["seat"]["label"] == "Arkansas (Class 2)"
    assert cotton["term"]["start_date"] == "2021-01-03"
    assert cotton["term"]["end_date"] == "2027-01-03"
    assert cotton["term"]["congress"] == 117
    cotton_committees = {c["thomas_id"]: c for c in cotton["committees"]}
    assert cotton_committees["SLIN"]["title"] == "Chairman"
    assert cotton_committees["SSAS"]["rank"] == 3
    assert cotton_committees["SSAS14"]["parent_name"] == cotton_committees["SSAS"]["name"]

    sanders = members["S000033"]
    assert (sanders["party"], sanders["caucus"]) == ("Independent", "Democrat")
    assert sanders["seat"]["label"] == "Vermont (Class 1)"
    assert sanders["name"] == {
        "first": "Bernard",
        "middle": None,
        "last": "Sanders",
        "nickname": "Bernie",
        "suffix": None,
        "official_full": "Bernard Sanders",
    }
    assert sanders["ids"]["cspan"] == 994 and sanders["ids"]["ballotpedia"] == "Bernie Sanders"
    kiley = members["K000401"]
    assert (kiley["party"], kiley["caucus"]) == ("Independent", "Republican")
    assert members["J000294"]["name"]["middle"] == "S."

    assert body["sources"], "every response carries sources[]"
    assert all(s["source_url"].startswith(src.BASE_URL) for s in body["sources"])
    assert all(s["fetched_at"] for s in body["sources"])


def test_openapi_lists_members(client: TestClient) -> None:
    assert "/api/v1/members" in client.get("/openapi.json").json()["paths"]
