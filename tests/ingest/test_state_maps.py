"""ingest.state_maps (ADR 0035): reading Open States metadata as data, matching districts to
Census shapes, and the seat tables and drawings it writes."""

from __future__ import annotations

import pytest
from shapely.geometry import box

from ingest.shape import SourceShapeError
from ingest.state_maps import (
    Chamber,
    District,
    StateMeta,
    build_state_document,
    census_index,
    match_district,
    norm_district,
    parse_metadata_file,
    seed_rows,
)

METADATA = """
from ..models import State, Chamber, District, simple_numbered_districts

ID = State(
    name="Idaho",
    abbr="ID",
    fips="16",
    legislature_name="Idaho Legislature",
    lower=Chamber(
        chamber_type="lower",
        name="House",
        title="Representative",
        num_seats=4,
        organization_id="x",
        districts=[
            District("1A", "lower", "ocd-division/x/sldl:1a", 1),
            District("1B", "lower", "ocd-division/x/sldl:1b", 1),
        ] + [District("2", "lower", "ocd-division/x/sldl:2", num_seats=2)],
    ),
    upper=Chamber(
        chamber_type="upper",
        name="Senate",
        title="Senator",
        num_seats=2,
        organization_id="x",
        districts=simple_numbered_districts("ocd-division/x", "upper", 2),
    ),
)

US = State(name="United States", abbr="US", fips="00", lower=us_house_districts())
"""


def test_parse_metadata_reads_chambers_and_seats_and_skips_other_jurisdictions():
    (state,) = parse_metadata_file(METADATA, "id.py")
    assert (state.abbr, state.name, state.fips, state.legislature_name) == (
        "ID",
        "Idaho",
        "16",
        "Idaho Legislature",
    )
    lower, upper = state.chambers[1], state.chambers[0]
    assert upper.chamber == "upper" and [d.name for d in upper.districts] == ["1", "2"]
    assert lower.seats == 4
    assert [(d.name, d.seats) for d in lower.districts] == [("1A", 1), ("1B", 1), ("2", 2)]


def test_parse_metadata_refuses_constructs_it_does_not_know():
    text = 'XX = State(name="X", abbr="NE", fips="31", legislature=make_chamber())'
    with pytest.raises(SourceShapeError, match="unexpected call make_chamber"):
        parse_metadata_file(text, "ne.py")


def test_unicameral_chamber_is_called_legislature():
    text = """NE = State(name="Nebraska", abbr="NE", fips="31", legislature=Chamber(
        chamber_type="unicameral", name="Nebraska Legislature", title="Senator", num_seats=1,
        organization_id="x", districts=[District("1", "legislature", "d", 1)]))"""
    (state,) = parse_metadata_file(text)
    assert state.chambers[0].chamber == "legislature"


@pytest.mark.parametrize(
    ("a", "b"),
    [
        ("Barnstable, Dukes and Nantucket", "Barnstable-Dukes-Nantucket"),
        ("Belknap 1", "Belknap 01"),
        ("Chittenden Southeast", "Chittenden South East"),
        ("7", "007"),
    ],
)
def test_norm_district_ignores_spelling(a, b):
    assert norm_district(a) == norm_district(b)


def test_match_district_handles_idaho_seats_and_wards():
    idaho = census_index([{"SLDLST": "001", "NAME": "1"}], "SLDLST")
    assert match_district("ID", "lower", "1A", idaho) == "001"
    assert match_district("ID", "lower", "3B", idaho) is None
    dc = census_index([{"SLDUST": "002", "NAME": "2"}], "SLDUST")
    assert match_district("DC", "legislature", "Ward 2", dc) == "002"


def test_census_index_refuses_two_districts_with_one_name():
    with pytest.raises(SourceShapeError, match="normalise"):
        census_index(
            [{"SLDLST": "001", "NAME": "Hampden"}, {"SLDLST": "002", "NAME": "Hampden"}], "SLDLST"
        )


def _meta(chambers: list[Chamber], abbr: str = "ID") -> StateMeta:
    return StateMeta(
        abbr=abbr, name="Idaho", fips="16", legislature_name="Idaho Legislature", chambers=chambers
    )


def test_seed_rows_match_shapes_and_count_seats():
    meta = _meta(
        [
            Chamber(
                "lower",
                "House",
                "Representative",
                3,
                [District("1A", 1), District("1B", 1), District("2", 1)],
            )
        ]
    )
    index = census_index([{"SLDLST": "001", "NAME": "1"}, {"SLDLST": "002", "NAME": "2"}], "SLDLST")
    chambers, districts = seed_rows(meta, {"lower": index})
    assert chambers == [
        {
            "state": "ID",
            "chamber": "lower",
            "chamber_name": "House",
            "legislature_name": "Idaho Legislature",
            "title": "Representative",
            "seats": 3,
        }
    ]
    assert [(d["district"], d["shape"], d["note"]) for d in districts] == [
        ("1A", "001", ""),
        ("1B", "001", ""),
        ("2", "002", ""),
    ]


def test_seed_rows_name_every_district_without_a_shape():
    meta = _meta(
        [Chamber("lower", "House", "Representative", 2, [District("9", 1), District("8", 1)])]
    )
    with pytest.raises(SourceShapeError, match="'9'.*'8'|'8'.*'9'"):
        seed_rows(meta, {"lower": {}})


def test_seed_rows_refuse_seat_counts_that_do_not_add_up():
    meta = _meta([Chamber("lower", "House", "Representative", 5, [District("1", 1)])])
    with pytest.raises(SourceShapeError, match="districts hold 1 seats"):
        seed_rows(meta, {"lower": census_index([{"SLDLST": "001", "NAME": "1"}], "SLDLST")})


def test_seed_rows_keep_known_shapeless_seats_and_drop_non_voting_from_the_total():
    meta = StateMeta(
        abbr="ME",
        name="Maine",
        fips="23",
        legislature_name="Maine Legislature",
        chambers=[
            Chamber(
                "lower",
                "House",
                "Representative",
                2,
                [District("1", 1), District("Passamaquoddy Tribe", 1)],
            )
        ],
    )
    chambers, districts = seed_rows(
        meta, {"lower": census_index([{"SLDLST": "001", "NAME": "1"}], "SLDLST")}
    )
    assert chambers[0]["seats"] == 1
    assert districts[1] == {
        "state": "ME",
        "chamber": "lower",
        "district": "Passamaquoddy Tribe",
        "seats": 1,
        "shape": "",
        "note": "non-voting",
    }


def test_build_state_document_draws_every_district_inside_the_frame():
    meta = _meta([])
    doc = build_state_document(
        meta,
        box(-117, 42, -111, 49),
        {"lower": [("002", box(-117, 42, -111, 45)), ("001", box(-117, 45, -111, 49))]},
    )
    assert doc["abbr"] == "ID" and doc["outline"].startswith("M")
    assert [code for code, _ in doc["chambers"]["lower"]] == ["001", "002"]
    assert max(doc["w"], doc["h"]) == pytest.approx(2400, abs=0.1)
