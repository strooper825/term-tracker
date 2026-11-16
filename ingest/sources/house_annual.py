"""Source: annual financial disclosures of tracked House members, listed and linked (ADR 0027).

The Clerk's filing index is read for the year before the tracked Congress began (its annual
reports are filed during the Congress) and for each year of the Congress that has begun. A row of
type ``O``, ``H``, ``A``, ``T`` or ``X`` (see :mod:`ingest.annual_disclosures`) filed on or after
the Congress's first day is matched to a tracked member by seat and name
(:class:`ingest.sources.house_ptr.SeatIndex`), the rule the stock-trades source uses. Each such
row goes to ``raw.annual_disclosure`` with ``source = 'house_clerk'``. No PDF is fetched.

A year's index the Clerk has not published yet is skipped while that year is current; any other
missing index fails the run.
"""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Sequence
from datetime import UTC, date, datetime

import httpx
from psycopg import Connection
from psycopg.types.json import Jsonb

from api.config import get_settings
from ingest.annual_disclosures import HOUSE_KINDS, house_report_url
from ingest.db import connect
from ingest.house_ptr import BASE_URL, ClerkClient, index_url, parse_index
from ingest.load import record_run, upsert
from ingest.sources.congress_gov import tracked_member_ids
from ingest.sources.house_ptr import SeatIndex, tracked_house_members

log = logging.getLogger("ingest.house_annual")

SOURCE = "house_annual"
RAW_SOURCE = "house_clerk"


def index_years(congress: int, today: date) -> list[int]:
    """The year before the Congress began, then its years that have begun."""
    first = 1789 + 2 * (congress - 1)
    return [y for y in (first - 1, first, first + 1) if y <= today.year]


def load(
    conn: Connection,
    client: ClerkClient,
    bioguide_ids: Sequence[str],
    years: Sequence[int],
    since: date,
    *,
    today: date | None = None,
) -> int:
    today = today or date.today()
    with record_run(conn, SOURCE, BASE_URL) as run:
        fetched_at = datetime.now(UTC)
        members = tracked_house_members(conn, bioguide_ids)
        seats = SeatIndex(members)
        rows = []
        kinds: Counter[str] = Counter()
        for year in years:
            try:
                archive = client.get_bytes(index_url(year))
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404 and year == today.year:
                    log.warning("%d: the Clerk has not published this year's index yet", year)
                    continue
                raise
            for row in parse_index(archive, year):
                kind = HOUSE_KINDS.get(row.filing_type)
                if kind is None or not row.filing_date:
                    continue
                filed = datetime.strptime(row.filing_date, "%m/%d/%Y").date()
                member = seats.member(row)
                if member is None or filed < since:
                    continue
                bioguide = member.bioguide_id
                kinds[kind] += 1
                rows.append(
                    {
                        "source": RAW_SOURCE,
                        "doc_id": row.doc_id,
                        "bioguide_id": bioguide,
                        "kind": kind,
                        "covers_year": year,
                        "filing_date": filed,
                        "payload": Jsonb({"index": row.model_dump(by_alias=True)}),
                        "source_url": house_report_url(year, row.doc_id),
                        "fetched_at": fetched_at,
                    }
                )
        total = upsert(conn, "raw", "annual_disclosure", ["source", "doc_id"], rows)
        log.info(
            "%d reports of %d tracked House members since %s: %s; %d requests, %.1f MB",
            len(rows),
            len({r["bioguide_id"] for r in rows}),
            since,
            dict(sorted(kinds.items())),
            client.requests_made,
            client.bytes_fetched / 1e6,
        )
        run.rows_loaded = total
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:  # noqa: ARG001 - the index is read whole anyway
    congress = get_settings().current_congress
    client = ClerkClient()
    try:
        with connect() as conn:
            return load(
                conn,
                client,
                tracked_member_ids(conn),
                index_years(congress, date.today()),
                date(1789 + 2 * (congress - 1), 1, 3),
            )
    finally:
        client.close()
