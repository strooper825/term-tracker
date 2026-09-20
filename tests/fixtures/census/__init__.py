"""Synthetic Census inputs (no network): boundary shapefile zips and ACS Data API responses.

Unlike the other fixture directories these are NOT recorded responses. The shapes are plain
rectangles and the ACS numbers are invented, because when this was written no real ACS value
had been fetched (the API key exists only as an Actions secret). What is realistic is the
*format*: the shapefile attributes are the ones the 2025 cartographic boundary files carry
(``STATEFP, CD119FP, GEOID, NAMELSAD, ...``), and the ACS responses are the array-of-arrays the
Data API returns, including the "-666666666" sentinel for a value it could not compute. Nothing
here may be read as a Census figure.

Geography: six states holding the fixture members' seats (WI, AR, VT, MI, CA, NY), each a
rectangle cut into two counties; WI-1, CA-3 and NY-8 are districts (the west half of the state
rectangle) and Vermont has an at-large district.
"""

from __future__ import annotations

import io
import json
import zipfile
from collections.abc import Callable
from urllib.parse import parse_qs, unquote, urlparse

import shapefile

from ingest.census import BASE_URL, CensusClient
from ingest.sources.census_geography import FileSource, file_urls

YEAR = 2025
ACS_YEAR = 2024
CONGRESS = 119
# Loosened thresholds: the fixtures hold six states, not 50.
GEOGRAPHY_MINIMUMS = (6, 4, 12)
ACS_MINIMUMS = (6, 4)

# fips -> (name, usps, west, south, east, north)
STATES = {
    "55": ("Wisconsin", "WI", -92.9, 42.5, -86.8, 46.9),
    "05": ("Arkansas", "AR", -94.6, 33.0, -89.6, 36.5),
    "50": ("Vermont", "VT", -73.4, 42.7, -71.5, 45.0),
    "26": ("Michigan", "MI", -90.4, 41.7, -82.4, 48.3),
    "06": ("California", "CA", -124.4, 32.5, -114.1, 42.0),
    "36": ("New York", "NY", -79.8, 40.5, -71.9, 45.0),
}
# district geoid -> (state, west-half name)
DISTRICTS = {"5501": "55", "0603": "06", "3608": "36", "5000": "50"}


def _ring(west: float, south: float, east: float, north: float) -> list[list[float]]:
    """Clockwise, as the shapefile format wants an outer ring."""
    return [[west, south], [west, north], [east, north], [east, south], [west, south]]


def _zip(fields: list[tuple[str, int]], records: list[tuple[dict, list[list[float]]]]) -> bytes:
    shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    writer = shapefile.Writer(shp=shp, shx=shx, dbf=dbf, shapeType=shapefile.POLYGON)
    for name, size in fields:
        writer.field(name, "C", size=size)
    for attributes, ring in records:
        writer.poly([ring])
        writer.record(*[attributes[name] for name, _ in fields])
    writer.close()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr("cb.shp", shp.getvalue())
        archive.writestr("cb.shx", shx.getvalue())
        archive.writestr("cb.dbf", dbf.getvalue())
    return out.getvalue()


def state_zip() -> bytes:
    fields = [("STATEFP", 2), ("GEOID", 2), ("NAME", 60), ("STUSPS", 2)]
    return _zip(
        fields,
        [
            ({"STATEFP": f, "GEOID": f, "NAME": n, "STUSPS": u}, _ring(w, s, e, no))
            for f, (n, u, w, s, e, no) in STATES.items()
        ],
    )


def district_zip(congress: int = CONGRESS) -> bytes:
    fields = [("STATEFP", 2), (f"CD{congress}FP", 2), ("GEOID", 4), ("NAMELSAD", 60)]
    records = []
    for geoid, fips in DISTRICTS.items():
        _, _, w, s, e, n = STATES[fips]
        at_large = geoid.endswith("00")
        east = e if at_large else (w + e) / 2  # a numbered district is the west half
        name = (
            "Congressional District (at Large)"
            if at_large
            else f"Congressional District {int(geoid[2:])}"
        )
        records.append(
            (
                {"STATEFP": fips, f"CD{congress}FP": geoid[2:], "GEOID": geoid, "NAMELSAD": name},
                _ring(w, s, east, n),
            )
        )
    # a state's undefined part: Census marks water-only areas ZZ, and the loader must skip them
    records.append(
        (
            {
                "STATEFP": "26",
                f"CD{congress}FP": "ZZ",
                "GEOID": "26ZZ",
                "NAMELSAD": "Congressional Districts not defined",
            },
            _ring(-85, 44, -84.9, 44.1),
        )
    )
    return _zip(fields, records)


