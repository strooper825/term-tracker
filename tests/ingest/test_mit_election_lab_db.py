"""Loading the MIT Election Lab fixture snapshots into raw: idempotency, skip when unchanged."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.sources import mit_election_lab as src
from tests.fixtures.mit_election_lab import FIXTURE_CONTESTS, FIXTURE_DIR, FIXTURE_SNAPSHOTS

pytestmark = pytest.mark.integration


@pytest.fixture
def clean_runs(migrated_engine: Engine) -> Iterator[None]:
    with migrated_engine.connect() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()
    try:
        yield
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})


def _load(full_refresh: bool = False) -> int:
    with connect() as conn:
        return src.load(
            conn, data_dir=FIXTURE_DIR, snapshots=FIXTURE_SNAPSHOTS, full_refresh=full_refresh
        )


def test_load_keys_contests_and_skips_unchanged_files(
    migrated_engine: Engine, clean_runs: None
) -> None:
    with migrated_engine.begin() as conn:
        # Start from no fixture contests so the first load cannot be skipped by an earlier run.
        conn.execute(
            text("DELETE FROM raw.election_return_contest WHERE file_md5 = ANY(:md5s)"),
            {"md5s": [src.file_md5(FIXTURE_DIR / s.filename) for s in FIXTURE_SNAPSHOTS]},
        )
    assert _load() == len(FIXTURE_CONTESTS)
    assert _load() == 0  # both files unchanged: nothing parsed or rewritten
    assert _load(full_refresh=True) == len(FIXTURE_CONTESTS)

    with migrated_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT office, year, state_po, district, stage, special, "
                "jsonb_array_length(payload), dataset_version, source_url "
                "FROM raw.election_return_contest WHERE file_md5 = ANY(:md5s)"
            ),
            {"md5s": [src.file_md5(FIXTURE_DIR / s.filename) for s in FIXTURE_SNAPSHOTS]},
        ).all()
        runs = conn.execute(
            text(
                "SELECT status, rows_loaded FROM meta.ingest_run WHERE source = :s "
                "ORDER BY id DESC LIMIT 3"
            ),
            {"s": src.SOURCE},
        ).all()
    assert {tuple(r[:6]) for r in rows} == FIXTURE_CONTESTS
    by_key = {tuple(r[:6]): r for r in rows}
    connecticut = by_key[("senate", 2024, "CT", "statewide", "gen", False)]
    assert connecticut[6] == 6 and connecticut[7] == "8.0"
    assert connecticut[8].endswith("doi:10.7910/DVN/PEJ5QU&version=8.0")
    assert [tuple(r) for r in runs] == [
        ("success", len(FIXTURE_CONTESTS)),
        ("success", 0),
        ("success", len(FIXTURE_CONTESTS)),
    ]
