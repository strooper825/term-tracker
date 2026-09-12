"""Integration test: freshness against a migrated Postgres (see conftest for skip rules)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.exc import IntegrityError

pytestmark = pytest.mark.integration

SOURCE_A = "test_source_a"
SOURCE_B = "test_source_b"

INSERT_RUN = text(
    "INSERT INTO meta.ingest_run (source, source_url, status, finished_at, rows_loaded) "
    "VALUES (:source, :url, :status, CAST(:finished_at AS timestamptz), :rows)"
)


@pytest.fixture
def seeded_runs(migrated_engine: Engine) -> Iterator[None]:
    rows = [
        # source A: an older success then a newer failure -> the older success is still fresh
        (SOURCE_A, "https://a.example", "success", "2026-09-10T06:00:00Z", 10),
        (SOURCE_A, "https://a.example", "failed", "2026-09-11T06:00:00Z", None),
        # source B: two successes -> the latest wins
        (SOURCE_B, "https://b.example", "success", "2026-09-10T06:00:00Z", 5),
        (SOURCE_B, "https://b.example", "success", "2026-09-11T06:00:00Z", 7),
        # source B: a run still in flight is ignored
        (SOURCE_B, "https://b.example", "running", None, None),
    ]
    with migrated_engine.begin() as conn:
        for source, url, status, finished_at, rows_loaded in rows:
            conn.execute(
                INSERT_RUN,
                {
                    "source": source,
                    "url": url,
                    "status": status,
                    "finished_at": finished_at,
                    "rows": rows_loaded,
                },
            )
    try:
        yield
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(
                text("DELETE FROM meta.ingest_run WHERE source IN (:a, :b)"),
                {"a": SOURCE_A, "b": SOURCE_B},
            )


def test_freshness_on_migrated_database(migrated_engine: Engine, client: TestClient) -> None:
    response = client.get("/api/v1/meta/freshness")
    assert response.status_code == 200
    names = {row["source"] for row in response.json()["sources"]}
    assert not names & {SOURCE_A, SOURCE_B}


def test_freshness_returns_latest_success_per_source(seeded_runs: None, client: TestClient) -> None:
    response = client.get("/api/v1/meta/freshness")
    assert response.status_code == 200
    by_source = {row["source"]: row for row in response.json()["sources"]}

    assert by_source[SOURCE_A]["fetched_at"] == "2026-09-10T06:00:00Z"
    assert by_source[SOURCE_A]["rows_loaded"] == 10
    assert by_source[SOURCE_B]["fetched_at"] == "2026-09-11T06:00:00Z"
    assert by_source[SOURCE_B]["rows_loaded"] == 7


def test_status_check_constraint(migrated_engine: Engine) -> None:
    with pytest.raises(IntegrityError), migrated_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO meta.ingest_run (source, status) VALUES ('test_bad', 'bogus')")
        )