def county_zip() -> bytes:
    """Two counties per state, split at the middle longitude (so a numbered district, the west
    half, is exactly the west county, and clips the east one away)."""
    fields = [("STATEFP", 2), ("GEOID", 5), ("NAMELSAD", 60)]
    records = []
    for fips, (name, _, w, s, e, n) in STATES.items():
        mid = (w + e) / 2
        records.append(
            (
                {"STATEFP": fips, "GEOID": f"{fips}001", "NAMELSAD": f"West {name} County"},
                _ring(w, s, mid, n),
            )
        )
        records.append(
            (
                {"STATEFP": fips, "GEOID": f"{fips}003", "NAMELSAD": f"East {name} County"},
                _ring(mid, s, e, n),
            )
        )
    return _zip(fields, records)


class FixtureFiles(FileSource):
    """Serves the three zips; ``stamp`` is the Last-Modified every file reports."""

    def __init__(self, stamp: str = "Thu, 23 Apr 2026 13:45:35 GMT") -> None:
        self.stamp = stamp
        self.downloads = 0
        urls = file_urls(YEAR, CONGRESS)
        self._bodies = {
            urls["state"]: state_zip(),
            urls["district"]: district_zip(),
            urls["county"]: county_zip(),
        }

    def modified(self, url: str) -> str:
        return self.stamp

    def download(self, url: str) -> bytes:
        self.downloads += 1
        return self._bodies[url]


# ---- ACS ------------------------------------------------------------------------------------

SENTINEL = "-666666666"


def _profile_value(variable: str, index: int) -> str | None:
    """An invented, deterministic value for one variable of the index-th geography."""
    base = {
        "DP05_0001E": 700_000 + 1_000 * index,
        "DP05_0018E": 38 + index % 5,
        "DP03_0062E": 70_000 + 500 * index,
        "DP02_0001E": 280_000 + 100 * index,
        "DP02_0068PE": 30 + index % 7,
        "DP02_0067PE": 90 + index % 4,
        "DP03_0009PE": 4 + index % 3,
        "DP03_0128PE": 10 + index % 6,
    }
    stem = variable[:-1] if variable.endswith(("E", "M")) else variable
    if variable.endswith("M"):
        return str(round(base.get(stem + "E", 0) * 0.01 + 1, 1))
    if variable == "DP03_0062E" and index == 3:
        return SENTINEL  # a median the Census could not compute
    return str(base.get(variable, 0))


def _detail_value(variable: str, index: int) -> str | None:
    total = 700_000 + 1_000 * index
    shares = {
        "B03002_001E": 1.0,
        "B03002_003E": 0.60,
        "B03002_004E": 0.10,
        "B03002_005E": 0.01,
        "B03002_006E": 0.05,
        "B03002_007E": 0.005,
        "B03002_008E": 0.005,
        "B03002_009E": 0.03,
        "B03002_012E": 0.20,
    }
    if variable.endswith("M"):
        return "1234"
    return str(round(total * shares[variable]))


def _acs_rows(variables: list[str], geography: str, dataset: str) -> list[list[str | None]]:
    value = _profile_value if dataset == "profile" else _detail_value
    header: list[str] = ["NAME", *variables, "state"]
    rows: list[list[str | None]] = [header]
    if geography == "district":
        header.append("congressional district")
        for index, (geoid, fips) in enumerate(DISTRICTS.items()):
            rows.append(
                [f"Congressional District {geoid[2:]} (119th Congress), {STATES[fips][0]}"]
                + [value(v, index) for v in variables]
                + [fips, geoid[2:]]
            )
        # the real response also has a row for the part of a state with no district (2026-09-20)
        rows.append(
            ["Congressional Districts not defined (119th Congress), Michigan"]
            + [value(v, 9) for v in variables]
            + ["26", "ZZ"]
        )
    else:
        for index, (fips, (name, *_)) in enumerate(STATES.items()):
            rows.append([name] + [value(v, index) for v in variables] + [fips])
    return rows


def acs_fetch(url: str) -> str:
    """Answer a Data API URL with an invented response of the right shape."""
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert query["key"], "every Census request carries a key"
    path = parsed.path.removeprefix(urlparse(BASE_URL).path).strip("/")
    dataset = "profile" if path.endswith("/profile") else "detail"
    variables = query["get"][0].split(",")[1:]  # drop NAME
    geography = "district" if "congressional district" in unquote(query["for"][0]) else "state"
    return json.dumps(_acs_rows(variables, geography, dataset))


def census_client(fetch: Callable[[str], str] = acs_fetch) -> CensusClient:
    return CensusClient("test-key-not-real", fetch=fetch)
