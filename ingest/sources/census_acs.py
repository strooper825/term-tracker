"""Source: American Community Survey 5-year estimates for every state and congressional district.

Four requests fetch the whole nation (the API returns all districts for ``for=congressional
district:*&in=state:*``), so the count does not grow with the number of tracked members: the
Data Profile and the Hispanic-origin-by-race detail table, each for the states and for the
districts. Every row is stored verbatim, strings and ``null`` as the API sent them, with the
margin of error beside each estimate; turning "-666666666" (not computed) into null and race
counts into shares happens in dbt (``stg_acs_estimates``, ``constituency_demographics``).

Which Congress's districts an ACS year describes is a fact about the release, kept in
:data:`ingest.census.ACS_CONGRESS`. The 2020-2024 5-year, released 2026-01-29, uses the 119th.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb

from api.config import get_settings
from ingest.census import (
    ACS_CONGRESS,
    BASE_URL,
    CensusClient,
    SourceShapeError,
    congress_for,
    geoid,
)
from ingest.db import connect
from ingest.load import record_run, upsert

log = logging.getLogger("ingest.census_acs")

SOURCE = "census_acs"
MIN_STATES, MIN_DISTRICTS = 51, 435  # 50 states and DC; 435 districts
# The Census's district code for the part of a state that has none (water-only areas). The API
# returns these as rows ("Congressional Districts not defined"); the first nightly run to load
# real ACS data (2026-09-20) stored them and dbt then failed casting "ZZ" to a number. Nobody
# is represented there, so they are not loaded, and staging tolerates the ones already stored.
NOT_DEFINED = "ZZ"


def _with_margins(estimates: Sequence[str]) -> list[str]:
    """Each estimate with its margin of error: ``DP05_0001E`` -> ``DP05_0001M``."""
    return [v for e in estimates for v in (e, e[:-1] + "M")]


# Data Profile (labels checked in the 2024 variables.json, 2026-09-20). "PE" variables are
# percents, "E" counts and medians.
PROFILE_ESTIMATES = [
    "DP05_0001E",  # Total population
    "DP05_0018E",  # Median age (years)
    "DP03_0062E",  # Median household income (2024 inflation-adjusted dollars)
    "DP02_0001E",  # Total households
    "DP02_0068PE",  # Percent, 25 and over: bachelor's degree or higher
    "DP02_0067PE",  # Percent, 25 and over: high school graduate or higher
    "DP03_0009PE",  # Unemployment rate (civilian labor force)
    "DP03_0128PE",  # Percent of all people below the poverty level
]
# B03002, Hispanic or Latino origin by race: the categories do not overlap, so they sum to
# the total, unlike the Data Profile's race lines.
DETAIL_ESTIMATES = [
    "B03002_001E",  # Total
    "B03002_003E",  # Not Hispanic or Latino: White alone
    "B03002_004E",  # ... Black or African American alone
    "B03002_005E",  # ... American Indian and Alaska Native alone
    "B03002_006E",  # ... Asian alone
    "B03002_007E",  # ... Native Hawaiian and Other Pacific Islander alone
    "B03002_008E",  # ... Some other race alone
    "B03002_009E",  # ... Two or more races
    "B03002_012E",  # Hispanic or Latino (any race)
]
DATASETS: dict[str, tuple[str, list[str]]] = {
    "profile": ("{year}/acs/acs5/profile", _with_margins(PROFILE_ESTIMATES)),
    "detail": ("{year}/acs/acs5", _with_margins(DETAIL_ESTIMATES)),
}


def fetch_all(
    client: CensusClient,
    year: int,
    minimums: tuple[int, int] = (MIN_STATES, MIN_DISTRICTS),
) -> dict[tuple[str, str], dict[str, Any]]:
    """{(kind, geoid): {"name", "profile": {var: value}, "detail": {var: value}}}."""
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for kind in ("state", "district"):
        for dataset, (path, variables) in DATASETS.items():
            for row in client.table(path.format(year=year), variables, kind):
                if row.get("congressional district") == NOT_DEFINED:
                    continue
                entry = merged.setdefault((kind, geoid(row)), {"name": row["NAME"]})
                entry[dataset] = {v: row[v] for v in variables}
    states = sum(1 for kind, _ in merged if kind == "state")
    districts = len(merged) - states
    if states < minimums[0] or districts < minimums[1]:
        raise SourceShapeError(
            f"expected at least {minimums[0]} states and {minimums[1]} districts; "
            f"got {states} and {districts}"
        )
    incomplete = sorted(g for (_, g), e in merged.items() if set(DATASETS) - set(e))
    if incomplete:
        raise SourceShapeError(
            f"geographies returned by one ACS table but not the other: {incomplete[:10]}"
        )
    return merged


def load(
    conn: Connection,
    client: CensusClient,
    year: int,
    *,
    tracked: Sequence[tuple[str, str]] = (),
    full_refresh: bool = False,  # noqa: ARG001 - four requests, always re-fetched
    minimums: tuple[int, int] = (MIN_STATES, MIN_DISTRICTS),
) -> int:
    """Load the ACS estimates for ``year`` (``tracked``: (bioguide id, geoid), for the log)."""
    congress = congress_for(ACS_CONGRESS, year, "ACS 5-year")
    with record_run(conn, SOURCE, f"{BASE_URL}/{year}/acs/acs5") as run:
        fetched_at = datetime.now(UTC)
        merged = fetch_all(client, year, minimums)
        rows = [
            {
                "acs_year": year,
                "geoid": g,
                "kind": kind,
                "congress": congress,
                "payload": Jsonb(payload),
                "source_url": f"{BASE_URL}/{year}/acs/acs5/profile",
                "fetched_at": fetched_at,
            }
            for (kind, g), payload in sorted(merged.items())
        ]
        run.rows_loaded = upsert(conn, "raw", "acs_estimate", ["acs_year", "geoid"], rows)
        log.info("%d geographies, %d API requests", len(rows), client.requests_made)
        for bioguide_id, g in tracked:
            entry = next((v for (_, key), v in merged.items() if key == g), None)
            if entry is None:
                log.warning("%s: no ACS row for geography %s", bioguide_id, g)
                continue
            profile = entry["profile"]
            log.info(
                "%s: %s, population %s (margin %s), median household income %s",
                bioguide_id,
                entry["name"],
                profile["DP05_0001E"],
                profile["DP05_0001M"],
                profile["DP03_0062E"],
            )
    return run.rows_loaded


def tracked_constituencies(conn: Connection) -> list[tuple[str, str]]:
    """(bioguide id, geoid) of each tracked member's constituency: the state FIPS, plus the
    two-digit district for a House member (``00`` at large)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT l.bioguide_id,
                   f.fips_state || CASE
                       WHEN l.payload -> 'terms' -> -1 ->> 'type' = 'rep'
                       THEN lpad(l.payload -> 'terms' -> -1 ->> 'district', 2, '0')
                       ELSE '' END
            FROM raw.legislator AS l
            JOIN seed.tracked_members AS tm ON tm.bioguide_id = l.bioguide_id
            JOIN seed.fips AS f ON f.state_abbr = l.payload -> 'terms' -> -1 ->> 'state'
            ORDER BY l.bioguide_id
            """
        )
        return [(row[0], row[1]) for row in cur.fetchall()]


def run(*, full_refresh: bool = False) -> int:
    settings = get_settings()
    if not settings.census_api_key:
        raise RuntimeError("CENSUS_API_KEY is not set (see .env.example)")
    client = CensusClient(settings.census_api_key)
    try:
        with connect() as conn:
            return load(
                conn,
                client,
                settings.census_acs_year,
                tracked=tracked_constituencies(conn),
                full_refresh=full_refresh,
            )
    finally:
        client.close()
