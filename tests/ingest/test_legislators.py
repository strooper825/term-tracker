"""Parsing and shape validation for the congress-legislators source, from fixtures."""

from __future__ import annotations

import pytest
import yaml

from ingest.sources import legislators as src
from tests.fixtures.legislators import fixture_fetch


def test_parse_legislators_fixture() -> None:
    data = src.parse_legislators(fixture_fetch(src.BASE_URL + src.LEGISLATORS_FILE))
    by_id = {item["id"]["bioguide"]: item for item in data}
    assert set(by_id) == {"S001213", "C001095", "B001230"}

    steil = by_id["S001213"]["terms"][-1]
    assert (steil["type"], steil["state"], steil["district"]) == ("rep", "WI", 1)
    # upstream quotes dates, so they arrive as strings
    assert (steil["start"], steil["end"]) == ("2025-01-03", "2027-01-03")

    cotton = by_id["C001095"]["terms"][-1]
    assert (cotton["type"], cotton["state"], cotton["class"]) == ("sen", "AR", 2)
    assert (cotton["start"], cotton["end"]) == ("2021-01-03", "2027-01-03")


def test_parse_committees_fixture() -> None:
    data = src.parse_committees(fixture_fetch(src.BASE_URL + src.COMMITTEES_FILE))
    ids = {item["thomas_id"] for item in data}
    assert {"HSBA", "HSHA", "SSAS", "SLIN"} <= ids
    hsba = next(item for item in data if item["thomas_id"] == "HSBA")
    assert {sub["thomas_id"] for sub in hsba["subcommittees"]} >= {"16", "21"}


def test_parse_memberships_fixture() -> None:
    data = src.parse_memberships(fixture_fetch(src.BASE_URL + src.MEMBERSHIP_FILE))
    hsha = {m["bioguide"]: m for m in data["HSHA"]}
    assert hsha["S001213"]["title"] == "Chair"
    slin = {m["bioguide"]: m for m in data["SLIN"]}
    assert slin["C001095"]["title"] == "Chairman"


BAD_TERM = {"type": "rep", "start": "2025-01-03", "end": "2027-01-03", "state": "WISC"}


@pytest.mark.parametrize(
    ("parser", "bad_text"),
    [
        (src.parse_legislators, "not: a list"),
        (src.parse_legislators, yaml.safe_dump([{"id": {"govtrack": 1}, "name": {}, "terms": []}])),
        (
            src.parse_legislators,
            yaml.safe_dump(
                [
                    {
                        "id": {"bioguide": "S001213"},
                        "name": {"first": "A", "last": "B"},
                        "terms": [BAD_TERM],
                    }
                ]
            ),
        ),
        (src.parse_committees, yaml.safe_dump([{"name": "X", "type": "house"}])),
        (
            src.parse_committees,
            yaml.safe_dump([{"name": "X", "type": "tribunal", "thomas_id": "X"}]),
        ),
        (src.parse_memberships, yaml.safe_dump([{"bioguide": "S001213"}])),
        (src.parse_memberships, yaml.safe_dump({"HSXX": [{"name": "no bioguide"}]})),
    ],
)
def test_shape_changes_stop_the_run(parser, bad_text: str) -> None:
    with pytest.raises(src.SourceShapeError, match="shape differs"):
        parser(bad_text)
