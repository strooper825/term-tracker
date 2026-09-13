"""Freshness check and size report for the nightly job (plan section 10, 1e).

Fails (exit 1) when any registered source has no successful ``meta.ingest_run`` or its last
success is older than ``--max-age-hours``. Prints a Markdown report, also appended to the
GitHub step summary when ``GITHUB_STEP_SUMMARY`` is set, with the database size against the
Neon free-tier allowance so growth is visible every night.

Usage::

    python -m ingest.freshness --max-age-hours 26
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from psycopg import Connection

from ingest.db import connect
from ingest.run import SOURCES

FREE_TIER_BYTES = 512 * 1024 * 1024  # Neon free tier: 0.5 GB of storage
WARN_FRACTION = 0.8


@dataclass
class SourceStatus:
    source: str
    last_success_at: datetime | None
    rows_loaded: int | None

    def age(self, now: datetime) -> timedelta | None:
        return None if self.last_success_at is None else now - self.last_success_at


def evaluate(
    statuses: list[SourceStatus], now: datetime, max_age: timedelta
) -> tuple[bool, list[str]]:
    """Return (ok, problems) for the registered sources."""
    problems = []
    for status in statuses:
        age = status.age(now)
        if age is None:
            problems.append(f"{status.source}: no successful run recorded")
        elif age > max_age:
            hours = age.total_seconds() / 3600
            problems.append(f"{status.source}: last success {hours:.1f} h ago (limit {max_age})")
    return not problems, problems


def read_statuses(conn: Connection, sources: list[str]) -> list[SourceStatus]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (source) source, finished_at, rows_loaded
            FROM meta.ingest_run
            WHERE status = 'success' AND finished_at IS NOT NULL AND source = ANY(%s)
            ORDER BY source, finished_at DESC
            """,
            (sources,),
        )
        found = {row[0]: SourceStatus(row[0], row[1], row[2]) for row in cur.fetchall()}
    return [found.get(s, SourceStatus(s, None, None)) for s in sources]


def read_sizes(conn: Connection) -> tuple[int, list[tuple[str, int]]]:
    with conn.cursor() as cur:
        cur.execute("SELECT pg_database_size(current_database())")
        row = cur.fetchone()
        total = int(row[0]) if row else 0
        cur.execute(
            """
            SELECT n.nspname, sum(pg_total_relation_size(c.oid))::bigint
            FROM pg_class AS c
            JOIN pg_namespace AS n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'm', 't')
              AND n.nspname IN ('raw', 'staging', 'mart', 'seed', 'meta')
            GROUP BY n.nspname
            ORDER BY 2 DESC
            """
        )
        schemas = [(str(name), int(size)) for name, size in cur.fetchall()]
    return total, schemas


def _mb(size: int) -> str:
    return f"{size / 1048576:.1f} MB"


def report(
    statuses: list[SourceStatus],
    problems: list[str],
    now: datetime,
    total_bytes: int,
    schema_bytes: list[tuple[str, int]],
) -> str:
    lines = [
        "## Nightly freshness",
        "",
        "| Source | Last success (UTC) | Age | Rows | Status |",
        "|---|---|---|---|---|",
    ]
    for status in statuses:
        age = status.age(now)
        stamp = (
            status.last_success_at.strftime("%Y-%m-%d %H:%M") if status.last_success_at else "never"
        )
        age_text = f"{age.total_seconds() / 3600:.1f} h" if age else "n/a"
        flag = "stale" if any(p.startswith(status.source + ":") for p in problems) else "ok"
        lines.append(
            f"| {status.source} | {stamp} | {age_text} | {status.rows_loaded or 0} | {flag} |"
        )
    lines += ["", "## Database size", ""]
    fraction = total_bytes / FREE_TIER_BYTES
    lines.append(
        f"Total: **{_mb(total_bytes)}** of the {_mb(FREE_TIER_BYTES)} free tier ({fraction:.0%})."
    )
    if fraction >= WARN_FRACTION:
        lines.append(f"Warning: above {WARN_FRACTION:.0%} of the free tier.")
    lines += ["", "| Schema | Size |", "|---|---|"]
    lines += [f"| {name} | {_mb(size)} |" for name, size in schema_bytes]
    if problems:
        lines += ["", "## Problems", ""] + [f"- {p}" for p in problems]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ingest.freshness")
    parser.add_argument("--max-age-hours", type=float, default=26.0)
    args = parser.parse_args(argv)

    now = datetime.now(UTC)
    with connect() as conn:
        statuses = read_statuses(conn, list(SOURCES))
        total, schemas = read_sizes(conn)
    ok, problems = evaluate(statuses, now, timedelta(hours=args.max_age_hours))
    text = report(statuses, problems, now, total, schemas)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with Path(summary).open("a", encoding="utf-8") as fh:
            fh.write(text)
    if total >= WARN_FRACTION * FREE_TIER_BYTES:
        print(f"::warning::database is at {total / FREE_TIER_BYTES:.0%} of the free tier")
    if not ok:
        for problem in problems:
            print(f"::error::{problem}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
