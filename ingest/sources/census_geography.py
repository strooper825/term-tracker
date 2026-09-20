"""Source: Census cartographic boundary files, the map of every state and district (ADR 0016).

Three national shapefiles at the 1:500,000 scale, all from the same vintage (the ``GENZ`` year
names the Congress of the district file in it, see :data:`ingest.census.GEOGRAPHY_CONGRESS`):

* ``cb_{year}_us_state_500k``: 56 states and territories
* ``cb_{year}_us_cd{congress}_500k``: 435 districts plus the delegates' and the Resident
  Commissioner's at-large districts
* ``cb_{year}_us_county_500k``: counties and their equivalents (parishes, boroughs, ...)

They are shoreline-clipped, which is why they are used instead of the TIGERweb service: its
polygons run out into the Great Lakes and the sea (Wisconsin's 1st District measured 1.9 times
its shoreline area).

Nothing is stored as geometry. For every state and district this builds the finished SVG paths
the site draws (:mod:`ingest.geometry`): a state row holds the state outline and its county
lines; a district row holds the district drawn inside its state's frame, and the district drawn
to fill its own frame with the county lines clipped to it. Projection and simplification cannot
be written in dbt, so this is the one place that transforms in Python rather than in the mart.

The files change only with a new vintage, so each run compares the ``Last-Modified`` of the
three zips with what the stored rows recorded and skips the download and the geometry work when
nothing moved (``--full-refresh`` forces it).
"""

from __future__ import annotations

import io
import json
import logging
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

import httpx
import shapefile
import shapely
from psycopg import Connection
from psycopg.types.json import Jsonb
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from api.config import get_settings
from ingest.census import GEOGRAPHY_CONGRESS, SourceShapeError, congress_for
from ingest.db import connect
from ingest.geometry import Frame, albers_for, clip, path_d, project, simplify
from ingest.http import USER_AGENT, fetch_response
from ingest.load import record_run, upsert

log = logging.getLogger("ingest.census_geography")

SOURCE = "census_geography"
BASE_URL = "https://www2.census.gov/geo/tiger"
SCALE = "500k"
# What a national file must at least hold before it is trusted (435 districts, 50 states).
MIN_STATES, MIN_DISTRICTS, MIN_COUNTIES = 50, 435, 3000

Record = dict[str, Any]
Shapes = list[tuple[Record, BaseGeometry]]


def file_urls(year: int, congress: int) -> dict[str, str]:
    base = f"{BASE_URL}/GENZ{year}/shp"
    return {
        "state": f"{base}/cb_{year}_us_state_{SCALE}.zip",
        "district": f"{base}/cb_{year}_us_cd{congress}_{SCALE}.zip",
        "county": f"{base}/cb_{year}_us_county_{SCALE}.zip",
    }


class FileSource(Protocol):
    def modified(self, url: str) -> str:
        """The file's ``Last-Modified`` header (empty when the server sends none)."""

    def download(self, url: str) -> bytes: ...


class HttpFiles:
    def __init__(self, timeout: float = 300.0) -> None:
        self._http = httpx.Client(
            headers={"User-Agent": USER_AGENT}, timeout=timeout, follow_redirects=True
        )

    def modified(self, url: str) -> str:
        response = self._http.head(url)
        response.raise_for_status()
        return response.headers.get("Last-Modified", "")

    def download(self, url: str) -> bytes:
        return fetch_response(url, client=self._http, timeout=300.0).content

    def close(self) -> None:
        self._http.close()


