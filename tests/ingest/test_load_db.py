"""Run bookkeeping in meta.ingest_run: a run that never finished is closed by the next one."""

from __future__ import annotations

import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.load import ABANDONED, record_run

pytestmark = pytest.mark.integration

SOURCE = "test_abandoned_source"


def _runs(engine: Engine) -> list[dict]:
    with engine.connect() as conn:
        return [
            dict(r)
            for r in conn.execute(
                text(
                    "SELECT status, error, finished_at FROM meta.ingest_run "
                    "WHERE source = :source ORDER BY id"
                ),
                {"source": SOURCE},
            ).mappings()
        ]


def test_a_running_row_left_behind_is_closed_as_failed(migrated_engine: Engine) -> None:
    try:
        # What a cancelled workflow leaves: the up-front row, never updated.
        with migrated_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO meta.ingest_run (source, source_url, status) "
                    "VALUES (:s, 'https://example.test', 'running'), "
                    "('another_source', 'https://example.test', 'running')"
                ),
                {"s": SOURCE},
            )
        with connect() as conn, record_run(conn, SOURCE, "https://example.test") as run:
            run.rows_loaded = 1

        abandoned, finished = _runs(migrated_engine)
        assert abandoned["status"] == "failed" and abandoned["error"] == ABANDONED
        assert abandoned["finished_at"] is not None
        assert finished["status"] == "success"
        with migrated_engine.connect() as conn:  # another source's row is not this run's to close
            other = conn.execute(
                text("SELECT status FROM meta.ingest_run WHERE source = 'another_source'")
            ).scalar_one()
        assert other == "running"
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(
                text("DELETE FROM meta.ingest_run WHERE source IN (:s, 'another_source')"),
                {"s": SOURCE},
            )
