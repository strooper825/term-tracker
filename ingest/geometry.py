"""Map geometry for the Constituency tab: Albers projection, framing, simplifying, SVG paths.

The site draws finished SVG paths and computes nothing about them (plan section 7), so all of
this happens once at ingest. The Census cartographic boundary files (NAD83 longitude and
latitude) go in; strings of SVG path data in a frame of fixed size come out.

Pipeline for one shape: project to the plane (:class:`Albers`), scale into a frame whose longest
side is :data:`VIEW_SIZE` user units (:class:`Frame`), simplify in frame units so the tolerance
means the same on screen for a state and for a city district, then write the path (:func:`path_d`).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import shapely
from shapely.errors import GEOSException
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

VIEW_SIZE = 300.0  # longest side of a frame's drawn area, in SVG user units
FRAME_PAD = 4.0  # room around the drawn area so a stroke is never cut off
SIMPLIFY_TOLERANCE = 0.6  # frame units (0.2 percent of VIEW_SIZE)
MIN_PIECE_AREA = 0.5  # frame units squared; a smaller island or county sliver is dropped

# State FIPS codes with their own conic parameters, as (standard parallel 1, standard parallel 2,
# central meridian). The 48 contiguous states and DC share the standard USA Albers parameters.
USA_ALBERS = (29.5, 45.5, -96.0)
STATE_ALBERS: dict[str, tuple[float, float, float]] = {
    "02": (55.0, 65.0, -154.0),  # Alaska
    "15": (8.0, 18.0, -157.0),  # Hawaii
}
# Territories are small and far from the 48, so each is centred on itself.
LOCAL_ALBERS_STATES = frozenset({"60", "66", "69", "72", "78"})  # AS, GU, MP, PR, VI


@dataclass(frozen=True)
class Albers:
    """Albers equal-area conic on the unit sphere (Snyder, Map Projections, eq. 14-1 to 14-11).

    The latitude of origin only translates the result, and every shape is re-framed from its own
    bounds, so it is fixed at the mean of the two standard parallels.
    """

    lat1: float
    lat2: float
    lon0: float

    @property
    def _n(self) -> float:
        return (math.sin(math.radians(self.lat1)) + math.sin(math.radians(self.lat2))) / 2

    @property
    def _c(self) -> float:
        s1 = math.sin(math.radians(self.lat1))
        return math.cos(math.radians(self.lat1)) ** 2 + 2 * self._n * s1

    def project(self, lon: np.ndarray, lat: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        n = self._n
        rho0 = math.sqrt(self._c - 2 * n * math.sin(math.radians((self.lat1 + self.lat2) / 2))) / n
        rho = np.sqrt(self._c - 2 * n * np.sin(np.radians(lat))) / n
        theta = n * np.radians(lon - self.lon0)
        return rho * np.sin(theta), rho0 - rho * np.cos(theta)


def albers_for(state_fips: str, lon_lat_bounds: tuple[float, float, float, float]) -> Albers:
    """The projection a state (or one of its districts) is drawn in."""
    if state_fips in STATE_ALBERS:
        return Albers(*STATE_ALBERS[state_fips])
    if state_fips in LOCAL_ALBERS_STATES:
        min_x, min_y, max_x, max_y = lon_lat_bounds
        span = max_y - min_y
        return Albers(min_y + span / 6, max_y - span / 6, (min_x + max_x) / 2)
    return Albers(*USA_ALBERS)


def fix_antimeridian(geom: BaseGeometry) -> BaseGeometry:
    """Alaska's Aleutian Islands cross 180 degrees; Census stores those parts as positive
    longitudes, which would stretch the bounding box across the globe. Shift them west."""
    return shapely.transform(
        geom, lambda c: np.column_stack((np.where(c[:, 0] > 0, c[:, 0] - 360, c[:, 0]), c[:, 1]))
    )


def project(geom: BaseGeometry, projection: Albers, state_fips: str = "") -> BaseGeometry:
    """Longitude/latitude geometry to Albers plane coordinates (y points north)."""
    if state_fips == "02":
        geom = fix_antimeridian(geom)

    def apply(coords: np.ndarray) -> np.ndarray:
        x, y = projection.project(coords[:, 0], coords[:, 1])
        return np.column_stack((x, y))

    return shapely.transform(geom, apply)


@dataclass(frozen=True)
class Frame:
    """A drawing frame: plane coordinates scaled so the longest side is ``VIEW_SIZE``."""

    min_x: float
    max_y: float
    scale: float
    width: float
    height: float

    @classmethod
    def fit(cls, bounds: tuple[float, float, float, float]) -> Frame:
        min_x, min_y, max_x, max_y = bounds
        extent = max(max_x - min_x, max_y - min_y)
        if extent <= 0:
            raise ValueError("cannot frame an empty or single-point shape")
        scale = VIEW_SIZE / extent
        return cls(
            min_x=min_x - FRAME_PAD / scale,
            max_y=max_y + FRAME_PAD / scale,
            scale=scale,
            width=round((max_x - min_x) * scale + 2 * FRAME_PAD, 1),
            height=round((max_y - min_y) * scale + 2 * FRAME_PAD, 1),
        )

    def apply(self, geom: BaseGeometry) -> BaseGeometry:
        """Plane coordinates to frame coordinates (y points down, as SVG expects)."""
        return shapely.transform(
            geom,
            lambda c: np.column_stack(
                ((c[:, 0] - self.min_x) * self.scale, (self.max_y - c[:, 1]) * self.scale)
            ),
        )


def polygons(geom: BaseGeometry) -> list[Polygon]:
    """The polygonal parts of any geometry (a clip can leave lines and points behind)."""
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon | GeometryCollection):
        return [p for part in geom.geoms for p in polygons(part)]
    return []


def simplify(geom: BaseGeometry, tolerance: float = SIMPLIFY_TOLERANCE) -> BaseGeometry:
    """Douglas-Peucker in frame units, keeping the shape valid, dropping specks."""
    parts = polygons(geom.simplify(tolerance, preserve_topology=True))
    kept = [p for p in parts if p.area >= MIN_PIECE_AREA]
    if not kept and parts:
        kept = [max(parts, key=lambda p: p.area)]  # never drop the only piece
    return MultiPolygon(kept) if kept else Polygon()


def clip(geom: BaseGeometry, to: BaseGeometry) -> BaseGeometry:
    """``geom`` restricted to ``to``, polygonal parts only, slivers dropped."""
    try:
        piece = geom.intersection(to)
    except GEOSException:
        piece = geom.buffer(0).intersection(to.buffer(0))
    kept = [p for p in polygons(piece) if p.area >= MIN_PIECE_AREA]
    return MultiPolygon(kept) if kept else Polygon()


def _fmt(value: float) -> str:
    text = f"{value:.1f}".rstrip("0").rstrip(".")
    return "0" if text in ("", "-0") else text


def path_d(geom: BaseGeometry) -> str:
    """SVG path data for every ring of every polygon (draw with ``fill-rule: evenodd``)."""
    parts: list[str] = []
    for poly in polygons(geom):
        for ring in (poly.exterior, *poly.interiors):
            points: list[str] = []
            for x, y in list(ring.coords)[:-1]:
                point = f"{_fmt(x)},{_fmt(y)}"
                if not points or points[-1] != point:  # rounding can merge neighbours
                    points.append(point)
            if len(points) >= 3:
                parts.append("M" + "L".join(points) + "Z")
    return "".join(parts)
