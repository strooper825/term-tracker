"""The States section's maps and seat tables (ADR 0035).

    python -m ingest.state_maps --metadata PATH [--census-dir DIR]

Writes, for the 50 states, DC and Puerto Rico:

* ``site/public/maps/states/{abbr}.json``: one drawing per state, its outline and every
  legislative district of each chamber, keyed by the Census district code;
* ``dbt/seeds/state_chambers.csv``: each chamber's name, member title and number of seats;
* ``dbt/seeds/state_districts.csv``: each district as Open States names it, its number of seats
  and the Census code of its shape (blank for a seat with no shape of its own).

``--metadata`` is a checkout of github.com/openstates/openstates-core (MIT licence). Its
``openstates/metadata/data/*.py`` files declare every chamber and district with its seat count;
they are read as data with :mod:`ast` and never imported or run. The Census cartographic boundary
files (state legislative districts, 1:500,000) are downloaded unless ``--census-dir`` holds them.

District lines change only after redistricting, so the outputs are committed and the nightly
does not run this. Rerun it when ``census_geography_year`` moves or a state redraws its lines,
check the diff of the two seeds, and commit. Who holds each seat is the nightly's business
(``ingest.sources.openstates_people``).
"""

from __future__ import annotations

import argparse
import ast
import csv
import io
import json
import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import shapely
from shapely.geometry.base import BaseGeometry

from api.config import get_settings
from ingest.geometry import albers_for, path_d, project, simplify
from ingest.http import USER_AGENT
from ingest.shape import SourceShapeError
from ingest.sources.census_geography import BASE_URL, Shapes, read_shapefile

log = logging.getLogger("ingest.state_maps")

WIDTH = 2400.0  # longest side of a state drawing, in drawing units (zoomable, ADR 0035)
TOLERANCE = 1.0  # Douglas-Peucker, drawing units
MAPS_DIR = Path("site/public/maps/states")
CHAMBERS_SEED = Path("dbt/seeds/state_chambers.csv")
DISTRICTS_SEED = Path("dbt/seeds/state_districts.csv")

# The 50 states, DC and Puerto Rico; the other territories are out of scope (ADR 0035).
IN_SCOPE = frozenset(
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ "
    "NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split()
)
# Census files: the upper chamber (and a unicameral body: Nebraska, the DC Council's wards) is
# SLDU, the lower SLDL.
CENSUS_FILES = {"upper": "sldu", "lower": "sldl"}
CODE_FIELD = {"upper": "SLDUST", "lower": "SLDLST"}

# Seats with no shape of their own, by state and chamber: the DC Council's chair and at-large
# members, Puerto Rico's at-large legislators, Maine's two non-voting tribal representatives,
# and New Hampshire's floterial districts, which overlay several ordinary districts and are not
# in the Census file.
SHAPELESS = {
    ("DC", "legislature"): {"Chairman": "at-large", "At-Large": "at-large"},
    ("PR", "upper"): {"At-Large": "at-large"},
    ("PR", "lower"): {"At-Large": "at-large"},
    ("ME", "lower"): {
        "Passamaquoddy Tribe": "non-voting",
        "Houlton Band of Maliseet Indians": "non-voting",
    },
}
FLOTERIAL_STATES = {("NH", "lower")}


# ---------------------------------------------------------------------------------------------
# Open States metadata, read as data


@dataclass
class District:
    name: str
    seats: int


@dataclass
class Chamber:
    chamber: str  # upper, lower, or legislature for a unicameral body
    name: str
    title: str
    seats: int
    districts: list[District]


@dataclass
class StateMeta:
    abbr: str
    name: str
    fips: str
    legislature_name: str
    chambers: list[Chamber] = field(default_factory=list)


