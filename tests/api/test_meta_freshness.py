"""Unit tests for /api/v1/meta/freshness with the database dependency stubbed out."""

from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi.testclient import TestClient

from api.db import get_session
from api.main import app


class _Result:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict]:
        return self._rows


class _StubSession:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    def execute(self, *_args, **_kwargs) -> _Result:
        return _Result(self.rows)


def _use_rows(rows: list[dict]) -> None:
    app.dependency_overrides[get_session] = lambda: _StubSession(rows)


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_freshness_empty_returns_200(client: TestClient) -> None:
    _use_rows([])
    response = client.get("/api/v1/meta/freshness")
    assert response.status_code == 200
    body = response.json()
    assert body["sources"] == []
    assert datetime.fromisoformat(body["generated_at"]).tzinfo is not None


def test_freshness_maps_rows(client: TestClient) -> None:
    finished = datetime(2026, 9, 12, 6, 15, tzinfo=UTC)
    _use_rows(
        [
            {
                "source": "congress_gov",
                "source_url": "https://api.congress.gov/v3",
                "finished_at": finished,
                "rows_loaded": 42,
            }
        ]
    )
    response = client.get("/api/v1/meta/freshness")
    assert response.status_code == 200
    assert response.json()["sources"] == [
        {
            "source": "congress_gov",
            "source_url": "https://api.congress.gov/v3",
            "fetched_at": "2026-09-12T06:15:00Z",
            "rows_loaded": 42,
        }
    ]


def test_openapi_docs_render(client: TestClient) -> None:
    assert client.get("/docs").status_code == 200
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/meta/freshness" in paths


def _session_row(**overrides) -> dict:
    row = {
        "congress": 119,
        "session": 2,
        "session_year": 2026,
        "start_date": date(2026, 1, 3),
        "end_date": date(2027, 1, 3),
        "first_roll_call_date": date(2026, 1, 5),
        "last_roll_call_date": date(2026, 9, 10),
        "roll_calls": 526,
        "is_current": True,
        "source": "congress_gov",
        "source_url": "https://www.congress.gov/days-in-session",
        "fetched_at": datetime(2026, 9, 13, tzinfo=UTC),
    }
    row.update(overrides)
    return row


def test_sessions_returns_the_bounds_the_feed_filter_uses(client: TestClient) -> None:
    _use_rows(
        [
            _session_row(
                session=1,
                session_year=2025,
                start_date=date(2025, 1, 3),
                end_date=date(2026, 1, 2),
                is_current=False,
            ),
            _session_row(),
        ]
    )
    body = client.get("/api/v1/meta/sessions").json()
    assert [s["session"] for s in body["sessions"]] == [1, 2]
    current = [s for s in body["sessions"] if s["is_current"]]
    assert len(current) == 1
    assert current[0] == {
        "congress": 119,
        "session": 2,
        "year": 2026,
        "start_date": "2026-01-03",
        "end_date": "2027-01-03",
        "first_roll_call_date": "2026-01-05",
        "last_roll_call_date": "2026-09-10",
        "roll_calls": 526,
        "is_current": True,
    }
    assert body["sources"][0]["source"] == "congress_gov"


def test_sessions_on_an_empty_database_is_an_empty_list(client: TestClient) -> None:
    _use_rows([])
    body = client.get("/api/v1/meta/sessions").json()
    assert body == {"sessions": [], "sources": []}
