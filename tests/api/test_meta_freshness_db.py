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
SOURCE_C = "test_source_c"

INSERT_RUN = text(
    "INSERT INTO meta.ingest_run (source, source_url, status, finished_at, rows_loaded, error) "
    "VALUES (:source, :url, :status, CAST(:finished_at AS timestamptz), :rows, :error)"
)
REFUSED = "SourceUnavailable: https://c.example/menu.xml answered HTTP 403"


@pytest.fixture
def seeded_runs(migrated_engine: Engine) -> Iterator[None]:
    rows = [
        # source A: an older success then a newer failure -> the older success is still fresh
        (SOURCE_A, "https://a.example", "success", "2026-09-10T06:00:00Z", 10, None),
        (SOURCE_A, "https://a.example", "failed", "2026-09-11T06:00:00Z", None, "KeyError: 'x'"),
        # source B: two successes -> the latest wins
        (SOURCE_B, "https://b.example", "success", "2026-09-10T06:00:00Z", 5, None),
        (SOURCE_B, "https://b.example", "success", "2026-09-11T06:00:00Z", 7, None),
        # source B: a run still in flight is ignored
        (SOURCE_B, "https://b.example", "running", None, None, None),
        # source C: refused on the two newest runs -> the old success, flagged unavailable
        (SOURCE_C, "https://c.example", "success", "2026-09-09T06:00:00Z", 3, None),
        (SOURCE_C, "https://c.example", "failed", "2026-09-10T06:00:00Z", None, REFUSED),
        (SOURCE_C, "https://c.example", "failed", "2026-09-11T06:00:00Z", None, REFUSED),
    ]
    with migrated_engine.begin() as conn:
        for source, url, status, finished_at, rows_loaded, error in rows:
            conn.execute(
                INSERT_RUN,
                {
                    "source": source,
                    "url": url,
                    "status": status,
                    "finished_at": finished_at,
                    "rows": rows_loaded,
                    "error": error,
                },
            )
    try:
        yield
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(
                text("DELETE FROM meta.ingest_run WHERE source IN (:a, :b, :c)"),
                {"a": SOURCE_A, "b": SOURCE_B, "c": SOURCE_C},
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
    # An ordinary failure is the pipeline's to fix and is not "unavailable"; a refusal is, and a
    # later success clears it (source B's newest finished run is a success).
    assert by_source[SOURCE_A]["unavailable"] is False
    assert by_source[SOURCE_B]["unavailable"] is False
    assert by_source[SOURCE_C]["fetched_at"] == "2026-09-09T06:00:00Z"
    assert by_source[SOURCE_C]["unavailable"] is True


def test_freshness_check_reads_a_refused_source_the_same_way(
    seeded_runs: None, migrated_engine: Engine
) -> None:
    """ingest.freshness and the API must agree on which sources are refused (ADR 0020)."""
    from ingest.db import connect
    from ingest.freshness import read_statuses

    with connect() as conn:
        statuses = {s.source: s for s in read_statuses(conn, [SOURCE_A, SOURCE_B, SOURCE_C])}
    assert [statuses[s].unavailable for s in (SOURCE_A, SOURCE_B, SOURCE_C)] == [False, False, True]
    assert statuses[SOURCE_C].rows_loaded == 3


def test_status_check_constraint(migrated_engine: Engine) -> None:
    with pytest.raises(IntegrityError), migrated_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO meta.ingest_run (source, status) VALUES ('test_bad', 'bogus')")
        )
