"""Source: Senate Periodic Transaction Reports of tracked senators, from eFD (ADR 0026).

1. The eFD search is read whole: every periodic transaction report submitted since the tracked
   Congress began, by every filer, 100 rows a page (about 4 requests). Its rows carry a name and
   an office but no bioguide id.
2. A row belongs to a tracked senator when its office is a sitting senator's and its last name
   (before any ", Jr.") equals the senator's. When two tracked senators share a last name, a
   first-name word must equal the senator's first, middle or nickname too; a row still matching
   two is logged and skipped, never guessed.
3. Each such report is fetched once. One stored as ``parsed`` or ``paper`` is not fetched again
   unless ``--full-refresh`` is given: a filed eFD report cannot be edited, only amended. A
   ``failed`` one is retried every night, so a reader fix reaches it.
4. The page is read by :mod:`ingest.senate_efd`: ``paper`` (page images, nothing to read),
   ``parsed`` (its rows go to ``raw.senate_ptr_transaction``) or ``failed`` (the reason is
   stored). The report's own heading must name the senator the search row was matched to.
5. Every amendment of a tracked senator is then matched to the report it replaces
   (:func:`ingest.senate_efd.amended_report`); ``supersedes`` holds that report's id, and dbt
   lists the replaced report but not its trades.

Failure handling: a 403 at any step is senate.gov refusing this client, so the run is
``unavailable`` and the rows already held stay (ADR 0020). A report that cannot be fetched is
skipped tonight and retried tomorrow; the run fails if every attempted fetch failed. A changed
search shape raises :class:`SourceShapeError`.
"""

from __future__ import annotations

import logging
import time
from collections import Counter, defaultdict
from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import NamedTuple

import httpx
from psycopg import Connection
from psycopg.types.json import Jsonb

from api.config import get_settings
from ingest.db import connect
from ingest.house_ptr import normalise_name
from ingest.load import record_run, upsert
from ingest.senate_efd import (
    BASE_URL,
    EfdClient,
    EfdParseError,
    SearchRow,
    SourceShapeError,
    amended_report,
    is_sitting_senator,
    paper_pages,
    parse_ptr,
    parse_search_rows,
    report_url,
)
from ingest.sources.congress_gov import tracked_member_ids

__all__ = ["SOURCE", "SourceShapeError", "load", "run"]

log = logging.getLogger("ingest.senate_ptr")

SOURCE = "senate_ptr"


class TrackedSenator(NamedTuple):
    bioguide_id: str
    last_name: str  # normalised
    given: frozenset[str]  # normalised first, middle and nickname


class Match(NamedTuple):
    row: SearchRow
    bioguide_id: str


def tracked_senators(conn: Connection, bioguide_ids: Sequence[str]) -> list[TrackedSenator]:
    """Tracked members whose latest term is in the Senate, with the names eFD lists them by."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT l.bioguide_id,
                   l.payload -> 'name' ->> 'last',
                   l.payload -> 'name' ->> 'first',
                   l.payload -> 'name' ->> 'middle',
                   l.payload -> 'name' ->> 'nickname'
            FROM raw.legislator AS l
            WHERE l.bioguide_id = ANY(%s)
              AND l.payload -> 'terms' -> -1 ->> 'type' = 'sen'
            ORDER BY l.bioguide_id
            """,
            (list(bioguide_ids),),
        )
        return [
            TrackedSenator(
                r[0],
                normalise_name(r[1] or ""),
                frozenset(normalise_name(n) for n in r[2:] if n),
            )
            for r in cur.fetchall()
        ]


def efd_last_name(value: str) -> str:
    """``McConnell, Jr.`` and ``BLUMENTHAL`` as the legislators file spells them."""
    return normalise_name(value.split(",", 1)[0])


def match_reports(
    rows: Sequence[SearchRow], senators: Sequence[TrackedSenator]
) -> tuple[list[Match], list[SearchRow]]:
    """Rows of tracked senators, and rows that matched more than one (logged, not stored)."""
    by_last: dict[str, list[TrackedSenator]] = defaultdict(list)
    for senator in senators:
        by_last[senator.last_name].append(senator)
    matched: list[Match] = []
    ambiguous: list[SearchRow] = []
    for row in rows:
        if not is_sitting_senator(row):
            continue
        found = by_last.get(efd_last_name(row.last), [])
        if len(found) > 1:
            words = {normalise_name(w) for w in row.first.replace(".", " ").split()}
            found = [s for s in found if s.given & words]
        if len(found) == 1:
            matched.append(Match(row, found[0].bioguide_id))
        elif len(found) > 1:
            ambiguous.append(row)
    return matched, ambiguous


