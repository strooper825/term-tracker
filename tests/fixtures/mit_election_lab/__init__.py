"""Fixture snapshots for the MIT Election Lab source (no network, no committed-data checksum).

Trimmed from the committed files under data/mit_election_lab/ with rows kept verbatim: the
contests behind the six tracked members prior elections (House 2024 WI-1, CA-3, NY-8; Senate
2020 Arkansas, 2024 Vermont and Michigan) plus Connecticut 2024 Senate, where the winner is on
two party lines. The manifest checksums are dropped because the files are trimmed.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from ingest.sources.mit_election_lab import SNAPSHOTS

FIXTURE_DIR = Path(__file__).resolve().parent
FIXTURE_SNAPSHOTS = tuple(replace(snapshot, md5=None) for snapshot in SNAPSHOTS)
# (office, year, state, district, stage, special) of every contest in the fixture files
FIXTURE_CONTESTS = {
    ("house", 2024, "WI", "1", "gen", False),
    ("house", 2024, "CA", "3", "gen", False),
    ("house", 2024, "NY", "8", "gen", False),
    ("senate", 2020, "AR", "statewide", "gen", False),
    ("senate", 2024, "VT", "statewide", "gen", False),
    ("senate", 2024, "MI", "statewide", "gen", False),
    ("senate", 2024, "CT", "statewide", "gen", False),
}