def read_shapefile(data: bytes) -> Shapes:
    """Every (attributes, geometry) of the shapefile inside a zip, geometry as shapely."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = {name.lower().rsplit(".", 1)[-1]: name for name in archive.namelist()}
        for needed in ("shp", "dbf"):
            if needed not in members:
                raise SourceShapeError(f"zip has no .{needed} file: {archive.namelist()}")
        reader = shapefile.Reader(
            shp=io.BytesIO(archive.read(members["shp"])),
            dbf=io.BytesIO(archive.read(members["dbf"])),
            shx=io.BytesIO(archive.read(members["shx"])) if "shx" in members else None,
        )
    fields = [f[0] for f in reader.fields[1:]]
    return [
        (dict(zip(fields, sr.record, strict=True)), shape(sr.shape.__geo_interface__))
        for sr in reader.shapeRecords()
    ]


@dataclass(frozen=True)
class Built:
    rows: list[dict[str, Any]]
    states: int
    districts: int
    counties: int
    payload_bytes: int


def _county_entries(pieces: list[tuple[Record, BaseGeometry]]) -> list[dict[str, str]]:
    entries = []
    for rec, geom in pieces:
        d = path_d(geom)
        if d:
            entries.append({"geoid": rec["GEOID"], "name": rec["NAMELSAD"], "d": d})
    return sorted(entries, key=lambda e: e["geoid"])


def build_rows(
    congress: int,
    states: Shapes,
    districts: Shapes,
    counties: Shapes,
    *,
    urls: dict[str, str],
    source_modified: str,
    fetched_at: datetime,
    minimums: tuple[int, int, int] = (MIN_STATES, MIN_DISTRICTS, MIN_COUNTIES),
) -> Built:
    """The ``raw.constituency_geometry`` rows for every state and district."""
    got = (len(states), len(districts), len(counties))
    if any(have < need for have, need in zip(got, minimums, strict=True)):
        raise SourceShapeError(
            f"expected at least {minimums[0]} states, {minimums[1]} districts and "
            f"{minimums[2]} counties; got {len(states)}, {len(districts)}, {len(counties)}"
        )
    district_field = f"CD{congress}FP"
    by_state_districts: dict[str, Shapes] = defaultdict(list)
    for rec, geom in districts:
        if district_field not in rec:
            raise SourceShapeError(f"district file has no {district_field} column: {sorted(rec)}")
        if rec[district_field] != "ZZ":  # "not defined": no district, water only
            by_state_districts[rec["STATEFP"]].append((rec, geom))
    by_state_counties: dict[str, Shapes] = defaultdict(list)
    for rec, geom in counties:
        by_state_counties[rec["STATEFP"]].append((rec, geom))
    known_states = {rec["STATEFP"] for rec, _ in states}
    orphans = sorted(set(by_state_districts) - known_states)
    if orphans:
        raise SourceShapeError(f"districts in states the state file lacks: {orphans}")

    rows: list[dict[str, Any]] = []
    payload_bytes = 0
    common = {"congress": congress, "source_modified": source_modified, "fetched_at": fetched_at}
    county_count = 0

    def add(geoid: str, kind: str, payload: dict[str, Any], source_url: str) -> None:
        nonlocal payload_bytes
        payload_bytes += len(json.dumps(payload, separators=(",", ":")))
        rows.append(
            {
                **common,
                "geoid": geoid,
                "kind": kind,
                "payload": Jsonb(payload),
                "source_url": source_url,
            }
        )

    for srec, sgeom in sorted(states, key=lambda s: s[0]["STATEFP"]):
        fips = srec["STATEFP"]
        projection = albers_for(fips, sgeom.bounds)
        plane = project(sgeom, projection, fips)
        frame = Frame.fit(plane.bounds)
        outline = path_d(simplify(frame.apply(plane)))

        county_planes = [
            (rec, project(geom, projection, fips)) for rec, geom in by_state_counties[fips]
        ]
        county_count += len(county_planes)
        state_counties = _county_entries(
            [(rec, simplify(frame.apply(cplane))) for rec, cplane in county_planes]
        )
        add(
            fips,
            "state",
            {
                "name": srec["NAME"],
                "frame": {"width": frame.width, "height": frame.height},
                "outline": outline,
                "counties": state_counties,
                "county_source_url": urls["county"],
            },
            urls["state"],
        )

        tree = shapely.STRtree([cplane for _, cplane in county_planes])
        for drec, dgeom in sorted(by_state_districts[fips], key=lambda d: d[0]["GEOID"]):
            dplane = project(dgeom, projection, fips)
            dframe = Frame.fit(dplane.bounds)
            fitted = simplify(dframe.apply(dplane))
            near = [county_planes[i] for i in sorted(tree.query(dplane, predicate="intersects"))]
            clipped = _county_entries(
                [(rec, clip(simplify(dframe.apply(cplane)), fitted)) for rec, cplane in near]
            )
            add(
                drec["GEOID"],
                "district",
                {
                    "name": drec["NAMELSAD"],
                    "state_geoid": fips,
                    "frame": {"width": dframe.width, "height": dframe.height},
                    "outline": path_d(fitted),
                    "counties": clipped,
                    "in_state": path_d(simplify(frame.apply(dplane))),
                    "county_source_url": urls["county"],
                },
                urls["district"],
            )
    return Built(
        rows,
        states=len(states),
        districts=sum(len(v) for v in by_state_districts.values()),
        counties=county_count,
        payload_bytes=payload_bytes,
    )


def load(
    conn: Connection,
    files: FileSource,
    year: int,
    *,
    full_refresh: bool = False,
    congress: int | None = None,
    minimums: tuple[int, int, int] = (MIN_STATES, MIN_DISTRICTS, MIN_COUNTIES),
) -> int:
    """Load every state and district map for the vintage ``year``. Returns rows loaded."""
    congress = congress or congress_for(GEOGRAPHY_CONGRESS, year, "Census boundary vintage")
    urls = file_urls(year, congress)
    with record_run(conn, SOURCE, f"{BASE_URL}/GENZ{year}/shp/") as run:
        stamps = {kind: files.modified(url) for kind, url in urls.items()}
        modified = "|".join(f"{kind}={stamp}" for kind, stamp in stamps.items())
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT source_modified FROM raw.constituency_geometry "
                "WHERE congress = %s",
                (congress,),
            )
            stored = {row[0] for row in cur.fetchall()}
        # A server that sends no Last-Modified gives nothing to compare, so it always reloads.
        if not full_refresh and all(stamps.values()) and stored == {modified}:
            log.info("The %d boundary files have not changed since the last load; skipping", year)
            return 0

        fetched_at = datetime.now(UTC)
        shapes = {kind: read_shapefile(files.download(url)) for kind, url in urls.items()}
        built = build_rows(
            congress,
            shapes["state"],
            shapes["district"],
            shapes["county"],
            urls=urls,
            source_modified=modified,
            fetched_at=fetched_at,
            minimums=minimums,
        )
        run.rows_loaded = upsert(
            conn, "raw", "constituency_geometry", ["congress", "geoid"], built.rows
        )
        log.info(
            "%d states, %d districts, %d counties -> %d rows, %.1f MB of path data",
            built.states,
            built.districts,
            built.counties,
            len(built.rows),
            built.payload_bytes / 1e6,
        )
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:
    settings = get_settings()
    files = HttpFiles()
    try:
        with connect() as conn:
            return load(conn, files, settings.census_geography_year, full_refresh=full_refresh)
    finally:
        files.close()
