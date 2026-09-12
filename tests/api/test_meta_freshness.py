"""Unit tests for /api/v1/meta/freshness with the database dependency stubbed out."""

from __future__ import annotations

from datetime import UTC, datetime

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
