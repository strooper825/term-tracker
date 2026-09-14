"""One-off: return the managed database to Alembic revision 0006 after the closed PR #21 run.

The ingest.yml run dispatched on election-context (run 34804486393) migrated Neon to 0007 and
built objects main does not have. Subcommands, run in this order by the one-off workflow:

  report   print the Alembic revision and which of the five objects exist
  guard    fail unless the revision is 0007 and the only object depending on
           raw.election_return_contest is the view staging.stg_election_returns (so the CASCADE
           in migration 0007's downgrade drops nothing else), and nothing depends on the other four
  drop     after `alembic downgrade 0006`: drop the objects the downgrade does not own, no CASCADE
  verify   fail unless the revision is 0006 and all five objects are gone

Every statement is printed before it runs.
"""

from __future__ import annotations

import os
import sys

import psycopg

RAW = "raw.election_return_contest"
OBJECTS = [
    RAW,
    "staging.stg_election_returns",
    "mart.member_prior_election",
    "mart.member_next_election",
    "seed.race_nominees",
]
EXPECTED_CASCADE = [("staging", "stg_election_returns", "v")]
DROPS = [
    "DROP VIEW IF EXISTS staging.stg_election_returns",
    "DROP TABLE IF EXISTS mart.member_prior_election",
    "DROP TABLE IF EXISTS mart.member_next_election",
    "DROP TABLE IF EXISTS seed.race_nominees",
]
# Views (through their rewrite rules) that depend on a relation, recursively.
VIEW_DEPENDENTS = """
WITH RECURSIVE deps AS (
    SELECT DISTINCT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind, c.oid
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class c ON c.oid = rw.ev_class
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE d.refobjid = to_regclass(%s) AND c.oid <> d.refobjid
    UNION
    SELECT DISTINCT n.nspname, c.relname, c.relkind::text, c.oid
    FROM deps
    JOIN pg_depend d ON d.refobjid = deps.oid
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class c ON c.oid = rw.ev_class
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid <> deps.oid
)
SELECT schema, name, kind FROM deps ORDER BY schema, name
"""
FOREIGN_KEYS = (
    "SELECT conrelid::regclass::text, conname FROM pg_constraint "
    "WHERE contype = 'f' AND confrelid = to_regclass(%s)"
)


def _url() -> str:
    url = os.environ["DATABASE_URL"]
    for prefix in ("postgresql+psycopg://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql://" + url[len(prefix) :]
    return url


def _run(cur: psycopg.Cursor, sql: str, params: tuple = ()) -> None:
    print("SQL>", " ".join(sql.split()), params if params else "")
    cur.execute(sql, params)


def _revision(cur: psycopg.Cursor) -> list[str]:
    _run(cur, "SELECT version_num FROM alembic_version")
    return [r[0] for r in cur.fetchall()]


def _existing(cur: psycopg.Cursor) -> dict[str, bool]:
    found = {}
    for obj in OBJECTS:
        _run(cur, "SELECT to_regclass(%s) IS NOT NULL", (obj,))
        found[obj] = cur.fetchone()[0]
    return found


def main(command: str) -> int:
    with psycopg.connect(_url()) as conn, conn.cursor() as cur:
        if command == "report":
            print("revision:", _revision(cur))
            for obj, exists in _existing(cur).items():
                print(f"  {obj}: {'present' if exists else 'absent'}")
            return 0

        if command == "guard":
            problems = []
            revision = _revision(cur)
            if revision != ["0007"]:
                problems.append(f"revision is {revision}, expected ['0007']")
            _run(cur, VIEW_DEPENDENTS, (RAW,))
            cascade = [tuple(r) for r in cur.fetchall()]
            print("objects CASCADE would drop with", RAW, ":", cascade)
            if cascade != EXPECTED_CASCADE:
                problems.append(
                    f"CASCADE on {RAW} would drop {cascade}, expected {EXPECTED_CASCADE}"
                )
            for obj in OBJECTS:
                _run(cur, FOREIGN_KEYS, (obj,))
                fks = cur.fetchall()
                if fks:
                    problems.append(f"foreign keys reference {obj}: {fks}")
            for obj in OBJECTS[1:]:
                _run(cur, VIEW_DEPENDENTS, (obj,))
                deps = cur.fetchall()
                print(f"views depending on {obj}: {deps}")
                if deps:
                    problems.append(f"views depend on {obj}: {deps}")
            for problem in problems:
                print("GUARD FAILED:", problem)
            return 1 if problems else 0

        if command == "drop":
            revision = _revision(cur)
            if revision != ["0006"]:
                print(f"refusing to drop: revision is {revision}, expected ['0006']")
                return 1
            for sql in DROPS:
                _run(cur, sql)
            conn.commit()
            print("committed")
            return 0

        if command == "verify":
            revision = _revision(cur)
            existing = _existing(cur)
            print("revision:", revision)
            for obj, exists in existing.items():
                print(f"  {obj}: {'PRESENT' if exists else 'absent'}")
            ok = revision == ["0006"] and not any(existing.values())
            print("VERIFIED" if ok else "VERIFY FAILED")
            return 0 if ok else 1

    print(f"unknown command {command!r}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
