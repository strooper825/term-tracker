"""Source: annual financial disclosures of tracked senators, listed and linked (ADR 0027).

One eFD search, after agreeing to its statement (ADR 0026): report types 7 and 10 (annual, new
filer, termination and candidate reports, and due-date extensions) filed by sitting senators since
the tracked Congress began, 100 rows a page. Rows are matched to tracked senators as the Senate
stock-trades source matches them, and each listed kind (see :mod:`ingest.annual_disclosures`)
goes to ``raw.annual_disclosure`` with ``source = 'senate_efd'``.

Each electronic annual report, amendment, new filer or termination report is then opened once
(ADR 0028): a filed eFD report is never edited, only amended by a new one. Its parts go to
``raw.annual_report_page`` and ``raw.annual_report_row`` (:mod:`ingest.efd_annual_report`). A
paper report is stored as ``paper`` without being opened; one that does not read, or whose
heading names someone other than the matched senator, as ``failed`` with no rows, and is tried
again each night. A report that cannot be fetched is skipped tonight; the run fails if every
attempted fetch failed.

A 403 is senate.gov refusing this client (ADR 0020): the run is unavailable and the rows already
held stay.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from collections.abc import Sequence
from datetime import UTC, date, datetime

import httpx
from psycopg import Connection
from psycopg.types.json import Jsonb

from api.config import get_settings
from ingest.annual_disclosures import EfdAnnualRow, parse_efd_annual_rows
from ingest.db import connect
from ingest.efd_annual_report import READER_VERSION, parse_annual_report
from ingest.house_ptr import normalise_name
from ingest.load import record_run, upsert
from ingest.senate_efd import (
    ANNUAL_REPORT_TYPE,
    BASE_URL,
    EXTENSION_REPORT_TYPE,
    SENATOR_FILER_TYPE,
    EfdClient,
    EfdParseError,
    SourceShapeError,
    report_url,
)
from ingest.sources.congress_gov import tracked_member_ids
from ingest.sources.senate_ptr import (
    Match,
    congress_start,
    efd_last_name,
    match_reports,
    tracked_senators,
)

log = logging.getLogger("ingest.senate_annual")

SOURCE = "senate_annual"
RAW_SOURCE = "senate_efd"


def search_all(client: EfdClient, since: date) -> tuple[list[EfdAnnualRow], Counter[str]]:
    rows: list[EfdAnnualRow] = []
    skipped: Counter[str] = Counter()
    start = read = 0
    while True:
        payload = client.search_page(
            since,
            start,
            report_types=(ANNUAL_REPORT_TYPE, EXTENSION_REPORT_TYPE),
            filer_types=(SENATOR_FILER_TYPE,),
        )
        page, left_out = parse_efd_annual_rows(payload)
        rows.extend(page)
        skipped.update(re.sub(r"\d", "9", title) for title in left_out)
        total = payload.get("recordsTotal")
        if not isinstance(total, int):
            raise SourceShapeError("the search answer has no recordsTotal")
        count = len(payload.get("data", []))
        read += count
        start += count
        if not count or start >= total:
            if read != total:
                raise SourceShapeError(f"the search reports {total} rows; {read} read")
            return rows, skipped


READ_KINDS = ("annual", "amendment", "new_filer", "termination")


def stored_pages(conn: Connection) -> set[str]:
    """Reports that need no second fetch: a filed eFD report is never edited. A page read by an
    older reader (``READER_VERSION``) is read again, so a reader fix reaches stored reports."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT doc_id FROM raw.annual_report_page "
            "WHERE source = %s AND (status = 'paper' OR (status = 'parsed' "
            "AND coalesce((payload ->> 'reader')::int, 1) >= %s))",
            (RAW_SOURCE, READER_VERSION),
        )
        return {r[0] for r in cur.fetchall()}


