"""The Census sources against Postgres: idempotent upserts, the skip check, run bookkeeping."""

from __future__ import annotations

import pytest
from sqlalchemy import Engine, text

from ingest.census import SourceShapeError
from ingest.db import connect
from ingest.sources import census_acs, census_geography
from tests.fixtures.census import (
    ACS_MINIMUMS,
    ACS_YEAR,
    CONGRESS,
    GEOGRAPHY_MINIMUMS,
    SENTINEL,
    YEAR,
    FixtureFiles,
    acs_fetch,
    census_client,
)

pytestmark = pytest.mark.integration


def _geometry_count(engine: Engine) -> int:
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT count(*) FROM raw.constituency_geometry WHERE congress = :c"),
            {"c": CONGRESS},
        ).scalar_one()


def _load_geometry(files: FixtureFiles, **kwargs) -> int:
    with connect() as conn:
        return census_geography.load(conn, files, YEAR, minimums=GEOGRAPHY_MINIMUMS, **kwargs)


def test_geometry_load_is_idempotent_and_skips_unchanged_files(migrated_engine: Engine) -> None:
    files = FixtureFiles()
    assert _load_geometry(files, full_refresh=True) == 10  # 6 states + 4 districts
    assert files.downloads == 3
    count = _geometry_count(migrated_engine)

    # nothing moved upstream: no download, no geometry work, no rows
    assert _load_geometry(files) == 0
    assert files.downloads == 3
    # full refresh ignores the stamp; the upsert keeps the row count
    assert _load_geometry(files, full_refresh=True) == 10
    assert files.downloads == 6
    assert _geometry_count(migrated_engine) == count

    # a new Last-Modified is a new vintage of the files: reload
    assert _load_geometry(FixtureFiles(stamp="Fri, 01 May 2026 00:00:00 GMT")) == 10
    with migrated_engine.connect() as conn:
        stamps = (
            conn.execute(
                text(
                    "SELECT DISTINCT source_modified FROM raw.constituency_geometry "
                    "WHERE congress = :c"
                ),
                {"c": CONGRESS},
            )
            .scalars()
            .all()
        )
    assert len(stamps) == 1 and "Fri, 01 May 2026" in stamps[0]


def test_a_server_without_last_modified_is_never_skipped(migrated_engine: Engine) -> None:
    files = FixtureFiles(stamp="")
    assert _load_geometry(files, full_refresh=True) == 10
    assert _load_geometry(files) == 10  # nothing to compare, so it reloads


def test_geometry_rows_hold_paths_not_geometry(migrated_engine: Engine) -> None:
    _load_geometry(FixtureFiles(), full_refresh=True)
    with migrated_engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT kind, payload, source_url FROM raw.constituency_geometry "
                "WHERE congress = :c AND geoid = '5501'"
            ),
            {"c": CONGRESS},
        ).one()
    assert row.kind == "district" and row.source_url.endswith("cb_2025_us_cd119_500k.zip")
    assert set(row.payload) == {
        "name",
        "state_geoid",
        "frame",
        "outline",
        "counties",
        "in_state",
        "county_source_url",
    }
    assert row.payload["outline"].startswith("M")


def test_a_failed_geometry_run_is_recorded_and_leaves_no_partial_rows(
    migrated_engine: Engine,
) -> None:
    _load_geometry(FixtureFiles(), full_refresh=True)
    before = _geometry_count(migrated_engine)
    with connect() as conn, pytest.raises(SourceShapeError):
        # the real thresholds: six fixture states are not a national file
        census_geography.load(conn, FixtureFiles(), YEAR, full_refresh=True)
    assert _geometry_count(migrated_engine) == before
    with migrated_engine.connect() as conn:
        status, error = conn.execute(
            text(
                "SELECT status, error FROM meta.ingest_run WHERE source = 'census_geography' "
                "ORDER BY id DESC LIMIT 1"
            )
        ).one()
    assert status == "failed" and "expected at least 50 states" in error


def test_acs_load_stores_values_verbatim_and_is_idempotent(migrated_engine: Engine) -> None:
    with connect() as conn:
        assert census_acs.load(conn, census_client(), ACS_YEAR, minimums=ACS_MINIMUMS) == 10
    with connect() as conn:
        assert census_acs.load(conn, census_client(), ACS_YEAR, minimums=ACS_MINIMUMS) == 10
    with migrated_engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM raw.acs_estimate WHERE acs_year = :y"), {"y": ACS_YEAR}
            ).scalar_one()
            >= 10
        )
        wi1 = conn.execute(
            text("SELECT congress, kind, payload FROM raw.acs_estimate WHERE geoid = '5501'")
        ).one()
        vt = conn.execute(
            text("SELECT payload FROM raw.acs_estimate WHERE geoid = '5000'")
        ).scalar_one()
    assert (wi1.congress, wi1.kind) == (119, "district")
    assert wi1.payload["profile"]["DP05_0001E"] == "700000"  # a string, as the API sends it
    assert vt["profile"]["DP03_0062E"] == SENTINEL  # the sentinel is not cleaned in raw


def test_an_acs_year_with_no_known_congress_stops_the_run_before_any_request(
    migrated_engine: Engine,
) -> None:
    with connect() as conn, pytest.raises(SourceShapeError, match="not in the table"):
        census_acs.load(conn, census_client(acs_fetch), 2099, minimums=ACS_MINIMUMS)
