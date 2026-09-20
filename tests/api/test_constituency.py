"""GET /members/{id}/constituency with the database stubbed: how the endpoint turns
mart.member_constituency and mart.constituency_demographics rows into views and estimates."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from api.db import get_session
from api.main import app
from tests.api.test_member_endpoints import _StubSession, _summary_row

FETCHED = datetime(2026, 9, 21, 6, 10, tzinfo=UTC)
COUNTY = {"geoid": "55059", "name": "Kenosha County", "d": "M0,0L10,0L10,10Z"}


def teardown_function() -> None:
    app.dependency_overrides.clear()


def _use(rows_by_table: dict[str, list[dict]]) -> None:
    app.dependency_overrides[get_session] = lambda: _StubSession([_summary_row()], rows_by_table)


def _constituency(**overrides) -> dict:
    row = {
        "congress": 119,
        "fips_state": "55",
        "district": 1,
        "label": "WI-1",
        "map_state": {
            "width": 240.0,
            "height": 300.0,
            "outline": "M0,0L9,0L9,9Z",
            "counties": [COUNTY],
            "district": "M1,1L5,1L5,5Z",
        },
        "map_district": {
            "width": 300.0,
            "height": 120.0,
            "outline": "M0,0L8,0L8,8Z",
            "counties": [COUNTY],
        },
        "map_source_url": "https://example/state.zip",
        "map_district_source_url": "https://example/cd.zip",
        "map_county_source_url": "https://example/county.zip",
        "map_fetched_at": FETCHED,
    }
    return row | overrides


def _demographics(**overrides) -> dict:
    row = {
        "acs_year": 2024,
        "period": "2020-2024",
        "name": "Congressional District 1 (119th Congress), Wisconsin",
        "population": 742318,
        "population_moe": 1204,
        "median_age": 41.2,
        "median_age_moe": 0.3,
        "median_household_income": 83450,
        "median_household_income_moe": 1915,
        "households": 292400,
        "households_moe": 2100,
        "bachelors_or_higher_pct": 31.4,
        "bachelors_or_higher_pct_moe": 1.1,
        "high_school_or_higher_pct": 93.6,
        "high_school_or_higher_pct_moe": 0.6,
        "unemployment_pct": 4.1,
        "unemployment_pct_moe": 0.5,
        "poverty_pct": 8.2,
        "poverty_pct_moe": 0.7,
        "race_white_pct": 78.5,
        "race_black_pct": 4.9,
        "race_native_pct": 0.2,
        "race_asian_pct": 3.1,
        "race_pacific_pct": 0.0,
        "race_other_pct": 0.4,
        "race_multiple_pct": 3.0,
        "race_hispanic_pct": 9.9,
        "source": "census_acs",
        "source_url": "https://api.census.gov/data/2024/acs/acs5/profile",
        "fetched_at": FETCHED,
    }
    return row | overrides


def _get(client: TestClient) -> dict:
    response = client.get("/api/v1/members/S001213/constituency")
    assert response.status_code == 200, response.text
    return response.json()


def test_a_house_member_gets_the_district_view_first_then_the_state(client: TestClient) -> None:
    _use(
        {
            "mart.member_constituency": [_constituency()],
            "mart.constituency_demographics": [_demographics()],
        }
    )
    body = _get(client)
    assert (body["label"], body["chamber"], body["congress"], body["district"]) == (
        "WI-1",
        "house",
        119,
        1,
    )
    district, state = body["map"]["views"]
    assert (district["key"], district["district"], district["width"]) == ("district", None, 300.0)
    assert (state["key"], state["district"]) == ("state", "M1,1L5,1L5,5Z")
    assert state["counties"] == [COUNTY]

    demographics = body["demographics"]
    assert demographics["population"] == {"value": 742318, "margin": 1204}
    assert demographics["median_household_income"]["value"] == 83450
    assert demographics["period"] == "2020-2024" and demographics["acs_year"] == 2024
    assert [r["key"] for r in demographics["race"]] == [
        "white",
        "black",
        "native",
        "asian",
        "pacific",
        "other",
        "multiple",
        "hispanic",
    ]
    assert round(sum(r["pct"] for r in demographics["race"]), 1) == 100.0
    # the map's two files (district and state), the county file, and the ACS release
    assert {(s["source"], s["source_url"]) for s in body["sources"]} == {
        ("census_acs", "https://api.census.gov/data/2024/acs/acs5/profile"),
        ("census_boundary", "https://example/state.zip"),
        ("census_boundary", "https://example/cd.zip"),
        ("census_boundary", "https://example/county.zip"),
    }


def test_a_senator_or_an_at_large_member_gets_only_the_state_view(client: TestClient) -> None:
    state_only = {
        "width": 240.0,
        "height": 300.0,
        "outline": "M0,0Z",
        "counties": [],
        "district": None,
    }
    _use(
        {
            "mart.member_constituency": [
                _constituency(
                    district=0,
                    label="AK (At Large)",
                    map_state=state_only,
                    map_district=None,
                    map_district_source_url=None,
                )
            ],
            "mart.constituency_demographics": [],
        }
    )
    body = _get(client)
    assert [v["key"] for v in body["map"]["views"]] == ["state"]
    assert body["map"]["views"][0]["district"] is None
    assert body["demographics"] is None  # nothing loaded for this Congress yet: null, not a 404
    assert {s["source_url"] for s in body["sources"]} == {
        "https://example/state.zip",
        "https://example/county.zip",
    }


def test_a_value_the_census_could_not_compute_is_null_with_its_margin(client: TestClient) -> None:
    _use(
        {
            "mart.member_constituency": [_constituency()],
            "mart.constituency_demographics": [
                _demographics(median_household_income=None, median_household_income_moe=None)
            ],
        }
    )
    income = _get(client)["demographics"]["median_household_income"]
    assert income == {"value": None, "margin": None}


def test_no_constituency_row_is_an_empty_response_not_an_error(client: TestClient) -> None:
    _use({"mart.member_constituency": [], "mart.constituency_demographics": []})
    body = _get(client)
    assert body["map"] is None and body["demographics"] is None and body["sources"] == []
    assert body["label"] is None and body["chamber"] == "house"


def test_no_map_yet_but_demographics_present(client: TestClient) -> None:
    _use(
        {
            "mart.member_constituency": [
                _constituency(map_state=None, map_district=None, map_source_url=None)
            ],
            "mart.constituency_demographics": [_demographics()],
        }
    )
    body = _get(client)
    assert body["map"] is None
    assert body["demographics"]["population"]["value"] == 742318
    assert [s["source"] for s in body["sources"]] == ["census_acs"]


def test_unknown_member_is_404(client: TestClient) -> None:
    app.dependency_overrides[get_session] = lambda: _StubSession([])
    assert client.get("/api/v1/members/X000000/constituency").status_code == 404
