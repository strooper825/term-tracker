"""Incremental bills ingest: the whole Congress, only what changed (ADR 0023).

The other way to run the ``congress_gov_bills`` source (``BILL_INGEST_MODE=incremental``). It
reads every bill and amendment of the current Congress into ``raw``, whoever sponsored it;
``seed.tracked_members`` then decides what the mart keeps (``staging.stg_bill_scope``), not
what is fetched. Nothing here reads a member's sponsored or cosponsored list: those ignore
``fromDateTime``, mix every Congress the member served in, and take 5 to 16 seconds a page.

A run has two phases.

1. **Enumerate.** Ask the bill and amendment lists what changed since the watermark, minus an
   overlap (``fromDateTime``), and put every record that may be newer than the copy held into
   ``meta.bill_refresh_queue``. The queue rows and the new watermark are committed together,
   so a run that dies here changes nothing and the next one asks the same window again. Once
   a week, and on the first run, the whole list is read instead (about 110 requests) and
   compared with what is held: the first time that is the backfill, afterwards it is the check
   that the filter missed nothing. Whatever it finds is queued as ``resweep``, and the run
   that reads such a record reports whether it had in fact changed.
2. **Drain.** Read queued records, most urgent first, one transaction each: the detail, the
   lists that are due, and the deletion of the queue row. It stops when the queue is empty or
   the run's request budget is spent; what is left stays queued. A run that is cancelled or
   crashes loses at most the record it was reading.

A record that cannot be fetched (a status error after the retries) stays queued with its
attempt counted and does not stop the others; after ``MAX_ATTEMPTS`` it is read last and named
in the run summary. Ten failures in a row mean the API is down, and stop the run. A changed
shape still stops the run at once (plan section 11).
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
from psycopg import Connection

from ingest.congress_gov import BASE_URL, CongressGovClient, LegislationKey
from ingest.load import record_run
from ingest.sources.congress_gov import (
    FILTER_OVERLAP,
    MISSING,
    SOURCE,
    _existing_state,
    list_records,
    read_record,
    roll_call_legislation_keys,
)

log = logging.getLogger("ingest.congress_gov")

RESWEEP_EVERY = timedelta(days=7)
MAX_ATTEMPTS = 3
MAX_CONSECUTIVE_FAILURES = 10
PRIORITY = {"changed": 0, "new": 0, "resweep": 1, "backfill": 2}
REASONS = tuple(PRIORITY)


def _parse(value: str | None) -> datetime | None:
    """An ``updateDate`` as an aware datetime; a bare date is its midnight UTC."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def needs_read(stored: str | None, listed: str | None, *, recent_from: date | None) -> bool:
    """Whether a listed record may be newer than the copy held.

    ``stored`` is the held detail's ``updateDate`` (a timestamp), ``listed`` the list's. An
    amendment's listed value is a timestamp and is compared exactly. A bill's is only a date:
    a held copy from an earlier day is stale, one from a later day is not, and on the same day
    the list cannot say whether the bill moved again after it was read. Inside the window the
    run is asking about (``recent_from`` onward) that case is read again, which costs one
    request when nothing moved; outside it the copy is taken as current, or a weekly sweep
    would re-read every bill ever held.
    """
    held, seen = _parse(stored), _parse(listed)
    if held is None or seen is None:
        return True
    if listed is not None and "T" in listed:
        return seen > held
    if held.date() != seen.date():
        return held.date() < seen.date()
    return recent_from is not None and seen.date() >= recent_from


def read_cursor(conn: Connection, congress: int, kind: str) -> datetime | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT changed_through FROM meta.ingest_cursor "
            "WHERE source = %s AND congress = %s AND kind = %s",
            (SOURCE, congress, kind),
        )
        row = cur.fetchone()
    return row[0] if row else None


def _write_cursor(conn: Connection, congress: int, kind: str, value: datetime) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO meta.ingest_cursor (source, congress, kind, changed_through) "
            "VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (source, congress, kind) DO UPDATE "
            "SET changed_through = EXCLUDED.changed_through, updated_at = clock_timestamp()",
            (SOURCE, congress, kind, value),
        )


def enqueue(conn: Connection, rows: list[tuple[LegislationKey, str]]) -> None:
    """Queue records. One already queued keeps its place and takes the more urgent reason."""
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO meta.bill_refresh_queue "
            "(congress, bill_type, bill_number, kind, reason, priority) "
            "VALUES (%s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (congress, bill_type, bill_number) DO UPDATE SET "
            "reason = CASE WHEN EXCLUDED.priority < meta.bill_refresh_queue.priority "
            "THEN EXCLUDED.reason ELSE meta.bill_refresh_queue.reason END, "
            "priority = LEAST(EXCLUDED.priority, meta.bill_refresh_queue.priority)",
            [
                (key.congress, key.bill_type, key.bill_number, key.kind, reason, PRIORITY[reason])
                for key, reason in rows
            ],
        )


