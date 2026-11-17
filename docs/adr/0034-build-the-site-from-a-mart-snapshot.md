# 0034. Build the site from a mart snapshot, not from Neon

Date: 2026-11-17
Status: Accepted

## Context

Neon's Free plan includes 5 GB of public network transfer a month: every byte any client reads
out of the database. It ran out on 2026-11-17, seventeen days into the month.

The site build was the reader. `deploy.yml` started the API on the runner against Neon and
rendered about 4,900 pages through it. Measured locally on 2026-11-17 through a byte-counting
proxy, one build opened 1,559 connections and read **119 MB** from Postgres. The ingest itself
reads little (sets of keys to decide what to fetch), and dbt's work stays inside the database.

The number of builds is what grew. November 1-12 had about one build a day. November 13-17 had
47: the second daily ingest added on 11-14 (ADR 0023), deploys of content edits (ADR 0022), and
dispatches while features were being built. About 60 builds at ~80-120 MB each is the 5 GB.

Postgres does not compress what it sends, so a dump of the schemas the API reads (mart, seed,
meta) is 78 MB on the wire, though only 7 MB as a custom-format file. Raw included it is 210 MB.

## Decision

1. **Ingest dumps the mart once.** After its dbt build, the ingest job runs
   `scripts/mart-snapshot.sh dump` and keeps the file as the `mart-snapshot` artifact (14 days).
2. **Every deploy builds from a Postgres in the runner.** `deploy.yml` has a `postgres:17`
   service, loads a snapshot into it, and starts the API against it. Neon is never queried by
   the page build.
3. **Which snapshot.** Called from `ingest.yml`, the same run's. Otherwise the newest one left by
   a run of `ingest.yml` on main, unless `dbt/` or `migrations/` differ between that run's commit
   and this one. Then (and when there is no snapshot) the deploy rebuilds the mart on Neon as
   before, dumps it once and builds from that dump.
4. **One scheduled ingest a day.** The 18:00 UTC run is removed. A bill backlog is drained by a
   dispatch with a larger `bill_request_budget`.

## Consequences

- An ingest run reads about 78 MB plus its own small reads, instead of 119 MB. A content edit or
  frontend change deploys without reading Neon at all. Thirty daily ingests come to about 2.5 GB.
- A deploy that is not part of an ingest shows data as fresh as the last ingest, which is what it
  showed before: it never ingested.
- A branch that changes models still gets a mart built from its own models (the policy_area
  failure of 2026-09-13 stays fixed), at the cost of one dump.
- The snapshot holds only mart, seed and meta, so anything the API reads from another schema
  must be added to the script, or the build fails at the first request that needs it.
- The archive workflow builds from the newest snapshot too; its database dump to a release still
  reads Neon directly, once per Congress.
