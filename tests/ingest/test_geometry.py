"""Albers projection, framing, simplifying and SVG path output (ingest/geometry.py)."""

from __future__ import annotations

import math

import numpy as np
import pytest
from shapely.geometry import MultiPolygon, Polygon, box

from ingest.geometry import (
    MIN_PIECE_AREA,
    VIEW_SIZE,
    Albers,
    Frame,
    albers_for,
    clip,
    fix_antimeridian,
    path_d,
    polygons,
    project,
    simplify,
)

USA = Albers(29.5, 45.5, -96.0)


def test_albers_origin_and_symmetry() -> None:
    x, y = USA.project(np.array([-96.0]), np.array([37.5]))  # central meridian, mean parallel
    assert x[0] == pytest.approx(0, abs=1e-12) and y[0] == pytest.approx(0, abs=1e-12)
    east, _ = USA.project(np.array([-90.0]), np.array([40.0]))
    west, _ = USA.project(np.array([-102.0]), np.array([40.0]))
    assert east[0] == pytest.approx(-west[0])  # mirror images about the central meridian
    assert east[0] > 0


def test_albers_is_equal_area() -> None:
    """A 0.1 degree cell keeps its share of the sphere wherever it is: the property that makes
    Albers honest about how big a district is. Compared with the exact spherical cell area."""

    def cell(lon: float, lat: float) -> tuple[float, float]:
        d = 0.1
        lons = np.array([lon, lon, lon + d, lon + d])
        lats = np.array([lat, lat + d, lat + d, lat])
        x, y = USA.project(lons, lats)
        planar = Polygon(zip(x, y, strict=True)).area
        sphere = math.radians(d) * (math.sin(math.radians(lat + d)) - math.sin(math.radians(lat)))
        return planar, sphere

    for lon, lat in [(-120.0, 33.0), (-96.0, 40.0), (-71.0, 44.0), (-85.0, 30.0)]:
        planar, sphere = cell(lon, lat)
        assert planar == pytest.approx(sphere, rel=1e-3), (lon, lat)


def test_projection_choice_by_state() -> None:
    assert albers_for("55", (-93, 42, -86, 47)) == Albers(29.5, 45.5, -96.0)
    assert albers_for("02", (-180, 51, 180, 72)).lon0 == -154.0  # Alaska
    assert albers_for("15", (-160, 18, -154, 23)) == Albers(8.0, 18.0, -157.0)  # Hawaii
    guam = albers_for("66", (144.6, 13.2, 145.0, 13.7))
    assert guam.lon0 == pytest.approx(144.8) and 13.2 < guam.lat1 < guam.lat2 < 13.7


def test_alaska_aleutians_are_shifted_west_of_the_antimeridian() -> None:
    # one part near Anchorage, one across the antimeridian stored as +175
    parts = MultiPolygon([box(-150, 61, -149, 62), box(175, 51, 176, 52)])
    assert parts.bounds[2] - parts.bounds[0] > 300  # spans the globe as stored
    fixed = fix_antimeridian(parts)
    assert fixed.bounds[2] - fixed.bounds[0] < 40
    assert fixed.bounds[0] == pytest.approx(-185)
    # and the state as a whole projects to a sane, wide-but-not-global frame
    plane = project(parts, albers_for("02", parts.bounds), "02")
    assert Frame.fit(plane.bounds).width <= VIEW_SIZE + 10


def test_frame_scales_longest_side_and_flips_y() -> None:
    frame = Frame.fit((0.0, 0.0, 200.0, 100.0))
    assert frame.width == pytest.approx(VIEW_SIZE + 8)  # drawn area plus 4 either side
    assert frame.height == pytest.approx(VIEW_SIZE / 2 + 8)
    placed = frame.apply(box(0, 0, 200, 100)).bounds
    assert placed == pytest.approx((4.0, 4.0, VIEW_SIZE + 4, VIEW_SIZE / 2 + 4))
    # north is up: a higher plane y is a smaller frame y
    low, high = frame.apply(Polygon([(0, 0), (1, 0), (1, 1)])).exterior.coords[0:3:2]
    assert high[1] < low[1]
    with pytest.raises(ValueError):
        Frame.fit((1.0, 1.0, 1.0, 1.0))


def test_path_d_writes_rings_compactly_and_keeps_holes() -> None:
    donut = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)], holes=[[(2, 2), (2, 8), (8, 8), (8, 2)]])
    d = path_d(donut)
    assert d.count("M") == 2 and d.count("Z") == 2  # outer ring and hole
    assert "0,0" in d and "10,10" in d
    assert " " not in d  # no spaces: M x,y L x,y ... Z
    assert path_d(Polygon()) == ""


def test_path_d_rounds_and_drops_repeated_points() -> None:
    sliver = Polygon([(0, 0), (10.04, 0), (10.06, 0.01), (10, 10), (0, 10)])
    d = path_d(sliver)
    assert "10,0" in d  # 10.04 -> 10
    assert d.count("10,0") == 1  # the 10.06,0.01 neighbour rounds to 10.1,0 and stays distinct
    assert path_d(Polygon([(0, 0), (0.01, 0), (0, 0.01)])) == ""  # collapses under three points


def test_simplify_drops_specks_but_never_the_only_piece() -> None:
    main = box(0, 0, 50, 50)
    speck = box(60, 60, 60.3, 60.3)
    kept = simplify(MultiPolygon([main, speck]))
    assert len(polygons(kept)) == 1 and polygons(kept)[0].area == pytest.approx(2500)
    only = simplify(box(0, 0, 0.3, 0.3))  # smaller than MIN_PIECE_AREA, but it is all there is
    assert len(polygons(only)) == 1 and only.area < MIN_PIECE_AREA


def test_simplify_reduces_points_and_keeps_the_shape_valid() -> None:
    ring = [
        (math.cos(t) * 50 + 50, math.sin(t) * 50 + 50) for t in np.linspace(0, 2 * math.pi, 2000)
    ]
    circle = Polygon(ring)
    out = simplify(circle)
    assert len(out.geoms[0].exterior.coords) < 200
    assert out.is_valid
    assert out.area == pytest.approx(circle.area, rel=0.01)


def test_clip_keeps_polygons_only_and_drops_slivers() -> None:
    county = box(0, 0, 100, 100)
    district = box(50, 0, 200, 100)
    piece = clip(county, district)
    assert piece.bounds == (50, 0, 100, 100)
    # touching along an edge leaves a line, which is not a piece of county
    assert clip(box(0, 0, 50, 100), box(50, 0, 200, 100)).is_empty
    # a sliver under the area floor goes
    assert clip(box(0, 0, 100, 100), box(99.9, 0, 200, 1)).is_empty