def stored_report_ids(conn: Connection) -> set[str]:
    """Reports that need no second fetch: a filed eFD report is never edited."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT report_id FROM raw.senate_ptr_report WHERE status IN ('parsed', 'paper')"
        )
        return {row[0] for row in cur.fetchall()}


def congress_start(congress: int) -> date:
    return date(1789 + 2 * (congress - 1), 1, 3)


def search_all(client: EfdClient, since: date) -> list[SearchRow]:
    rows: list[SearchRow] = []
    start = 0
    while True:
        payload = client.search_page(since, start)
        page = parse_search_rows(payload)
        rows.extend(page)
        total = payload.get("recordsTotal")
        if not isinstance(total, int):
            raise SourceShapeError("the search answer has no recordsTotal")
        start += len(page)
        if not page or start >= total:
            if len(rows) != total:
                raise SourceShapeError(f"the search reports {total} rows; {len(rows)} read")
            return rows


def _store(
    conn: Connection,
    match: Match,
    status: str,
    error: str | None,
    header: dict,
    trades: list,
    fetched_at: datetime,
) -> int:
    row = match.row
    url = report_url(row.path)
    with conn.cursor() as cur:
        # A re-read replaces the report's rows, so a reader fix cannot leave stale ones.
        cur.execute("DELETE FROM raw.senate_ptr_transaction WHERE report_id = %s", (row.report_id,))
    total = upsert(
        conn,
        "raw",
        "senate_ptr_report",
        ["report_id"],
        [
            {
                "report_id": row.report_id,
                "bioguide_id": match.bioguide_id,
                "status": status,
                "error": error,
                "payload": Jsonb({"search": row.as_payload(), "report": header}),
                "source_url": url,
                "fetched_at": fetched_at,
            }
        ],
    )
    total += upsert(
        conn,
        "raw",
        "senate_ptr_transaction",
        ["report_id", "row_number"],
        [
            {
                "report_id": row.report_id,
                "row_number": t.row_number,
                "bioguide_id": match.bioguide_id,
                "payload": Jsonb(t.as_payload()),
                "source_url": url,
                "fetched_at": fetched_at,
            }
            for t in trades
        ],
    )
    return total


def resolve_amendments(conn: Connection, bioguide_ids: Sequence[str]) -> Counter[str]:
    """Set ``supersedes`` on every stored amendment of these senators. Returns outcome counts."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT r.report_id, r.bioguide_id, r.status,
                   r.payload -> 'search' ->> 'report_for',
                   (r.payload -> 'search' ->> 'amendment')::int,
                   to_date(r.payload -> 'search' ->> 'filed', 'MM/DD/YYYY')
            FROM raw.senate_ptr_report AS r
            WHERE r.bioguide_id = ANY(%s)
            """,
            (list(bioguide_ids),),
        )
        reports = cur.fetchall()
        cur.execute(
            """
            SELECT t.report_id, t.payload
            FROM raw.senate_ptr_transaction AS t
            WHERE t.bioguide_id = ANY(%s)
            """,
            (list(bioguide_ids),),
        )
        keys: dict[str, list[tuple[str, ...]]] = defaultdict(list)
        for report_id, p in cur.fetchall():
            keys[report_id].append(
                (
                    p["transaction_date"],
                    p["owner"],
                    p["ticker"] or "",
                    p["asset_name"],
                    p["asset_type"],
                    p["type"],
                    p["amount"],
                )
            )

    groups: dict[tuple[str, str], list[tuple]] = defaultdict(list)
    for report in reports:
        groups[(report[1], report[3])].append(report)
    outcome: Counter[str] = Counter()
    decided: list[tuple[str | None, str | None, str]] = []  # supersedes, note, report_id
    for group in groups.values():
        replaced: set[str] = set()
        for report_id, _, status, _, amendment, _ in sorted(group, key=lambda r: (r[4], r[5])):
            if amendment == 0:
                decided.append((None, None, report_id))
                continue
            if status != "parsed":
                decided.append((None, f"not resolved: the amendment is {status}", report_id))
                outcome["unresolved"] += 1
                continue
            candidates = {
                other_id: keys[other_id]
                for other_id, _, other_status, _, other_amendment, _ in group
                if other_amendment < amendment
                and other_status == "parsed"
                and other_id not in replaced
            }
            if not candidates:
                # The report it amends predates the tracked Congress (or is not held): the
                # amendment is the only version there is, so it stands alone.
                outcome["standalone"] += 1
                decided.append((None, "no earlier report held for that date", report_id))
                continue
            chosen, why = amended_report(keys[report_id], candidates)
            if chosen:
                replaced.add(chosen)
                outcome["resolved"] += 1
                decided.append((chosen, why, report_id))
            else:
                outcome["unresolved"] += 1
                log.warning(
                    "amendment %s: not matched to the report it amends (%s)", report_id, why
                )
                decided.append((None, f"not resolved: {why}", report_id))
    with conn.cursor() as cur:
        cur.executemany(
            "UPDATE raw.senate_ptr_report SET supersedes = %s, supersedes_note = %s "
            "WHERE report_id = %s",
            decided,
        )
    return outcome


def load(
    conn: Connection,
    client: EfdClient,
    bioguide_ids: Sequence[str],
    since: date,
    *,
    full_refresh: bool = False,
) -> int:
    """Read the search and every needed report. Returns rows upserted (reports plus trades)."""
    started = time.monotonic()
    with record_run(conn, SOURCE, BASE_URL) as run:
        fetched_at = datetime.now(UTC)
        senators = tracked_senators(conn, bioguide_ids)
        rows = search_all(client, since)
        matches, ambiguous = match_reports(rows, senators)
        for row in ambiguous:
            log.warning(
                "search row %s %s (%s) matches more than one tracked senator; not stored",
                row.first,
                row.last,
                row.report_id,
            )

        already = set() if full_refresh else stored_report_ids(conn)
        pending = [m for m in matches if m.row.report_id not in already]
        total = 0
        statuses: Counter[str] = Counter()
        fetch_failures = 0
        transactions = 0
        values: dict[str, Counter[str]] = {
            "type": Counter(),
            "owner": Counter(),
            "asset": Counter(),
        }
        for match in pending:
            row = match.row
            try:
                page = client.report(row.path)
            except httpx.HTTPError as exc:
                log.warning("%s: report not fetched tonight (%s); will retry", row.report_id, exc)
                fetch_failures += 1
                continue
            status, error, header, trades = "parsed", None, {}, []
            if row.kind == "paper":
                status, header = "paper", {"pages": paper_pages(page)}
            else:
                try:
                    report = parse_ptr(page)
                    header = {
                        "title": report.title,
                        "filer": report.filer,
                        "filed_at": report.filed_at,
                        "stated_total": report.stated_total,
                    }
                    if efd_last_name(row.last) not in normalise_name(report.filer):
                        raise EfdParseError(
                            f"the report names {report.filer!r}, the search row {row.last!r}"
                        )
                    trades = report.transactions
                except EfdParseError as exc:
                    status, error, trades = "failed", str(exc)[:1000], []
                    log.warning("%s: could not be read (%s)", row.report_id, error)
            statuses[status] += 1
            total += _store(conn, match, status, error, header, trades, fetched_at)
            transactions += len(trades)
            for t in trades:
                values["type"][t.type] += 1
                values["owner"][t.owner] += 1
                values["asset"][t.asset_type] += 1
            log.info("%s: %s, %d transactions", row.report_id, status, len(trades))

        if pending and fetch_failures == len(pending):
            raise RuntimeError(f"every eFD report fetch failed tonight ({fetch_failures} reports)")
        amendments = resolve_amendments(conn, sorted({m.bioguide_id for m in matches}))
        log.info(
            "%d search rows; %d reports of tracked senators (%d ambiguous); %d fetched: "
            "%s parsed, %s paper, %s failed, %d not fetched; %d transactions; amendments "
            "%s resolved, %s unresolved, %s standalone; %d requests, %.1f MB, %.0fs",
            len(rows),
            len(matches),
            len(ambiguous),
            len(pending),
            statuses["parsed"],
            statuses["paper"],
            statuses["failed"],
            fetch_failures,
            transactions,
            amendments["resolved"],
            amendments["unresolved"],
            amendments["standalone"],
            client.requests_made,
            client.bytes_fetched / 1e6,
            time.monotonic() - started,
        )
        for kind, counter in values.items():
            if counter:
                log.info("%s values seen: %s", kind, dict(sorted(counter.items())))
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