class _Reader:
    """Evaluates the few constructs the metadata files use: literals, lists, ``+`` of lists, and
    calls of ``State``, ``Chamber``, ``District`` and ``simple_numbered_districts``. Anything
    else is an error, so a file that starts doing something new is noticed, not run."""

    def __init__(self, filename: str) -> None:
        self.filename = filename

    def fail(self, node: ast.AST, why: str) -> SourceShapeError:
        return SourceShapeError(f"{self.filename}:{getattr(node, 'lineno', '?')}: {why}")

    def value(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.List):
            return [self.value(e) for e in node.elts]
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            return self.value(node.left) + self.value(node.right)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            args = [self.value(a) for a in node.args]
            kwargs = {k.arg: self.value(k.value) for k in node.keywords if k.arg}
            return self.call(node, node.func.id, args, kwargs)
        raise self.fail(node, f"unexpected {type(node).__name__}")

    def call(self, node: ast.AST, name: str, args: list, kwargs: dict) -> Any:
        if name == "District":
            params = dict(
                zip(["name", "chamber_type", "division_id", "num_seats"], args, strict=False)
            )
            params.update(kwargs)
            return District(str(params["name"]), int(params.get("num_seats", 1)))
        if name == "simple_numbered_districts":
            params = dict(zip(["parent_id", "chamber_type", "total"], args, strict=False))
            params.update(kwargs)
            seats = int(params.get("num_seats", 1))
            return [District(str(n), seats) for n in range(1, int(params["total"]) + 1)]
        if name == "Chamber":
            chamber = kwargs["chamber_type"]
            return Chamber(
                chamber="legislature" if chamber == "unicameral" else chamber,
                name=kwargs["name"],
                title=kwargs["title"],
                seats=int(kwargs["num_seats"]),
                districts=kwargs["districts"],
            )
        if name == "State":
            state = StateMeta(
                abbr=kwargs["abbr"],
                name=kwargs["name"],
                fips=kwargs["fips"],
                legislature_name=kwargs.get("legislature_name") or kwargs["name"],
            )
            for key in ("upper", "lower", "legislature"):
                if kwargs.get(key):
                    state.chambers.append(kwargs[key])
            return state
        raise self.fail(node, f"unexpected call {name}()")


def _abbr_of(call: ast.Call) -> str | None:
    for kw in call.keywords:
        if kw.arg == "abbr" and isinstance(kw.value, ast.Constant):
            return str(kw.value.value)
    return None


def parse_metadata_file(text: str, filename: str = "<metadata>") -> list[StateMeta]:
    """Every in-scope ``X = State(...)`` assignment in one metadata file. Other jurisdictions
    (Congress, the other territories) are skipped before they are read."""
    reader = _Reader(filename)
    out = []
    for stmt in ast.parse(text, filename).body:
        if (
            isinstance(stmt, ast.Assign)
            and isinstance(stmt.value, ast.Call)
            and isinstance(stmt.value.func, ast.Name)
            and stmt.value.func.id == "State"
            and _abbr_of(stmt.value) in IN_SCOPE
        ):
            out.append(reader.value(stmt.value))
    return out


def read_metadata(checkout: Path) -> dict[str, StateMeta]:
    data_dir = checkout / "openstates" / "metadata" / "data"
    if not data_dir.is_dir():
        raise SourceShapeError(f"{data_dir} is not a directory (pass an openstates-core checkout)")
    states: dict[str, StateMeta] = {}
    for path in sorted(data_dir.glob("*.py")):
        for state in parse_metadata_file(path.read_text(encoding="utf-8"), path.name):
            if state.abbr in IN_SCOPE:
                states[state.abbr] = state
    missing = IN_SCOPE - set(states)
    if missing:
        raise SourceShapeError(f"metadata has no entry for {sorted(missing)}")
    return states


# ---------------------------------------------------------------------------------------------
# Matching Open States district names to Census codes


def norm_district(name: str) -> str:
    """A district name reduced for matching: case, punctuation, spacing, "and" and leading zeros
    do not count. "Barnstable, Dukes and Nantucket" == "Barnstable-Dukes-Nantucket", "Belknap 1"
    == "Belknap 01", "Chittenden Southeast" == "Chittenden South East"."""
    text = re.sub(r"\band\b", " ", name.lower())
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\b0+(\d)", r"\1", text)
    return text.replace(" ", "")


def census_index(records: Iterable[dict[str, Any]], code_field: str) -> dict[str, str]:
    """Normalised name or code -> Census code, for one state's chamber."""
    index: dict[str, str] = {}
    for rec in records:
        code = rec[code_field]
        for key in {norm_district(code), norm_district(rec.get("NAME", ""))}:
            if key in index and index[key] != code:
                raise SourceShapeError(f"two Census districts normalise to {key!r}")
            index[key] = code
    return index


