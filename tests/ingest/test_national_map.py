"""ingest.national_map: one national drawing from the state and district shapefile records."""

from __future__ import annotations

import re

import pytest
from shapely.geometry import box

from ingest.national_map import WIDTH, build_document
from ingest.shape import SourceShapeError

CONGRESS = 119
# 51 drawn states (Alaska, Hawaii, DC and 48 others) plus one territory that must be left out.
STATE_FIPS = ["02", "15", "11"] + [
    f"{n:02d}" for n in range(20, 80) if n not in (60, 66, 69, 72, 78)
][:48]


def _states(fips_list: list[str]) -> list:
    out = []
    for i, fips in enumerate(fips_list):
        if fips == "02":
            geom = box(-160, 58, -145, 66)
        elif fips == "15":
            geom = box(-160, 19, -155, 22)
        else:
            lon = -124 + (i % 12) * 4.5
            lat = 26 + (i // 12) * 4.5
            geom = box(lon, lat, lon + 4, lat + 4)
        out.append(({"STATEFP": fips, "STUSPS": f"S{fips}", "NAME": f"State {fips}"}, geom))
    return out


def _districts(states: list) -> list:
    field = f"CD{CONGRESS}FP"
    out = []
    for rec, geom in states:
        code = "98" if rec["STATEFP"] == "11" else "00"
        out.append(({"STATEFP": rec["STATEFP"], field: code}, geom))
    # Split eight ordinary states into numbered districts (never as many as 98, Census's code
    # for a delegate) until there are 435 districts and DC.
    split = states[3:11]
    out = [d for d in out if d[0]["STATEFP"] not in {rec["STATEFP"] for rec, _ in split}]
    per_state = -(-(436 - len(out)) // len(split))
    for rec, geom in split:
        count = min(per_state, 436 - len(out))
        min_x, min_y, max_x, max_y = geom.bounds
        step = (max_x - min_x) / count
        for n in range(count):
            piece = box(min_x + n * step, min_y, min_x + (n + 1) * step, max_y)
            out.append(({"STATEFP": rec["STATEFP"], field: f"{n + 1:02d}"}, piece))
    out.append(({"STATEFP": "72", field: "98"}, box(-67, 18, -65, 18.5)))  # a territory
    out.append(({"STATEFP": "06", field: "ZZ"}, box(-70, 18, -69, 18.5)))  # water only
    return out


@pytest.fixture
def document() -> dict:
    states = _states(STATE_FIPS) + [
        ({"STATEFP": "72", "STUSPS": "PR", "NAME": "Puerto Rico"}, box(-67, 18, -65, 18.5))
    ]
    return build_document(states, _districts(_states(STATE_FIPS)), CONGRESS)


def test_draws_the_states_and_districts_and_leaves_out_territories(document: dict) -> None:
    assert len(document["states"]) == 51
    assert "PR" not in {s["abbr"] for s in document["states"]}
    assert len(document["districts"]) == 436
    assert {d["abbr"] for d in document["districts"]} >= {"S02", "S15", "S11"}


def test_at_large_and_delegate_seats_are_district_zero(document: dict) -> None:
    by_state = {}
    for d in document["districts"]:
        by_state.setdefault(d["abbr"], []).append(d["district"])
    assert by_state["S11"] == [0]  # DC's delegate: Census "98"
    assert by_state["S02"] == [0]  # at-large: Census "00"
    assert sorted(by_state["S20"])[:3] == [1, 2, 3]


def test_every_shape_fits_the_drawing(document: dict) -> None:
    assert document["w"] == WIDTH
    numbers = re.compile(r"-?\d+(?:\.\d+)?")
    for shape in document["states"] + document["districts"]:
        assert shape["d"].startswith("M") and shape["d"].endswith("Z")
        values = [float(v) for v in numbers.findall(shape["d"])]
        xs, ys = values[0::2], values[1::2]
        assert min(xs) >= -0.5 and max(xs) <= WIDTH + 0.5
        assert min(ys) >= -0.5 and max(ys) <= document["h"] + 0.5


def test_a_missing_state_stops_the_build() -> None:
    states = _states(STATE_FIPS)
    with pytest.raises(SourceShapeError, match="no state 15"):
        build_document([s for s in states if s[0]["STATEFP"] != "15"], _districts(states), CONGRESS)


def test_too_few_districts_stops_the_build() -> None:
    states = _states(STATE_FIPS)
    with pytest.raises(SourceShapeError, match="expected 435 districts"):
        build_document(states, _districts(states)[:100], CONGRESS)
