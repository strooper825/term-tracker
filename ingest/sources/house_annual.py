"""Source: annual financial disclosures of tracked House members, listed and linked (ADR 0027).

The Clerk's filing index is read for the year before the tracked Congress began (its annual
reports are filed during the Congress) and for each year of the Congress that has begun. A row of
type ``O``, ``H``, ``A``, ``T`` or ``X`` (see :mod:`ingest.annual_disclosures`) filed on or after
the Congress's first day is matched to a tracked member by seat and name
(:class:`ingest.sources.house_ptr.SeatIndex`), the rule the stock-trades source uses. Each such
row goes to ``raw.annual_disclosure`` with ``source = 'house_clerk'``. No PDF is fetched.

A year's index the Clerk has not published yet is skipped while that year is current; any other
missing index fails the run.

Each annual, amendment, new member or termination report is then opened once (ADR 0029): a filed
PDF never changes. :mod:`ingest.house_annual_report` reads Schedules A (assets) and D
(liabilities) into ``raw.annual_report_page`` and ``raw.annual_report_row``. A PDF with no text
is stored as ``paper``. One that does not read, or whose own state-district or filing year
differs from the index row, is ``failed`` with no rows and is tried again each night. A PDF that
cannot be fetched is skipped tonight; the run fails if every attempted fetch failed.
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
from ingest.house_annual_report import AnnualReportParseError, parse_annual_report
from ingest.house_ptr import BASE_URL, ClerkClient, index_url, parse_index
from ingest.load import record_run, upsert
from ingest.models.house_ptr import IndexRow
from ingest.sources.congress_gov import tracked_member_ids
from ingest.sources.house_ptr import SeatIndex, tracked_house_members

log = logging.getLogger("ingest.house_annual")

SOURCE = "house_annual"
RAW_SOURCE = "house_clerk"


def index_years(congress: int, today: date) -> list[int]:
    """The year before the Congress began, then its years that have begun."""
    first = 1789 + 2 * (congress - 1)
    return [y for y in (first - 1, first, first + 1) if y <= today.year]


READ_KINDS = ("annual", "amendment", "new_filer", "termination")


def stored_pages(conn: Connection) -> set[str]:
    """Reports that need no second fetch: a filed PDF never changes."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT doc_id FROM raw.annual_report_page "
            "WHERE source = %s AND status IN ('parsed', 'paper')",
            (RAW_SOURCE,),
        )
        return {r[0] for r in cur.fetchall()}


def read_reports(
    conn: Connection,
    client: ClerkClient,
    listed: list[tuple[dict, IndexRow]],
    fetched_at: datetime,
    *,
    full_refresh: bool = False,
) -> tuple[int, Counter[str]]:
    """Open each listed report not read yet; store Schedules A and D. Returns rows and outcomes."""
    already = set() if full_refresh else stored_pages(conn)
    outcome: Counter[str] = Counter()
    total = attempted = 0
    for record, row in listed:
        if record["kind"] not in READ_KINDS or row.doc_id in already:
            continue
        attempted += 1
        try:
            data = client.get_bytes(record["source_url"])
        except httpx.HTTPError as exc:
            log.warning("%s: PDF not fetched tonight (%s); will retry", row.doc_id, exc)
            outcome["not fetched"] += 1
            continue
        status, error, header, schedules = "parsed", None, {}, {}
        try:
            parsed = parse_annual_report(data)
            header = {
                "pages": parsed.pages,
                "text_chars": parsed.text_chars,
                "filer_name": parsed.filer_name,
                "state_district": parsed.state_district,
                "filing_type": parsed.filing_type,
                "filing_year": parsed.filing_year,
            }
            if parsed.scanned:
                status = "paper"
            else:
                if parsed.state_district != row.state_dst:
                    raise AnnualReportParseError(
                        f"the PDF says {parsed.state_district}, the index {row.state_dst}"
                    )
                if parsed.filing_year != record["covers_year"]:
                    raise AnnualReportParseError(
                        f"the PDF covers {parsed.filing_year}, the index {record['covers_year']}"
                    )
                schedules = parsed.schedules
                header["schedules"] = {
                    k: {"rows": len(s.rows), "none_disclosed": s.none_disclosed}
                    for k, s in schedules.items()
                }
        except AnnualReportParseError as exc:
            status, error, schedules = "failed", str(exc)[:1000], {}
            log.warning("%s: could not be read (%s)", row.doc_id, error)
        outcome[status] += 1
        with conn.cursor() as cur:
            # A re-read replaces the report's rows, so a reader fix cannot leave stale ones.
            cur.execute(
                "DELETE FROM raw.annual_report_row WHERE source = %s AND doc_id = %s",
                (RAW_SOURCE, row.doc_id),
            )
        total += upsert(
            conn,
            "raw",
            "annual_report_page",
            ["source", "doc_id"],
            [
                {
                    "source": RAW_SOURCE,
                    "doc_id": row.doc_id,
                    "bioguide_id": record["bioguide_id"],
                    "status": status,
                    "error": error,
                    "payload": Jsonb(header),
                    "source_url": record["source_url"],
                    "fetched_at": fetched_at,
                }
            ],
        )
        total += upsert(
            conn,
            "raw",
            "annual_report_row",
            ["source", "doc_id", "part", "row_index"],
            [
                {
                    "source": RAW_SOURCE,
                    "doc_id": row.doc_id,
                    "part": letter,
                    "row_index": index,
                    "bioguide_id": record["bioguide_id"],
                    "payload": Jsonb(r.as_payload()),
                    "fetched_at": fetched_at,
                }
                for letter, schedule in schedules.items()
                for index, r in enumerate(schedule.rows, start=1)
            ],
        )
    if attempted and outcome["not fetched"] == attempted:
        raise RuntimeError(f"every annual report PDF fetch failed tonight ({attempted} reports)")
    return total, outcome


def load(
    conn: Connection,
    client: ClerkClient,
    bioguide_ids: Sequence[str],
    years: Sequence[int],
    since: date,
    *,
    today: date | None = None,
    full_refresh: bool = False,
) -> int:
    today = today or date.today()
    with record_run(conn, SOURCE, BASE_URL) as run:
        fetched_at = datetime.now(UTC)
        members = tracked_house_members(conn, bioguide_ids)
        seats = SeatIndex(members)
        rows = []
        listed: list[tuple[dict, IndexRow]] = []
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
                record = {
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
                rows.append(record)
                listed.append((record, row))
        total = upsert(conn, "raw", "annual_disclosure", ["source", "doc_id"], rows)
        read, outcome = read_reports(conn, client, listed, fetched_at, full_refresh=full_refresh)
        total += read
        log.info(
            "%d reports of %d tracked House members since %s: %s; opened: %s; %d requests, %.1f MB",
            len(rows),
            len({r["bioguide_id"] for r in rows}),
            since,
            dict(sorted(kinds.items())),
            dict(sorted(outcome.items())),
            client.requests_made,
            client.bytes_fetched / 1e6,
        )
        run.rows_loaded = total
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:
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
                full_refresh=full_refresh,
            )
    finally:
        client.close()
