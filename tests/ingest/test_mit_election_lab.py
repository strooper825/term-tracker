"""MIT Election Lab source: committed snapshots, checksum manifest, parsing, contest grouping."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from ingest.sources import mit_election_lab as src
from tests.fixtures.mit_election_lab import FIXTURE_CONTESTS, FIXTURE_DIR, FIXTURE_SNAPSHOTS

SENATE = next(s for s in src.SNAPSHOTS if s.office == "senate")
HEADER = (
    "year,state,state_po,state_fips,state_cen,state_ic,office,district,stage,special,candidate,"
    "party_detailed,writein,mode,candidatevotes,totalvotes,unofficial,version,party_simplified\n"
)
ROW = (
    "2024,VERMONT,VT,50,13.0,6,US SENATE,statewide,GEN,False,BERNIE SANDERS,INDEPENDENT,False,"
    "TOTAL,229429.0,372885.0,False,11/20/25,OTHER\n"
)


@pytest.mark.parametrize("snapshot", src.SNAPSHOTS, ids=lambda s: s.office)
def test_committed_snapshot_matches_the_dataverse_checksum(snapshot: src.Snapshot) -> None:
    """The files under data/ are the Dataverse originals for the recorded version, byte for byte."""
    path = src.DATA_DIR / snapshot.filename
    assert path.exists(), f"{path} must be committed (ADR 0008)"
    assert src.verified_md5(snapshot, path) == snapshot.md5


def test_changed_snapshot_is_refused(tmp_path: Path) -> None:
    path = tmp_path / SENATE.filename
    path.write_text(HEADER + ROW, encoding="utf-8")
    with pytest.raises(src.SourceShapeError, match="not the Dataverse checksum"):
        src.verified_md5(SENATE, path)
    with pytest.raises(FileNotFoundError, match="committed with the repository"):
        src.verified_md5(SENATE, tmp_path / "absent.csv")


def test_parse_keeps_values_verbatim() -> None:
    rows = src.parse(SENATE, HEADER + ROW)
    assert rows == [
        {
            "year": "2024",
            "state": "VERMONT",
            "state_po": "VT",
            "state_fips": "50",
            "state_cen": "13.0",
            "state_ic": "6",
            "office": "US SENATE",
            "district": "statewide",
            "stage": "GEN",
            "special": "False",
            "candidate": "BERNIE SANDERS",
            "party_detailed": "INDEPENDENT",
            "writein": "False",
            "mode": "TOTAL",
            "candidatevotes": "229429.0",
            "totalvotes": "372885.0",
            "unofficial": "False",
            "version": "11/20/25",
            "party_simplified": "OTHER",
        }
    ]


@pytest.mark.parametrize(
    ("text", "message"),
    [
        (HEADER.replace(",candidatevotes", ",votes") + ROW, "columns \\['candidatevotes'\\]"),
        (HEADER + ROW.replace("US SENATE", "US HOUSE"), "office 'US HOUSE'"),
        (HEADER + ROW.replace("229429.0", ""), "row 2"),
        (HEADER + ROW.replace(",False,BERNIE", ",maybe,BERNIE"), "special"),
    ],
    ids=["missing column", "wrong office", "empty votes", "bad boolean"],
)
def test_parse_stops_on_shape_changes(text: str, message: str) -> None:
    with pytest.raises(src.SourceShapeError, match=message):
        src.parse(SENATE, text)


def test_uncounted_uncontested_race_placeholder_parses() -> None:
    """totalvotes -1 is the codebook's marker for an uncontested race with no count."""
    rows = src.parse(SENATE, HEADER + ROW.replace("229429.0,372885.0", "1,-1"))
    assert (rows[0]["candidatevotes"], rows[0]["totalvotes"]) == ("1", "-1")
    with pytest.raises(src.SourceShapeError, match="row 2"):
        src.parse(SENATE, HEADER + ROW.replace("229429.0", "-2"))


def test_contests_group_rows_and_normalise_keys() -> None:
    snapshot = next(s for s in FIXTURE_SNAPSHOTS if s.office == "senate")
    text = (FIXTURE_DIR / snapshot.filename).read_text(encoding="utf-8")
    grouped = src.contests(snapshot, src.parse(snapshot, text))
    assert set(grouped) == {key for key in FIXTURE_CONTESTS if key[0] == "senate"}
    connecticut = grouped[("senate", 2024, "CT", "statewide", "gen", False)]
    murphy = [r for r in connecticut if r["candidate"] == "CHRISTOPHER S. MURPHY"]
    assert [r["party_detailed"] for r in murphy] == ["DEMOCRATIC", "WORKING FAMILIES"]
    # stage GEN (2024) and gen (2020) land on the same lower-cased key
    assert ("senate", 2020, "AR", "statewide", "gen", False) in grouped


def test_fixture_snapshots_differ_from_the_manifest_only_in_checksum() -> None:
    for committed, fixture in zip(src.SNAPSHOTS, FIXTURE_SNAPSHOTS, strict=True):
        assert fixture.md5 is None
        assert replace(fixture, md5=committed.md5) == committed


def test_house_file_is_comma_separated_with_a_party_column() -> None:
    """The House original is comma-separated under a .tab name, with party, not party_detailed."""
    snapshot = next(s for s in FIXTURE_SNAPSHOTS if s.office == "house")
    text = (FIXTURE_DIR / snapshot.filename).read_text(encoding="utf-8")
    grouped = src.contests(snapshot, src.parse(snapshot, text))
    assert set(grouped) == {key for key in FIXTURE_CONTESTS if key[0] == "house"}
    ny8 = grouped[("house", 2024, "NY", "8", "gen", False)]
    delaney = [(r["party"], r["fusion_ticket"]) for r in ny8 if r["candidate"] == "JOHN J. DELANEY"]
    assert sorted(delaney) == [("CONSERVATIVE", "TRUE"), ("REPUBLICAN", "FALSE")]
    with pytest.raises(src.SourceShapeError, match="party_detailed"):
        src.parse(SENATE, text.replace("US HOUSE", "US SENATE"))
