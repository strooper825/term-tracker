"""Unit tests for the per-member endpoints with the database dependency stubbed out."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from api.db import get_session
from api.main import app
from api.routers.member import decode_cursor, encode_cursor


class _Result:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict]:
        return self._rows

    def first(self) -> dict | None:
        return self._rows[0] if self._rows else None


class _StubSession:
    """Answers every query with the same rows (enough for 404 and validation paths)."""

    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    def execute(self, *_args, **_kwargs) -> _Result:
        return _Result(self.rows)


def _use_rows(rows: list[dict]) -> None:
    app.dependency_overrides[get_session] = lambda: _StubSession(rows)


def teardown_function() -> None:
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "path",
    ["", "/timeline", "/feed", "/votes", "/bills", "/committees", "/key-dates"],
)
def test_unknown_member_is_404(client: TestClient, path: str) -> None:
    _use_rows([])
    response = client.get(f"/api/v1/members/X000000{path}")
    assert response.status_code == 404
    assert "X000000" in response.json()["detail"]


def test_cursor_round_trip() -> None:
    at = datetime(2026, 9, 12, 14, 30, tzinfo=UTC)
    cursor = encode_cursor(at, "vote:house:2:249")
    assert "=" not in cursor
    assert decode_cursor(cursor) == (at, "vote:house:2:249")


def test_malformed_cursor_is_400(client: TestClient) -> None:
    _use_rows([_summary_row()])
    response = client.get("/api/v1/members/S001213/feed?cursor=not-a-cursor")
    assert response.status_code == 400


@pytest.mark.parametrize(
    ("path", "status"),
    [
        ("/feed?limit=0", 422),
        ("/feed?limit=201", 422),
        ("/votes?limit=0", 422),
        ("/bills?role=author", 422),
        ("/timeline?from=2026-02-01&to=2026-01-01", 400),
        ("/timeline?from=yesterday", 422),
    ],
)
def test_parameter_validation(client: TestClient, path: str, status: int) -> None:
    _use_rows([_summary_row()])
    assert client.get(f"/api/v1/members/S001213{path}").status_code == status


def test_openapi_lists_every_section_6_endpoint(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    expected = {
        "/api/v1/members",
        "/api/v1/members/{bioguide}",
        "/api/v1/members/{bioguide}/timeline",
        "/api/v1/members/{bioguide}/feed",
        "/api/v1/members/{bioguide}/votes",
        "/api/v1/members/{bioguide}/bills",
        "/api/v1/members/{bioguide}/committees",
        "/api/v1/members/{bioguide}/key-dates",
        "/api/v1/meta/freshness",
    }
    assert expected <= set(paths)
    assert client.get("/docs").status_code == 200


def _summary_row() -> dict:
    return {
        "bioguide_id": "S001213",
        "first_name": "Bryan",
        "last_name": "Steil",
        "official_full_name": "Bryan Steil",
        "photo_url": None,
        "govtrack_id": 1,
        "icpsr_id": 2,
        "fec_ids": ["H8WI01156"],
        "congress": 119,
        "chamber": "house",
        "party": "Republican",
        "state_abbr": "WI",
        "state_name": "Wisconsin",
        "fips_state": "55",
        "district": 1,
        "senate_class": None,
        "state_rank": None,
        "term_start_date": datetime(2025, 1, 3).date(),
        "term_end_date": datetime(2027, 1, 3).date(),
        "roll_calls": 5,
        "positions": 5,
        "votes_cast": 4,
        "not_voting": 1,
        "attendance_pct": 80.0,
        "missed_vote_pct": 20.0,
        "party_unity_pct": 100.0,
        "party_unity_cq_pct": None,
        "bills_sponsored": 2,
        "bills_cosponsored": 2,
        "committees": 6,
        "source": "legislators",
        "source_url": "https://example.test/legislators-current.yaml",
        "fetched_at": datetime(2026, 9, 12, tzinfo=UTC),
    }


def test_member_detail_from_summary_row(client: TestClient) -> None:
    _use_rows([_summary_row()])
    body = client.get("/api/v1/members/S001213").json()
    assert body["seat"]["label"] == "WI-1"
    assert body["term"]["end_date"] == "2027-01-03"
    assert body["term"]["days_remaining"] >= 0
    assert body["votes"]["attendance_pct"] == 80.0
    assert body["activity"] == {"bills_sponsored": 2, "bills_cosponsored": 2, "committees": 6}
    assert body["sources"][0]["source"] == "legislators"
