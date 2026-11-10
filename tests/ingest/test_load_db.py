"""Run bookkeeping in meta.ingest_run: a run that never finished is closed by the next one."""

from __future__ import annotations

import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.freshness import read_statuses
from ingest.http import SourceUnavailable
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


def test_a_refused_run_is_recorded_so_the_freshness_check_recognises_it(
    migrated_engine: Engine,
) -> None:
    """The stored error text is the only link between the raise and the report (ADR 0020)."""
    try:
        with connect() as conn, record_run(conn, SOURCE, "https://example.test") as run:
            run.rows_loaded = 4
        with pytest.raises(SourceUnavailable), connect() as conn:
            with record_run(conn, SOURCE, "https://example.test"):
                raise SourceUnavailable("https://example.test/menu.xml answered HTTP 403")

        succeeded, refused = _runs(migrated_engine)
        assert succeeded["status"] == "success" and refused["status"] == "failed"
        assert refused["error"].startswith("SourceUnavailable: https://example.test/menu.xml")
        with connect() as conn:
            (status,) = read_statuses(conn, [SOURCE])
        assert status.unavailable and status.rows_loaded == 4

        # The first run that gets through clears it.
        with connect() as conn, record_run(conn, SOURCE, "https://example.test") as run:
            run.rows_loaded = 9
        with connect() as conn:
            (status,) = read_statuses(conn, [SOURCE])
        assert not status.unavailable and status.rows_loaded == 9
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE source = :s"), {"s": SOURCE})