def match_district(abbr: str, chamber: str, name: str, index: dict[str, str]) -> str | None:
    """The Census code of a district's shape, or None when it has none of its own."""
    key = norm_district(name)
    if key in index:
        return index[key]
    # "Ward 1" (the DC Council) and "District 7" style names: Census gives the bare number.
    bare = re.sub(r"^(ward|district)", "", key)
    if bare != key and bare in index:
        return index[bare]
    if abbr == "ID" and chamber == "lower":
        # Idaho elects two representatives per district as seats A and B: "10A" is district 10.
        base = re.fullmatch(r"(\d+)[ab]", key)
        if base and base.group(1) in index:
            return index[base.group(1)]
    return None


def shapeless_note(abbr: str, chamber: str, name: str) -> str | None:
    note = SHAPELESS.get((abbr, chamber), {}).get(name)
    if note:
        return note
    if (abbr, chamber) in FLOTERIAL_STATES:
        return "floterial"
    return None


# ---------------------------------------------------------------------------------------------
# Drawings


def _frame(plane: BaseGeometry) -> tuple[Any, float, float]:
    min_x, min_y, max_x, max_y = plane.bounds
    scale = WIDTH / max(max_x - min_x, max_y - min_y)

    def apply(geom: BaseGeometry) -> BaseGeometry:
        return shapely.transform(
            geom,
            lambda c: np.column_stack(((c[:, 0] - min_x) * scale, (max_y - c[:, 1]) * scale)),
        )

    return apply, round((max_x - min_x) * scale, 1), round((max_y - min_y) * scale, 1)


def build_state_document(
    meta: StateMeta,
    outline: BaseGeometry,
    shapes: dict[str, list[tuple[str, BaseGeometry]]],
) -> dict[str, Any]:
    """One state's drawing: ``{"abbr", "name", "w", "h", "outline", "chambers": {chamber:
    [[code, d], ...]}}``. ``shapes`` maps a chamber to its (Census code, lon/lat geometry)."""
    projection = albers_for(meta.fips, outline.bounds)
    plane = project(outline, projection, meta.fips)
    apply, w, h = _frame(plane)
    chambers = {}
    for chamber, items in shapes.items():
        drawn = []
        for code, geom in sorted(items):
            d = path_d(simplify(apply(project(geom, projection, meta.fips)), TOLERANCE))
            if not d:
                raise SourceShapeError(f"{meta.abbr} {chamber} district {code} drew empty")
            drawn.append([code, d])
        chambers[chamber] = drawn
    return {
        "abbr": meta.abbr,
        "name": meta.name,
        "w": w,
        "h": h,
        "outline": path_d(simplify(apply(plane), TOLERANCE)),
        "chambers": chambers,
    }


# ---------------------------------------------------------------------------------------------
# Seeds


