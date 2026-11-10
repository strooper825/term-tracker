# 0021. The site describes one Congress; a finished Congress becomes a frozen archive

Date: 2026-11-09
Status: Accepted

## Context

The plan covers the 119th Congress and says nothing about what happens when it ends on
2027-01-03. The Congress was one number in `api/config.py`, the same number and two dates in
`dbt/dbt_project.yml`, and an assumption in most mart models.

Setting that number to 120 on a copy of the database (2026-11-09) showed that a change of number
is not a change of Congress:

- `mart.bill`, `roll_call`, `member_vote` and `bill_sponsorship` had no Congress filter. The
  "120th" kept all 4,592 bills of the 119th, a page for each, and counted them as its own.
- Only 7 of 20 tracked members kept a term. congress-legislators lists a House member's new term
  once the swearing-in is recorded, so for some days after January 3 the others have none.
- With the filter in place the new Congress starts empty. `/api/v1/congress/overview` answered
  500 on a null fetch time, and the static export refused to build a bill route with no pages.

Two ways to keep the 119th were considered: make the mart, the API and every page take a
Congress and serve both from live data, or freeze the finished Congress as it stood. The first
touches every model and route to keep serving data that no longer changes.

## Decision

The mart, the API and the site describe exactly one Congress, `vars.current_congress`.

- `raw` keeps every Congress ever loaded. The nine bill and vote staging views keep only the
  tracked one, so everything downstream is scoped without each model repeating the filter.
- The Congress's dates are derived from its number (`macros/congress_dates.sql`). The number
  still lives in `api/config.py` (what the ingest fetches) and `dbt_project.yml` (what the mart
  keeps); `tests/test_rollover.py` fails if they differ.
- `assert_tracked_members_seated` fails the build while any tracked member has no term in the
  tracked Congress. A failed build does not deploy, so the live site stays on the last good
  build until congress-legislators has the new terms and the roster matches who was seated.
- An empty Congress builds and renders: the overview falls back to the members' fetch time, and
  the bill route generates one placeholder page while there are no bills.

A finished Congress is archived, not served live: `archive.yml`, which calls `deploy.yml` with
`archive_congress` builds the site once more with a banner on every page, deploys it to a
separate Vercel project, and attaches a dump of the database to a release. It stops unless the
mart still describes that Congress. The live site links to archives through the `ARCHIVES`
repository variable. The steps and their order are in `docs/rollover-runbook.md`.

## Consequences

- Moving to a new Congress is a short, rehearsed pull request plus seed updates, not a refactor.
- The archive is a photograph. A bill signed after the archive date shows as pending there for
  good, and a source that was refusing the reader (ADR 0020) is frozen out of date; the workflow
  warns about the second. Rebuilding an archive later needs the dump restored somewhere, because
  the live mart has moved on and the committee and leadership files have been overwritten.
- The archive keeps its bill and member addresses but on another host, so links into the live
  site to a 119th bill stop resolving after the switch.
- `raw` grows by a Congress every two years (80 MB for the 119th on 2026-10-22, of 512 MB).
  Pruning an archived Congress from `raw` is possible once its dump exists; it is not automated.
- The test suite builds its mart with the fixtures' Congress passed explicitly, so it does not
  depend on which Congress is current.