def read_reports(
    conn: Connection,
    client: EfdClient,
    matches: Sequence[Match],
    fetched_at: datetime,
    *,
    full_refresh: bool = False,
) -> tuple[int, Counter[str]]:
    """Open each report not read yet; store its parts. Returns rows upserted and outcomes."""
    already = set() if full_refresh else stored_pages(conn)
    outcome: Counter[str] = Counter()
    total = 0
    attempted = 0
    for match in matches:
        row: EfdAnnualRow = match.row  # type: ignore[assignment]
        if row.kind not in READ_KINDS or row.report_id in already:
            continue
        status, error, header, parts = "parsed", None, {}, {}
        if row.view == "paper":
            status = "paper"
        else:
            attempted += 1
            try:
                page = client.report(row.path)
            except httpx.HTTPError as exc:
                log.warning("%s: report not fetched tonight (%s); will retry", row.report_id, exc)
                outcome["not fetched"] += 1
                continue
            try:
                report = parse_annual_report(page)
                if efd_last_name(row.last) not in normalise_name(report.filer):
                    raise EfdParseError(
                        f"the report names {report.filer!r}, the search row {row.last!r}"
                    )
                header = {
                    "reader": READER_VERSION,
                    "title": report.title,
                    "filer": report.filer,
                    "filed_at": report.filed_at,
                    "covers_year": report.covers_year,
                    "parts": {k: p.summary() for k, p in report.parts.items()},
                }
                parts = report.parts
            except EfdParseError as exc:
                status, error = "failed", str(exc)[:1000]
                log.warning("%s: could not be read (%s)", row.report_id, error)
        outcome[status] += 1
        with conn.cursor() as cur:
            # A re-read replaces the report's rows, so a reader fix cannot leave stale ones.
            cur.execute(
                "DELETE FROM raw.annual_report_row WHERE source = %s AND doc_id = %s",
                (RAW_SOURCE, row.report_id),
            )
        total += upsert(
            conn,
            "raw",
            "annual_report_page",
            ["source", "doc_id"],
            [
                {
                    "source": RAW_SOURCE,
                    "doc_id": row.report_id,
                    "bioguide_id": match.bioguide_id,
                    "status": status,
                    "error": error,
                    "payload": Jsonb(header),
                    "source_url": report_url(row.path),
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
                    "doc_id": row.report_id,
                    "part": key,
                    "row_index": index,
                    "bioguide_id": match.bioguide_id,
                    "payload": Jsonb({"cells": [c.as_payload() for c in cells]}),
                    "fetched_at": fetched_at,
                }
                for key, part in parts.items()
                for index, cells in enumerate(part.rows, start=1)
            ],
        )
    if attempted and outcome["not fetched"] == attempted:
        raise RuntimeError(f"every eFD annual report fetch failed tonight ({attempted} reports)")
    return total, outcome


def load(
    conn: Connection,
    client: EfdClient,
    bioguide_ids: Sequence[str],
    since: date,
    *,
    full_refresh: bool = False,
) -> int:
    with record_run(conn, SOURCE, BASE_URL) as run:
        fetched_at = datetime.now(UTC)
        senators = tracked_senators(conn, bioguide_ids)
        rows, skipped = search_all(client, since)
        matches, ambiguous = match_reports(rows, senators)  # type: ignore[arg-type]
        for row in ambiguous:
            log.warning(
                "row %s %s (%s) matches two tracked senators; not stored",
                row.first,
                row.last,
                row.report_id,
            )
        records = []
        kinds: Counter[str] = Counter()
        for match in matches:
            row: EfdAnnualRow = match.row  # type: ignore[assignment]
            kinds[row.kind] += 1
            records.append(
                {
                    "source": RAW_SOURCE,
                    "doc_id": row.report_id,
                    "bioguide_id": match.bioguide_id,
                    "kind": row.kind,
                    "covers_year": row.covers_year,
                    "filing_date": datetime.strptime(row.filed, "%m/%d/%Y").date(),
                    "payload": Jsonb({"search": row.as_payload()}),
                    "source_url": report_url(row.path),
                    "fetched_at": fetched_at,
                }
            )
        total = upsert(conn, "raw", "annual_disclosure", ["source", "doc_id"], records)
        read, outcome = read_reports(conn, client, matches, fetched_at, full_refresh=full_refresh)
        total += read
        log.info(
            "%d search rows; %d reports of %d tracked senators: %s; left out: %s; "
            "opened: %s; %d requests, %.1f MB",
            len(rows) + sum(skipped.values()),
            len(records),
            len({r["bioguide_id"] for r in records}),
            dict(sorted(kinds.items())),
            dict(skipped.most_common(8)),
            dict(sorted(outcome.items())),
            client.requests_made,
            client.bytes_fetched / 1e6,
        )
        run.rows_loaded = total
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:
    client = EfdClient()
    try:
        with connect() as conn:
            return load(
                conn,
                client,
                tracked_member_ids(conn),
                congress_start(get_settings().current_congress),
                full_refresh=full_refresh,
            )
    finally:
        client.close()
