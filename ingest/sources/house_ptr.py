"""Source: House Periodic Transaction Reports of tracked House members (Stock trades tab, ADR 0018).

1. The Clerk's filing index for each year of the tracked Congress (``{year}FD.zip``) is read whole;
   its rows carry a name and a state-district but no bioguide id.
2. A ``P`` row belongs to a tracked member when the state, the district and the normalised last
   name all equal those of a tracked member's current House term (``raw.legislator``). A row that
   shares state and last name but not the district is logged as a near miss, not matched.
3. Each such filing's PDF is fetched once. A filing already stored as ``parsed`` or ``scanned``
   is not fetched again unless ``--full-refresh`` is given: a DocID's PDF does not change.
   Filings that ``failed`` are retried every night, so a parser fix reaches them.
4. The PDF is read by :mod:`ingest.house_ptr`: ``scanned`` (no text layer, paper filing),
   ``parsed`` (its rows are stored in ``raw.house_ptr_transaction``), or ``failed`` (text but
   no whole table; the reason is stored). A ``failed`` or ``scanned`` filing never stops the run.

Failure handling: a PDF that cannot be fetched (transport failure, 404) is skipped tonight,
not stored, and retried tomorrow; the run fails if every attempted fetch failed. A changed index
shape raises :class:`SourceShapeError`. The run ends by logging the counts a person checks:
index rows, filings of tracked members by status, transactions, requests, bytes, and the
tallies of every transaction, owner and asset-type code seen, with any code the seeds do not
map flagged and counted.
"""

from __future__ import annotations

import logging
import re
import time
from collections import Counter
from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import NamedTuple

import httpx
from psycopg import Connection
from psycopg.types.json import Jsonb

from api.config import get_settings
from ingest.db import connect
from ingest.house_ptr import (
    BASE_URL,
    PTR_FILING_TYPE,
    ClerkClient,
    PtrParseError,
    SourceShapeError,
    index_url,
    normalise_name,
    parse_index,
    parse_ptr,
    pdf_url,
)
from ingest.load import record_run, upsert
from ingest.models.house_ptr import IndexRow
from ingest.sources.congress_gov import tracked_member_ids

__all__ = ["SOURCE", "SourceShapeError", "load", "run"]

log = logging.getLogger("ingest.house_ptr")

SOURCE = "house_ptr"
ASSET_CODE_RE = re.compile(r"\[([A-Z0-9]{2})\]$")


class TrackedHouseMember(NamedTuple):
    bioguide_id: str
    last_name: str  # normalised
    state: str
    district: int


class Match(NamedTuple):
    row: IndexRow
    bioguide_id: str


def tracked_house_members(
    conn: Connection, bioguide_ids: Sequence[str]
) -> list[TrackedHouseMember]:
    """Tracked members whose latest term is in the House, with the seat the index names them by."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT l.bioguide_id,
                   l.payload -> 'name' ->> 'last',
                   l.payload -> 'terms' -> -1 ->> 'state',
                   (l.payload -> 'terms' -> -1 ->> 'district')::int
            FROM raw.legislator AS l
            WHERE l.bioguide_id = ANY(%s)
              AND l.payload -> 'terms' -> -1 ->> 'type' = 'rep'
            ORDER BY l.bioguide_id
            """,
            (list(bioguide_ids),),
        )
        return [TrackedHouseMember(r[0], normalise_name(r[1]), r[2], r[3]) for r in cur.fetchall()]


def match_filings(
    rows: Sequence[IndexRow], members: Sequence[TrackedHouseMember]
) -> tuple[list[Match], list[IndexRow]]:
    """PTR rows of tracked members, and PTR rows that share state and last name but not seat."""
    by_seat = {(m.state, m.district, m.last_name): m for m in members}
    by_name = {(m.state, m.last_name): m for m in members}
    matched: list[Match] = []
    near: list[IndexRow] = []
    for row in rows:
        if row.filing_type != PTR_FILING_TYPE:
            continue
        last = normalise_name(row.last)
        member = by_seat.get((row.state, row.district, last))
        if member:
            matched.append(Match(row, member.bioguide_id))
        elif (row.state, last) in by_name:
            near.append(row)
    return matched, near


