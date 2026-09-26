# 0019. Branch runs put the managed database back at main's schema

Date: 2026-09-26
Status: Accepted

(0018 is taken by the open house-ptr-trades pull request, #47.)

## Context

There is one managed database, and `ingest.yml` and `deploy.yml` both run `alembic upgrade head`
against it from whichever branch they are dispatched on. That is what lets a branch preview real
data. But a branch that adds a migration leaves the database at a revision main does not have,
and from then on every scheduled run on main fails at its first step:

```
ERROR [alembic.util.messaging] Can't locate revision identified by '0009'
```

This has happened twice. The election-context run (PR #21, closed) left revision 0007 on
2026-09-13 and needed a one-off branch that was never merged to undo it. The house-ptr-trades
run of 2026-09-21 (PR #47, still open) migrated to 0009 and was then cancelled; the scheduled
runs of 2026-09-21 and 2026-09-22 both failed on it, and the schedule was disabled by hand after
the second one.

## Decision

A run of any branch other than main ends by downgrading the database to main's Alembic head,
using the branch's own migration files, since only they know how to undo the branch's revisions
(`python -m ingest.schema restore`).

- In `ingest.yml` this is the `restore-schema` job. It runs after the deploy job, because the
  deploy migrates too, and it runs with `always()`, so a failed or cancelled run restores as
  well.
- `deploy.yml` dispatched on its own from a branch does the same as its last step. When
  `ingest.yml` calls it, the caller's job does the restore once the whole run is finished.
- If the database is already left ahead, dispatch `ingest.yml` **on main** with
  `restore_schema_from` set to the branch that added the revision. That run skips the ingest,
  checks out main, takes that branch's `migrations/versions`, and restores.
- The restore does nothing when the database is already at main's head, or behind it (the
  nightly upgrades it). It refuses, with a message saying what to do, when the checkout does not
  have the database's revision, or when the branch's migrations fork from an older main.
- The nightly's Migrate step, if it fails, says how to recover.

## Consequences

- A branch preview still reads the branch's data while it builds. Once the run ends, the
  branch's raw tables are dropped, and its data is loaded again by the first nightly after the
  merge. For every source so far that is one ordinary night's ingest.
- dbt tables that only the branch builds (its mart models) are not dropped. Main's API never
  reads them, and main's next `dbt build` leaves them alone. Drop them by hand if storage
  matters.
- A branch has to contain main's migrations before it runs against the managed database,
  because otherwise its own upgrade fails. That was already true.
- A branch migration's `downgrade()` now runs against production data, so it has to be right.
  CI already runs migrations up, down and up again on every pull request.