def queue_depth(conn: Connection, congress: int) -> dict[str, int]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT reason, count(*) FROM meta.bill_refresh_queue WHERE congress = %s GROUP BY 1",
            (congress,),
        )
        found = {str(reason): int(count) for reason, count in cur.fetchall()}
    return {reason: found.get(reason, 0) for reason in REASONS}


@dataclass
class Enumerated:
    full_sweep: bool
    first_run: bool
    since: datetime | None
    listed: int = 0
    requests: int = 0
    queued: dict[str, int] = field(default_factory=lambda: dict.fromkeys(REASONS, 0))


def enumerate_changes(
    conn: Connection, client: CongressGovClient, congress: int, started_at: datetime
) -> Enumerated:
    """Phase 1: queue what the lists say may be newer than raw, and move the watermark.

    One transaction. The watermark becomes ``started_at``, the moment this run began asking,
    so anything updated while it reads is inside the next run's window.
    """
    watermark = read_cursor(conn, congress, "changed")
    last_sweep = read_cursor(conn, congress, "resweep")
    first_run = watermark is None
    full_sweep = first_run or last_sweep is None or started_at - last_sweep >= RESWEEP_EVERY
    window_start = None if watermark is None else watermark - FILTER_OVERLAP
    result = Enumerated(full_sweep, first_run, None if full_sweep else window_start)
    recent_from = window_start.date() if window_start else None

    with conn.cursor() as cur:
        cur.execute(
            "SELECT bill_type, bill_number, payload ->> 'updateDate' FROM raw.bill "
            "WHERE congress = %s",
            (congress,),
        )
        held = {(r[0], r[1]): r[2] for r in cur.fetchall()}

    before = client.requests_made
    rows: list[tuple[LegislationKey, str]] = []
    for key, listed in list_records(client, congress, result.since):
        result.listed += 1
        stored = held.get((key.bill_type, key.bill_number))
        if not needs_read(stored, listed, recent_from=recent_from):
            continue
        seen = _parse(listed)
        in_window = (
            not full_sweep
            or seen is None
            or (recent_from is not None and seen.date() >= recent_from)
        )
        if in_window:
            reason = "new" if stored is None else "changed"
        elif first_run:
            # nothing was ever asked before: everything not held is the backlog
            reason = "backfill" if stored is None else "changed"
        else:
            # older than the window the filter was asked about, and still not what is held:
            # the filter, or a run, missed it
            reason = "resweep"
        rows.append((key, reason))
        result.queued[reason] += 1
    result.requests = client.requests_made - before

    # A bill a roll call names gets a page whatever else is queued ahead of it.
    held_keys = set(held)
    for key in roll_call_legislation_keys(conn, congress):
        if (key.bill_type, key.bill_number) not in held_keys:
            rows.append((key, "new"))

    enqueue(conn, rows)
    _write_cursor(conn, congress, "changed", started_at)
    if full_sweep:
        _write_cursor(conn, congress, "resweep", started_at)
    conn.commit()
    return result


@dataclass
class Drained:
    read: int = 0
    rows: int = 0
    lists_read: int = 0
    requests: int = 0
    budget_spent: bool = False
    # records the weekly comparison queued, and how many of them had really changed
    resweep_read: int = 0
    resweep_changed: int = 0
    failed: list[str] = field(default_factory=list)


def _queued(conn: Connection, congress: int) -> list[tuple[LegislationKey, str]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT kind, bill_type, bill_number, reason FROM meta.bill_refresh_queue "
            "WHERE congress = %s "
            "ORDER BY attempts >= %s, priority, enqueued_at, bill_type, bill_number",
            (congress, MAX_ATTEMPTS),
        )
        return [(LegislationKey(r[0], congress, r[1], r[2]), r[3]) for r in cur.fetchall()]