def stored_doc_ids(conn: Connection) -> set[str]:
    """Filings that need no second fetch: their PDF is fixed once it has been read."""
    with conn.cursor() as cur:
        cur.execute("SELECT doc_id FROM raw.house_ptr_filing WHERE status IN ('parsed', 'scanned')")
        return {row[0] for row in cur.fetchall()}


def known_codes(conn: Connection) -> dict[str, set[str]] | None:
    """Codes the seeds map, or None when the seed tables do not exist yet (a fresh database).

    Checked with ``to_regclass`` rather than by catching the error: a failed statement would
    force a rollback, and the caller is still inside the run's uncommitted load.
    """
    tables = {
        "type": "ptr_transaction_types",
        "owner": "ptr_owner_codes",
        "asset": "ptr_asset_types",
    }
    with conn.cursor() as cur:
        for table in tables.values():
            cur.execute("SELECT to_regclass(%s)", (f"seed.{table}",))
            if cur.fetchone()[0] is None:
                return None
        out = {}
        for kind, table in tables.items():
            cur.execute(f"SELECT code FROM seed.{table}")  # noqa: S608 - fixed names above
            out[kind] = {r[0] for r in cur.fetchall()}
    return out


def years_of(congress: int, today: date) -> list[int]:
    """Calendar years of the Congress that have begun (the 119th: 2025, and 2026 from January)."""
    first = 1789 + 2 * (congress - 1)
    return [y for y in (first, first + 1) if y <= today.year]


def load(
    conn: Connection,
    client: ClerkClient,
    bioguide_ids: Sequence[str],
    years: Sequence[int],
    *,
    today: date | None = None,
    full_refresh: bool = False,
) -> int:
    """Read the index and every needed PTR. Returns rows upserted (filings plus transactions)."""
    today = today or date.today()
    started = time.monotonic()
    with record_run(conn, SOURCE, BASE_URL) as run:
        fetched_at = datetime.now(UTC)
        members = tracked_house_members(conn, bioguide_ids)
        index_rows = 0
        matches: list[Match] = []
        near_misses: list[IndexRow] = []
        for year in years:
            try:
                archive = client.get_bytes(index_url(year))
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404 and year == today.year:
                    log.warning("%d: the Clerk has not published this year's index yet", year)
                    continue
                raise
            rows = parse_index(archive, year)
            index_rows += len(rows)
            found, near = match_filings(rows, members)
            matches.extend(found)
            near_misses.extend(near)
        for row in near_misses:
            log.warning(
                "index row %s %s %s (%s) shares a tracked member's state and last name but "
                "not the district; not matched",
                row.doc_id,
                row.first,
                row.last,
                row.state_dst,
            )

        already = set() if full_refresh else stored_doc_ids(conn)
        pending = [m for m in matches if m.row.doc_id not in already]
        total = 0
        statuses: Counter[str] = Counter()
        fetch_failures = 0
        types: Counter[str] = Counter()
        owners: Counter[str] = Counter()
        assets: Counter[str] = Counter()
        transactions = 0
        for match in pending:
            row = match.row
            url = pdf_url(row.year, row.doc_id)
            try:
                data = client.get_bytes(url)
            except httpx.HTTPError as exc:
                log.warning("%s: PDF not fetched tonight (%s); will retry", row.doc_id, exc)
                fetch_failures += 1
                continue
            status, error, header, trades = "parsed", None, {}, []
            try:
                parsed = parse_ptr(data)
                header = {
                    "pages": parsed.pages,
                    "text_chars": parsed.text_chars,
                    "filer_name": parsed.filer_name,
                    "state_district": parsed.state_district,
                }
                if parsed.scanned:
                    status = "scanned"
                else:
                    trades = parsed.transactions
                    if parsed.state_district and parsed.state_district != row.state_dst:
                        raise PtrParseError(
                            f"the PDF says {parsed.state_district}, the index {row.state_dst}"
                        )
            except PtrParseError as exc:
                status, error, trades = "failed", str(exc)[:1000], []
                log.warning("%s: could not be parsed (%s)", row.doc_id, error)
            statuses[status] += 1

            # A re-read replaces the filing's rows, so a parser fix cannot leave stale ones.
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM raw.house_ptr_transaction WHERE doc_id = %s", (row.doc_id,)
                )
            total += upsert(
                conn,
                "raw",
                "house_ptr_filing",
                ["doc_id"],
                [
                    {
                        "doc_id": row.doc_id,
                        "bioguide_id": match.bioguide_id,
                        "year": row.year,
                        "status": status,
                        "error": error,
                        "payload": Jsonb({"index": row.model_dump(by_alias=True), "pdf": header}),
                        "source_url": url,
                        "fetched_at": fetched_at,
                    }
                ],
            )
            total += upsert(
                conn,
                "raw",
                "house_ptr_transaction",
                ["doc_id", "row_number"],
                [
                    {
                        "doc_id": row.doc_id,
                        "row_number": t.row_number,
                        "bioguide_id": match.bioguide_id,
                        "payload": Jsonb(t.as_payload()),
                        "source_url": f"{url}#page={t.page}",
                        "fetched_at": fetched_at,
                    }
                    for t in trades
                ],
            )
            transactions += len(trades)
            for t in trades:
                types[t.type] += 1
                owners[t.owner or "SELF"] += 1
                tail = ASSET_CODE_RE.search(t.asset)
                assets[tail.group(1) if tail else "?"] += 1
            log.info("%s: %s, %d transactions", row.doc_id, status, len(trades))

        if pending and fetch_failures == len(pending):
            raise RuntimeError(f"every PTR fetch failed tonight ({fetch_failures} filings)")
        _report(
            conn,
            index_rows,
            len(matches),
            len(near_misses),
            len(pending),
            statuses,
            fetch_failures,
            transactions,
            (types, owners, assets),
            client,
            time.monotonic() - started,
        )
        run.rows_loaded = total
    return run.rows_loaded


