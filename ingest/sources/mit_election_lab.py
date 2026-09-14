"""Source: MIT Election Data and Science Lab constituency returns (prior election results).

Two snapshots committed under ``data/mit_election_lab/`` and loaded from the repository, not
the network (ADR 0008): *U.S. House 1976–2024* and *U.S. Senate statewide 1976–2024* from
Harvard Dataverse, in their original upload format. The House file sits behind a Dataverse
guestbook that requires a name, email, institution and position, so an unattended job cannot
fetch it; both files are downloaded by hand and refreshed after each certified cycle. Each
file's MD5 must equal the checksum Dataverse publishes for the recorded dataset version, so a
snapshot cannot change without this manifest changing with it.

Rows are grouped by contest (office, year, state, district, stage, special) and each contest
is upserted into ``raw.election_return_contest`` with its rows, verbatim, as the payload. When
the stored contests already carry the file's MD5 the file is not parsed again: a normal night
hashes two files and records a success with zero rows. ``--full-refresh`` reloads both.
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb
from pydantic import ValidationError

from ingest.db import connect
from ingest.load import record_run, upsert
from ingest.models.mit_election_lab import ElectionReturnRow

log = logging.getLogger("ingest.mit_election_lab")

SOURCE = "mit_election_lab"
BASE_URL = "https://dataverse.harvard.edu/dataverse/electionscience"
DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "mit_election_lab"
KEY_COLUMNS = ["office", "year", "state_po", "district", "stage", "special"]


class SourceShapeError(RuntimeError):
    """The snapshot does not have the shape docs/PLAN.md expects. Stop and report."""


@dataclass(frozen=True)
class Snapshot:
    office: str  # house / senate: the key value stored in raw
    filename: str
    delimiter: str
    office_value: str  # the file's own office column, checked on every row
    party_column: str  # party_detailed in the Senate file, party in the House file
    doi: str
    version: str
    md5: str | None  # Dataverse checksum of the original file; None only for test fixtures
    retrieved_at: str  # ISO timestamp the file was downloaded from Dataverse

    @property
    def source_url(self) -> str:
        return (
            "https://dataverse.harvard.edu/dataset.xhtml"
            f"?persistentId=doi:{self.doi}&version={self.version}"
        )


SNAPSHOTS: tuple[Snapshot, ...] = (
    Snapshot(
        office="house",
        # Named .tab by Dataverse, but the original upload is comma-separated (verified 2026-09-14).
        filename="1976-2024-house.tab",
        delimiter=",",
        office_value="US HOUSE",
        party_column="party",
        doi="10.7910/DVN/IG0UN2",
        version="15.0",
        md5="a9566ac393913a1af343284e837c17bb",
        retrieved_at="2026-09-14T00:00:00+00:00",
    ),
    Snapshot(
        office="senate",
        filename="1976-2024-senate-state.csv",
        delimiter=",",
        office_value="US SENATE",
        party_column="party_detailed",
        doi="10.7910/DVN/PEJ5QU",
        version="8.0",
        md5="0f8b51cf0f77a2ef0bff992f7a64d1b4",
        retrieved_at="2026-09-14T03:15:00+00:00",
    ),
)


def file_md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()  # noqa: S324 - matches Dataverse's checksum


def verified_md5(snapshot: Snapshot, path: Path) -> str:
    """The file's MD5, after checking it equals the manifest checksum (when there is one)."""
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is missing; the snapshot is committed with the repository (ADR 0008)"
        )
    md5 = file_md5(path)
    if snapshot.md5 is not None and md5 != snapshot.md5:
        raise SourceShapeError(
            f"{snapshot.filename}: MD5 {md5} is not the Dataverse checksum {snapshot.md5} for "
            f"version {snapshot.version}; update the manifest in "
            "ingest/sources/mit_election_lab.py together with the file"
        )
    return md5


def parse(snapshot: Snapshot, text: str) -> list[dict[str, str]]:
    """Every row of the file, validated. Values stay the strings the file holds."""
    reader = csv.DictReader(io.StringIO(text), delimiter=snapshot.delimiter)
    required = set(ElectionReturnRow.model_fields) | {snapshot.party_column}
    missing = sorted(required - set(reader.fieldnames or []))
    if missing:
        raise SourceShapeError(
            f"{snapshot.filename}: columns {missing} missing; shape differs from what "
            "docs/PLAN.md expects, not adapting in place"
        )
    rows = list(reader)
    for index, row in enumerate(rows):
        try:
            ElectionReturnRow.model_validate(row)
        except ValidationError as exc:
            raise SourceShapeError(f"{snapshot.filename} row {index + 2}: {exc}") from exc
        if row["office"] != snapshot.office_value:
            raise SourceShapeError(
                f"{snapshot.filename} row {index + 2}: office {row['office']!r}, "
                f"expected {snapshot.office_value!r}"
            )
    return rows


def contests(snapshot: Snapshot, rows: Sequence[dict[str, str]]) -> dict[tuple, list[dict]]:
    """Rows grouped by the contest key, in file order."""
    grouped: dict[tuple, list[dict]] = {}
    for row in rows:
        key = (
            snapshot.office,
            int(row["year"]),
            row["state_po"],
            row["district"].strip(),
            row["stage"].strip().lower(),
            row["special"].strip().lower() == "true",
        )
        grouped.setdefault(key, []).append(row)
    return grouped


def _stored_with_md5(conn: Connection, office: str, md5: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM raw.election_return_contest WHERE office = %s AND file_md5 = %s",
            (office, md5),
        )
        row = cur.fetchone()
    return int(row[0]) if row else 0


def load(
    conn: Connection,
    *,
    data_dir: Path = DATA_DIR,
    snapshots: Sequence[Snapshot] = SNAPSHOTS,
    full_refresh: bool = False,
) -> int:
    """Load every snapshot whose contents are not already stored. Returns contests upserted."""
    with record_run(conn, SOURCE, BASE_URL) as run:
        total = 0
        for snapshot in snapshots:
            path = data_dir / snapshot.filename
            md5 = verified_md5(snapshot, path)
            if not full_refresh and _stored_with_md5(conn, snapshot.office, md5):
                log.info("%s: unchanged (MD5 %s), not reloaded", snapshot.filename, md5)
                continue

            grouped = contests(snapshot, parse(snapshot, path.read_text(encoding="utf-8")))
            fetched_at = datetime.fromisoformat(snapshot.retrieved_at)
            records: list[dict[str, Any]] = [
                {
                    **dict(zip(KEY_COLUMNS, key, strict=True)),
                    "payload": Jsonb(rows),
                    "file_md5": md5,
                    "dataset_version": snapshot.version,
                    "source_url": snapshot.source_url,
                    "fetched_at": fetched_at,
                }
                for key, rows in grouped.items()
            ]
            total += upsert(conn, "raw", "election_return_contest", KEY_COLUMNS, records)
            log.info(
                "%s: %d rows in %d contests (version %s)",
                snapshot.filename,
                sum(len(r) for r in grouped.values()),
                len(grouped),
                snapshot.version,
            )
        run.rows_loaded = total
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:
    with connect() as conn:
        return load(conn, full_refresh=full_refresh)
