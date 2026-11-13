"""GET /api/v1/congress/seats with the database dependency stubbed out."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from api.db import get_session
from api.main import app

FETCHED = datetime(2026, 11, 12, 6, 0, tzinfo=UTC)
URL = "https://unitedstates.github.io/congress-legislators/legislators-current.yaml"


def _row(**overrides) -> dict:
    row = {
        "seat_key": "house-WI-1",
        "chamber": "house",
        "state_abbr": "WI",
        "state_name": "Wisconsin",
        "district": 1,
        "senate_class": None,
        "state_rank": None,
        "bioguide_id": "S001213",
        "official_full_name": "Bryan Steil",
        "last_name": "Steil",
        "party": "Republican",
        "caucus": None,
        "is_tracked": True,
        "photo_url": "https://www.congress.gov/img/member/s001213_200.jpg",
        "website_url": "https://steil.house.gov",
        "source": "legislators",
        "source_url": URL,
        "fetched_at": FETCHED,
    }
    row.update(overrides)
    return row


class _Session:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self.sql = ""

    def execute(self, statement, *_args, **_kwargs):
        self.sql = str(statement)
        rows = self.rows

        class _Result:
            def mappings(self):
                return self

            def all(self):
                return rows

        return _Result()


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_seats_lists_tracked_and_untracked_holders(client: TestClient) -> None:
    rows = [
        _row(),
        _row(
            seat_key="senate-VT-1",
            chamber="senate",
            state_abbr="VT",
            state_name="Vermont",
            district=None,
            senate_class=1,
            state_rank="junior",
            bioguide_id="S000033",
            official_full_name="Bernard Sanders",
            last_name="Sanders",
            party="Independent",
            caucus="Democrat",
            is_tracked=False,
            website_url=None,
        ),
    ]
    session = _Session(rows)
    app.dependency_overrides[get_session] = lambda: session
    response = client.get("/api/v1/congress/seats")
    assert response.status_code == 200
    body = response.json()
    assert "FROM mart.seat" in session.sql
    steil, sanders = body["seats"]
    assert steil == {
        "seat_key": "house-WI-1",
        "chamber": "house",
        "state": "WI",
        "state_name": "Wisconsin",
        "district": 1,
        "senate_class": None,
        "state_rank": None,
        "bioguide_id": "S001213",
        "name": "Bryan Steil",
        "last_name": "Steil",
        "party": "Republican",
        "caucus": None,
        "is_tracked": True,
        "photo_url": "https://www.congress.gov/img/member/s001213_200.jpg",
        "website_url": "https://steil.house.gov",
    }
    assert sanders["party"] == "Independent"
    assert sanders["caucus"] == "Democrat"
    assert sanders["is_tracked"] is False
    assert sanders["district"] is None
    # one provenance entry for the one snapshot both rows came from
    assert body["sources"] == [
        {"source": "legislators", "source_url": URL, "fetched_at": "2026-11-12T06:00:00Z"}
    ]


def test_seats_is_listed_in_openapi(client: TestClient) -> None:
    assert "/api/v1/congress/seats" in client.get("/openapi.json").json()["paths"]
