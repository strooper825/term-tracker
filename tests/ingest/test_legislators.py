"""Parsing and shape validation for the congress-legislators source, from fixtures."""

from __future__ import annotations

import pytest
import yaml

from ingest.shape import SourceShapeError
from ingest.sources import legislators as src
from tests.fixtures.legislators import fixture_fetch

SEVEN = {"S001213", "C001095", "B001230", "S000033", "S001208", "K000401", "J000294"}


def test_parse_legislators_fixture() -> None:
    data = src.parse_legislators(fixture_fetch(src.BASE_URL + src.LEGISLATORS_FILE))
    by_id = {item["id"]["bioguide"]: item for item in data}
    assert set(by_id) == SEVEN

    steil = by_id["S001213"]["terms"][-1]
    assert (steil["type"], steil["state"], steil["district"]) == ("rep", "WI", 1)
    # upstream quotes dates, so they arrive as strings
    assert (steil["start"], steil["end"]) == ("2025-01-03", "2027-01-03")

    cotton = by_id["C001095"]["terms"][-1]
    assert (cotton["type"], cotton["state"], cotton["class"]) == ("sen", "AR", 2)
    assert (cotton["start"], cotton["end"]) == ("2021-01-03", "2027-01-03")


def test_biography_terms_history_and_leadership_are_present() -> None:
    data = src.parse_legislators(fixture_fetch(src.BASE_URL + src.LEGISLATORS_FILE))
    by_id = {item["id"]["bioguide"]: item for item in data}

    assert by_id["S001213"]["bio"] == {"birthday": "1981-03-30", "gender": "M"}
    assert by_id["S001208"]["bio"]["gender"] == "F"
    assert by_id["J000294"]["name"]["middle"] == "S."
    assert by_id["S000033"]["name"]["nickname"] == "Bernie"

    # Independents carry the caucus they sit with; Kiley also carries the mid-term change
    sanders = by_id["S000033"]["terms"][-1]
    assert (sanders["party"], sanders["caucus"]) == ("Independent", "Democrat")
    kiley = by_id["K000401"]["terms"][-1]
    assert (kiley["party"], kiley["caucus"]) == ("Independent", "Republican")
    assert [a["party"] for a in kiley["party_affiliations"]] == ["Republican", "Independent"]

    # full terms history: Slotkin three House terms then one Senate term
    assert [t["type"] for t in by_id["S001208"]["terms"]] == ["rep", "rep", "rep", "sen"]
    assert len(by_id["S000033"]["terms"]) == 12

    # leadership roles: current ones have no end
    jeffries = by_id["J000294"]["leadership_roles"]
    assert jeffries[-1]["title"] == "House Minority Leader" and "end" not in jeffries[-1]
    assert "leadership_roles" not in by_id["S001213"]

    ids = by_id["C001095"]["id"]
    assert (ids["opensecrets"], ids["cspan"], ids["ballotpedia"], ids["wikipedia"]) == (
        "N00033363",
        63928,
        "Tom Cotton",
        "Tom Cotton",
    )


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


GOOD_TERM = {"type": "rep", "start": "2025-01-03", "end": "2027-01-03", "state": "WI"}
BAD_TERM = {**GOOD_TERM, "state": "WISC"}
NAME = {"first": "A", "last": "B"}


def _legislator(**overrides: object) -> dict:
    record = {
        "id": {"bioguide": "S001213"},
        "name": NAME,
        "bio": {"birthday": "1981-03-30", "gender": "M"},
        "terms": [GOOD_TERM],
    }
    record.update(overrides)
    return record


@pytest.mark.parametrize(
    ("parser", "bad_text"),
    [
        (src.parse_legislators, "not: a list"),
        (src.parse_legislators, yaml.safe_dump([{"id": {"govtrack": 1}, "name": {}, "terms": []}])),
        (src.parse_legislators, yaml.safe_dump([_legislator(terms=[BAD_TERM])])),
        (src.parse_legislators, yaml.safe_dump([_legislator(bio={"gender": "X"})])),
        (
            src.parse_legislators,
            yaml.safe_dump([{k: v for k, v in _legislator().items() if k != "bio"}]),
        ),
        (
            src.parse_legislators,
            yaml.safe_dump([_legislator(leadership_roles=[{"title": "Whip"}])]),
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
    with pytest.raises(SourceShapeError, match="shape differs"):
        parser(bad_text)


def test_optional_biography_fields_pass() -> None:
    """A record with no birthday, caucus, or leadership roles is still valid upstream."""
    text = yaml.safe_dump([_legislator(bio={"gender": "F"})])
    assert src.parse_legislators(text)[0]["bio"] == {"gender": "F"}
