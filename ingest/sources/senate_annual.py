"""Source: annual financial disclosures of tracked senators, listed and linked (ADR 0027).

One eFD search, after agreeing to its statement (ADR 0026): report types 7 and 10 (annual, new
filer, termination and candidate reports, and due-date extensions) filed by sitting senators since
the tracked Congress began, 100 rows a page. Rows are matched to tracked senators as the Senate
stock-trades source matches them, and each listed kind (see :mod:`ingest.annual_disclosures`)
goes to ``raw.annual_disclosure`` with ``source = 'senate_efd'``. No report page is fetched.

A 403 is senate.gov refusing this client (ADR 0020): the run is unavailable and the rows already
held stay.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from collections.abc import Sequence
from datetime import UTC, date, datetime

from psycopg import Connection
from psycopg.types.json import Jsonb

from api.config import get_settings
from ingest.annual_disclosures import EfdAnnualRow, parse_efd_annual_rows
from ingest.db import connect
from ingest.load import record_run, upsert
from ingest.senate_efd import (
    ANNUAL_REPORT_TYPE,
    BASE_URL,
    EXTENSION_REPORT_TYPE,
    SENATOR_FILER_TYPE,
    EfdClient,
    SourceShapeError,
    report_url,
)
from ingest.sources.congress_gov import tracked_member_ids
from ingest.sources.senate_ptr import congress_start, match_reports, tracked_senators

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


def load(
    conn: Connection,
    client: EfdClient,
    bioguide_ids: Sequence[str],
    since: date,
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
        log.info(
            "%d search rows; %d reports of %d tracked senators: %s; left out: %s; %d requests",
            len(rows) + sum(skipped.values()),
            len(records),
            len({r["bioguide_id"] for r in records}),
            dict(sorted(kinds.items())),
            dict(skipped.most_common(8)),
            client.requests_made,
        )
        run.rows_loaded = total
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:  # noqa: ARG001 - the search is read whole anyway
    client = EfdClient()
    try:
        with connect() as conn:
            return load(
                conn,
                client,
                tracked_member_ids(conn),
                congress_start(get_settings().current_congress),
            )
    finally:
        client.close()
