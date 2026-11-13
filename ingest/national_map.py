"""The homepage's national map: every state and House district on one drawing (ADR 0022).

    python -m ingest.national_map            # writes site/public/maps/national.json

The Constituency tab draws one state or district per frame (:mod:`ingest.sources.census_geography`);
the homepage needs all of them in one frame, with Alaska and Hawaii moved into insets the way
national maps place them. The input is the Census 1:20,000,000 cartographic boundary files of the
same vintage the nightly uses (``census_geography_year``): coarse enough for a whole-country
drawing, about 600 KB to download, and shoreline-clipped like the 1:500,000 files.

Only shapes come out: which party holds a seat is the site's business, read from
``GET /api/v1/congress/seats`` at build time, so the colors follow the nightly data while this
file changes only with a new boundary vintage. Rerun it when ``census_geography_year`` moves
(new district lines) and commit the result; the site build does not download anything.

Output, compact JSON: ``{"w", "h", "congress", "vintage", "source_urls", "states": [{"fips",
"abbr", "name", "d"}], "districts": [{"abbr", "district", "d"}]}``. ``district`` is the seat's
number as congress-legislators writes it: 0 for an at-large seat and for the District of
Columbia's delegate (Census "00" and "98").
"""

from __future__ import annotations

import argparse
import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import shapely
import shapely.affinity
from shapely.geometry import MultiPolygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from api.config import get_settings
from ingest.census import GEOGRAPHY_CONGRESS, congress_for
from ingest.geometry import STATE_ALBERS, USA_ALBERS, Albers, path_d, polygons, project
from ingest.http import USER_AGENT
from ingest.shape import SourceShapeError
from ingest.sources.census_geography import Shapes, file_urls, read_shapefile

log = logging.getLogger("ingest.national_map")

SCALE = "20m"
WIDTH = 960.0  # drawing width in SVG user units; the height follows from the projection
MARGIN = 10.0
TOLERANCE = 0.45  # Douglas-Peucker, in drawing units (under half a pixel at full width)
MIN_PIECE_AREA = 0.3  # drawing units squared; smaller islands are dropped
# Census FIPS codes of the territories. Their delegates are real seats, but a national map of
# the states does not draw them; the site lists them below the map instead.
TERRITORIES = frozenset({"60", "66", "69", "72", "78"})
ALASKA, HAWAII = "02", "15"
DEFAULT_OUT = Path("site/public/maps/national.json")

Transform = Callable[[BaseGeometry], BaseGeometry]


def _fit(geom: BaseGeometry, box: tuple[float, float, float, float]) -> Transform:
    """Scale and move plane coordinates (y up) into ``box`` = (x, y, w, h) in drawing units (y
    down), keeping the aspect ratio."""
    min_x, min_y, max_x, max_y = geom.bounds
    x0, y0, w, h = box
    s = min(w / (max_x - min_x), h / (max_y - min_y))
    matrix = [s, 0.0, 0.0, -s, x0 - min_x * s, y0 + max_y * s]
    return lambda g: shapely.affinity.affine_transform(g, matrix)


def _projection(fips: str) -> Albers:
    return Albers(*STATE_ALBERS.get(fips, USA_ALBERS))


def _simplified(geom: BaseGeometry) -> BaseGeometry:
    parts = polygons(geom.simplify(TOLERANCE, preserve_topology=True))
    kept = [p for p in parts if p.area >= MIN_PIECE_AREA] or parts[:1]
    return MultiPolygon(kept)


def build_document(states: Shapes, districts: Shapes, congress: int) -> dict[str, Any]:
    """The national drawing from the state and district shapefile records."""
    states = [(rec, geom) for rec, geom in states if rec["STATEFP"] not in TERRITORIES]
    by_fips = {rec["STATEFP"]: (rec, geom) for rec, geom in states}
    for needed in (ALASKA, HAWAII):
        if needed not in by_fips:
            raise SourceShapeError(f"state file has no state {needed}")
    if len(by_fips) < 51:
        raise SourceShapeError(f"expected the 50 states and DC; got {len(by_fips)}")

    projected = {
        fips: project(geom, _projection(fips), fips) for fips, (_, geom) in by_fips.items()
    }
    lower48 = unary_union([g for f, g in projected.items() if f not in (ALASKA, HAWAII)])
    min_x, _, max_x, max_y = lower48.bounds
    scale = (WIDTH - 2 * MARGIN) / (max_x - min_x)
    height = round((lower48.bounds[3] - lower48.bounds[1]) * scale + 2 * MARGIN, 1)
    main = [scale, 0.0, 0.0, -scale, MARGIN - min_x * scale, MARGIN + max_y * scale]
    transforms: dict[str, Transform] = {
        # Alaska drawn at about a third of its true size, Hawaii a little enlarged, both in the
        # lower left where the Pacific is empty on the drawing.
        ALASKA: _fit(projected[ALASKA], (MARGIN, height - 150.0, 190.0, 135.0)),
        HAWAII: _fit(projected[HAWAII], (215.0, height - 85.0, 110.0, 70.0)),
    }

    def place(geom: BaseGeometry, fips: str) -> str:
        plane = project(geom, _projection(fips), fips)
        if fips in transforms:
            drawn = transforms[fips](plane)
        else:
            drawn = shapely.affinity.affine_transform(plane, main)
        return path_d(_simplified(drawn))

    field = f"CD{congress}FP"
    out_districts = []
    for rec, geom in districts:
        fips = rec["STATEFP"]
        if field not in rec:
            raise SourceShapeError(f"district file has no {field} column: {sorted(rec)}")
        code = rec[field]
        if fips in TERRITORIES or code == "ZZ":  # ZZ: "not defined", water only
            continue
        if fips not in by_fips:
            raise SourceShapeError(f"district in a state the state file lacks: {fips}")
        number = 0 if code in ("00", "98") else int(code)
        out_districts.append(
            {"abbr": by_fips[fips][0]["STUSPS"], "district": number, "d": place(geom, fips)}
        )
    if len(out_districts) < 436:
        raise SourceShapeError(f"expected 435 districts and DC; got {len(out_districts)}")
    out_districts.sort(key=lambda d: (d["abbr"], d["district"]))

    out_states = sorted(
        (
            {"fips": fips, "abbr": rec["STUSPS"], "name": rec["NAME"], "d": place(geom, fips)}
            for fips, (rec, geom) in by_fips.items()
        ),
        key=lambda s: s["name"],
    )
    return {
        "w": WIDTH,
        "h": height,
        "congress": congress,
        "states": out_states,
        "districts": out_districts,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    year = get_settings().census_geography_year
    congress = congress_for(GEOGRAPHY_CONGRESS, year, "census_geography_year")
    urls = file_urls(year, congress, SCALE)
    shapes: dict[str, Shapes] = {}
    with httpx.Client(
        headers={"User-Agent": USER_AGENT}, timeout=120, follow_redirects=True
    ) as http:
        for kind in ("state", "district"):
            response = http.get(urls[kind])
            response.raise_for_status()
            log.info("%s: %d bytes", urls[kind], len(response.content))
            shapes[kind] = read_shapefile(response.content)

    doc = build_document(shapes["state"], shapes["district"], congress)
    doc["vintage"] = year
    doc["source_urls"] = [urls["state"], urls["district"]]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    log.info(
        "%s: %d states, %d districts, %d bytes",
        args.out,
        len(doc["states"]),
        len(doc["districts"]),
        args.out.stat().st_size,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