def seed_rows(
    meta: StateMeta, indexes: dict[str, dict[str, str]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """(chamber rows, district rows) for one state. ``indexes`` maps a Census chamber (upper or
    lower) to its :func:`census_index`. Raises on a district that matches no shape and is not a
    known shapeless seat, and on seat counts that do not add up."""
    chamber_rows, district_rows = [], []
    unmatched: list[str] = []
    for chamber in meta.chambers:
        census_chamber = "upper" if chamber.chamber == "legislature" else chamber.chamber
        index = indexes.get(census_chamber, {})
        total = sum(d.seats for d in chamber.districts)
        if total != chamber.seats:
            raise SourceShapeError(
                f"{meta.abbr} {chamber.chamber}: districts hold {total} seats, chamber says "
                f"{chamber.seats}"
            )
        for district in chamber.districts:
            code = match_district(meta.abbr, chamber.chamber, district.name, index)
            note = None if code else shapeless_note(meta.abbr, chamber.chamber, district.name)
            if code is None and note is None:
                unmatched.append(f"{meta.abbr} {chamber.chamber} {district.name!r}")
                continue
            district_rows.append(
                {
                    "state": meta.abbr,
                    "chamber": chamber.chamber,
                    "district": district.name,
                    "seats": district.seats,
                    "shape": code or "",
                    "note": note or "",
                }
            )
        voting = chamber.seats - sum(
            d.seats
            for d in chamber.districts
            if shapeless_note(meta.abbr, chamber.chamber, d.name) == "non-voting"
        )
        chamber_rows.append(
            {
                "state": meta.abbr,
                "chamber": chamber.chamber,
                "chamber_name": chamber.name,
                "legislature_name": meta.legislature_name,
                "title": chamber.title,
                "seats": voting,
            }
        )
    if unmatched:
        raise SourceShapeError(
            "districts that match no Census shape (add them to SHAPELESS or teach "
            f"match_district the spelling): {', '.join(unmatched)}"
        )
    return chamber_rows, district_rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    path.write_text(buffer.getvalue(), encoding="utf-8")


# ---------------------------------------------------------------------------------------------


def census_urls(year: int) -> dict[str, str]:
    base = f"{BASE_URL}/GENZ{year}/shp"
    return {
        "state": f"{base}/cb_{year}_us_state_500k.zip",
        "upper": f"{base}/cb_{year}_us_sldu_500k.zip",
        "lower": f"{base}/cb_{year}_us_sldl_500k.zip",
    }


def _load_census(urls: dict[str, str], census_dir: Path | None) -> dict[str, Shapes]:
    out: dict[str, Shapes] = {}
    with httpx.Client(
        headers={"User-Agent": USER_AGENT}, timeout=300, follow_redirects=True
    ) as http:
        for kind, url in urls.items():
            local = census_dir / url.rsplit("/", 1)[-1] if census_dir else None
            if local and local.exists():
                data = local.read_bytes()
            else:
                response = http.get(url)
                response.raise_for_status()
                data = response.content
            log.info("%s: %d bytes", url, len(data))
            out[kind] = read_shapefile(data)
    return out


def build_all(
    metadata: dict[str, StateMeta], census: dict[str, Shapes]
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    outlines = {rec["STATEFP"]: geom for rec, geom in census["state"]}
    by_state: dict[tuple[str, str], list[tuple[dict[str, Any], BaseGeometry]]] = {}
    for chamber in CENSUS_FILES:
        for rec, geom in census[chamber]:
            if rec[CODE_FIELD[chamber]].startswith("ZZ"):  # "not defined": water, unassigned
                continue
            by_state.setdefault((rec["STATEFP"], chamber), []).append((rec, geom))

    documents, chamber_rows, district_rows = {}, [], []
    problems: list[str] = []
    for abbr in sorted(metadata):
        meta = metadata[abbr]
        if meta.fips not in outlines:
            raise SourceShapeError(f"state file has no {abbr} ({meta.fips})")
        indexes = {
            chamber: census_index(
                (r for r, _ in by_state.get((meta.fips, chamber), [])), CODE_FIELD[chamber]
            )
            for chamber in CENSUS_FILES
        }
        try:
            chambers, districts = seed_rows(meta, indexes)
        except SourceShapeError as exc:
            problems.append(str(exc))
            continue
        chamber_rows += chambers
        district_rows += districts
        # Draw only the shapes some district uses: a Census district Open States does not list
        # would be a seat the site cannot fill.
        used = {(d["chamber"], d["shape"]) for d in districts if d["shape"]}
        shapes = {}
        for chamber in meta.chambers:
            census_chamber = "upper" if chamber.chamber == "legislature" else chamber.chamber
            items = [
                (rec[CODE_FIELD[census_chamber]], geom)
                for rec, geom in by_state.get((meta.fips, census_chamber), [])
                if (chamber.chamber, rec[CODE_FIELD[census_chamber]]) in used
            ]
            unused = {
                rec[CODE_FIELD[census_chamber]]
                for rec, _ in by_state.get((meta.fips, census_chamber), [])
            } - {code for code, _ in items}
            if unused:
                log.warning(
                    "%s %s: Census districts no seat uses: %s",
                    abbr,
                    chamber.chamber,
                    sorted(unused),
                )
            shapes[chamber.chamber] = items
        documents[abbr] = build_state_document(meta, outlines[meta.fips], shapes)
    if problems:
        raise SourceShapeError("\n".join(problems))
    return documents, chamber_rows, district_rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--metadata", type=Path, required=True, help="openstates-core checkout")
    parser.add_argument("--census-dir", type=Path, help="folder already holding the Census zips")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    year = get_settings().census_geography_year
    urls = census_urls(year)
    documents, chamber_rows, district_rows = build_all(
        read_metadata(args.metadata), _load_census(urls, args.census_dir)
    )
    MAPS_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for abbr, doc in documents.items():
        doc["vintage"] = year
        doc["source_urls"] = [urls["state"], urls["upper"], urls["lower"]]
        path = MAPS_DIR / f"{abbr.lower()}.json"
        path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
        total += path.stat().st_size
    write_csv(CHAMBERS_SEED, chamber_rows)
    write_csv(DISTRICTS_SEED, district_rows)
    log.info(
        "%d state drawings (%d bytes), %d chambers, %d districts",
        len(documents),
        total,
        len(chamber_rows),
        len(district_rows),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