def _report(
    conn: Connection,
    index_rows: int,
    matched: int,
    near: int,
    pending: int,
    statuses: Counter[str],
    fetch_failures: int,
    transactions: int,
    codes: tuple[Counter[str], Counter[str], Counter[str]],
    client: ClerkClient,
    seconds: float,
) -> None:
    log.info(
        "%d index rows; %d PTRs of tracked members (%d near misses); %d fetched: %s parsed, "
        "%s scanned, %s failed, %d not fetched; %d transactions; %d requests, %.1f MB, %.0fs",
        index_rows,
        matched,
        near,
        pending,
        statuses["parsed"],
        statuses["scanned"],
        statuses["failed"],
        fetch_failures,
        transactions,
        client.requests_made,
        client.bytes_fetched / 1e6,
        seconds,
    )
    known = known_codes(conn)
    for kind, counter in zip(("type", "owner", "asset"), codes, strict=True):
        if not counter:
            continue
        log.info("%s codes seen: %s", kind, dict(sorted(counter.items())))
        if known is not None:
            unmapped = {c: n for c, n in counter.items() if c not in known[kind]}
            if unmapped:
                log.warning(
                    "%d rows carry %s codes no seed maps (kept, shown by their raw code): %s",
                    sum(unmapped.values()),
                    kind,
                    unmapped,
                )


def congress_years(today: date | None = None) -> list[int]:
    return years_of(get_settings().current_congress, today or date.today())


def run(*, full_refresh: bool = False) -> int:
    client = ClerkClient()
    try:
        with connect() as conn:
            return load(
                conn,
                client,
                tracked_member_ids(conn),
                congress_years(),
                full_refresh=full_refresh,
            )
    finally:
        client.close()