def drain(
    conn: Connection,
    client: CongressGovClient,
    congress: int,
    *,
    request_budget: int,
    fetched_at: datetime,
    full_refresh: bool = False,
) -> Drained:
    """Phase 2: read queued records, one transaction each, until empty or out of budget."""
    result = Drained()
    queue = _queued(conn, congress)
    existing = _existing_state(conn)
    conn.commit()
    start = client.requests_made
    consecutive_failures = 0
    for key, reason in queue:
        if client.requests_made - start >= request_budget:
            result.budget_spent = True
            break
        where = (key.congress, key.bill_type, key.bill_number)
        try:
            record = read_record(
                conn,
                client,
                key,
                existing.get(where, MISSING),
                fetched_at,
                full_refresh=full_refresh,
            )
        except httpx.HTTPError as exc:
            conn.rollback()
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE meta.bill_refresh_queue SET attempts = attempts + 1, last_error = %s "
                    "WHERE congress = %s AND bill_type = %s AND bill_number = %s",
                    (f"{type(exc).__name__}: {exc}"[:1000], *where),
                )
            conn.commit()
            result.failed.append(key.path)
            consecutive_failures += 1
            log.warning("%s: left queued after a failed read (%s)", key.path, exc)
            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                raise RuntimeError(
                    f"{consecutive_failures} records in a row could not be read from "
                    f"Congress.gov (last: {key.path}: {exc}); stopping with the queue intact"
                ) from exc
            continue
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM meta.bill_refresh_queue "
                "WHERE congress = %s AND bill_type = %s AND bill_number = %s",
                where,
            )
        conn.commit()
        consecutive_failures = 0
        result.read += 1
        result.rows += record.rows
        result.lists_read += record.lists_read > 0
        if reason == "resweep":
            result.resweep_read += 1
            result.resweep_changed += record.moved
    result.requests = client.requests_made - start
    return result


def summary_lines(
    listed: Enumerated, drained: Drained, left: dict[str, int], request_budget: int
) -> list[str]:
    if listed.first_run:
        asked = "the whole list (first incremental run)"
    elif listed.full_sweep:
        asked = "the whole list (weekly re-sweep)"
    else:
        assert listed.since is not None
        asked = f"changes since {listed.since.strftime('%Y-%m-%d %H:%M UTC')}"
    queued = ", ".join(f"{count} {reason}" for reason, count in listed.queued.items() if count)
    lines = [
        f"Asked for {asked}: {listed.listed} records listed in {listed.requests} requests; "
        f"queued {queued or 'none'}.",
        f"Read {drained.read} records ({drained.lists_read} with their lists) in "
        f"{drained.requests} requests.",
    ]
    # A record the weekly comparison queued is only a miss if it had really changed when it
    # was read: a list date that runs ahead of the record's own would otherwise be reported
    # every week.
    if drained.resweep_changed:
        lines.append(
            f"RE-SWEEP FOUND {drained.resweep_changed} records the nightly filter had not "
            f"brought in ({drained.resweep_read} read to check)."
        )
    elif drained.resweep_read:
        lines.append(f"Re-sweep: {drained.resweep_read} records read to check; none had changed.")
    elif listed.full_sweep and not listed.first_run:
        lines.append("Re-sweep: nothing the nightly filter had missed.")
    remaining = ", ".join(f"{count} {reason}" for reason, count in left.items() if count)
    if drained.budget_spent:
        lines.append(
            f"Stopped at the request budget ({request_budget}); still queued: {remaining}."
        )
    elif remaining:
        lines.append(f"Still queued: {remaining}.")
    else:
        lines.append("The queue is empty.")
    if drained.failed:
        names = ", ".join(drained.failed[:20])
        lines.append(f"COULD NOT BE READ and left queued: {len(drained.failed)} ({names}).")
    return lines


def report(lines: list[str]) -> None:
    for line in lines:
        loud = line.startswith(("RE-SWEEP FOUND", "COULD NOT"))
        (log.warning if loud else log.info)("incremental: %s", line)
        if loud:
            print(f"::warning::{line}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with Path(summary).open("a", encoding="utf-8") as fh:
            fh.write("## Bill ingest, incremental (ADR 0023)\n\n")
            fh.writelines(f"- {line}\n" for line in lines)
            fh.write("\n")


def load(
    conn: Connection,
    client: CongressGovClient,
    congress: int,
    *,
    request_budget: int,
    full_refresh: bool = False,
    now: datetime | None = None,
) -> int:
    """Enumerate, then drain. Returns rows loaded.

    ``full_refresh`` re-reads the lists of every record this run reads; it does not queue the
    whole Congress, which is what the weekly re-sweep and a larger budget are for.
    """
    with record_run(conn, SOURCE, BASE_URL) as run:
        started_at = now or datetime.now(UTC)
        listed = enumerate_changes(conn, client, congress, started_at)
        drained = drain(
            conn,
            client,
            congress,
            request_budget=request_budget,
            fetched_at=started_at,
            full_refresh=full_refresh,
        )
        left = queue_depth(conn, congress)
        conn.commit()
        report(summary_lines(listed, drained, left, request_budget))
        run.rows_loaded = drained.rows
    return run.rows_loaded
