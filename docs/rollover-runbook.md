# Moving to a new Congress

How to archive the Congress that is ending and put the live site on the next one. Written for
the 119th to 120th change in January 2027 (ADR 0021); the same steps apply every two years.

Rehearsed on 2026-11-09 against a copy of the local database: the mart for the 120th builds
empty and passes its tests, the API answers every endpoint, and the site builds. Not rehearsed:
anything that runs only in GitHub Actions (the archive deploy, the database dump) and anything
that needs data that does not exist yet (120th terms, 120th district files).

## Before the old Congress ends

1. **Create the archive's Vercel project** (for example `term-tracker-119`) in the same team as
   the live one, with no Git connection, and add its id as the repository secret
   `VERCEL_ARCHIVE_PROJECT_ID`. Its production address is where the archive will live for good.
2. **Decide the roster for the new Congress.** A tracked member who was not re-elected or
   retired must come out of `dbt/seeds/tracked_members.csv` in step 6, or the build is held
   (step 7). New members need a row in `dbt/seeds/statement_sources.csv`.
3. **Check the nightly is healthy**, and whether any source is still marked unavailable
   (ADR 0020). An archive taken while senate.gov is refusing the runner freezes Senate votes at
   the last date they were read. If that is not acceptable, the Senate votes have to be loaded
   from somewhere senate.gov serves before step 4.

## Archive day (January 3 to 5)

The old Congress ends at noon Eastern on January 3. congress-legislators replaces its committee
and leadership files with the new Congress's soon after, and the nightly overwrites those rows,
so the archive should be built from the last nightly that ran before that happened.

4. **Disable the schedule** of `ingest.yml` once that nightly has finished, so nothing changes
   under the archive.
5. **Dispatch `archive.yml` on `main`** with `archive_congress` = `119` and `archive_live_url` =
   the live site's address. It builds the site with the archive banner, deploys it to the
   archive project, and attaches `term-tracker-119.dump` to the release `archive-119`. It stops
   without deploying if the mart is not the 119th. Open the archive and check a senator, a
   representative, a bill and `/congress`. The live site is not touched.

## Switching the live site (planned for January 6)

6. **One pull request:**
   - `current_congress` to `120` in `api/config.py` and `dbt/dbt_project.yml` (a test fails if
     they differ). The dates and the FEC cycle follow from the number.
   - `dbt/seeds/tracked_members.csv` and `statement_sources.csv`: the roster from step 2.
   - `dbt/seeds/composition_seats.csv`, and `composition_as_of` in `dbt_project.yml`: the new
     party counts. Until this is edited `/congress` shows the old Congress's seats under the
     new Congress's name.
   - `senate_vp_party` in `dbt_project.yml` only if the Vice President changed.
   - `dbt/seeds/key_dates.csv`: the new Congress's convening and end, the next general election,
     and each tracked state's filing deadline and primary.
   - `ingest/census.py` and `api/config.py`: add the 120th to `GEOGRAPHY_CONGRESS` and move
     `census_geography_year` only when Census has published the `cd120` boundary file, and the
     same for ACS. Until then the Constituency tab says the data is not published, by design
     (ADR 0016).
7. **Merge, set the repository variable `ARCHIVES`** to `119=<archive address>`, re-enable the
   schedule and dispatch `ingest.yml`. The build fails on `assert_tracked_members_seated` for as
   long as any tracked member has no term in the new Congress, and a failed build does not
   deploy, so the live site keeps showing the last 119th build until it passes. If it names
   members who were sworn in, congress-legislators has not recorded them yet: wait for the next
   nightly. If it names someone who left Congress, the roster is wrong: fix the seed.
8. **Check the first 120th deploy:** the header says 120th, the footer links to the archive,
   members show zero or few votes, and `/bills/0/none/0` or real bill pages exist.

## Afterwards

- In `full` mode the first nightly of the new Congress re-reads every tracked member's bill
  lists, which is the long case for the Congress.gov rate limit. In `incremental` mode
  (ADR 0023) the watermark is kept per Congress, so the first night reads the new Congress's
  whole list, which is short, and there is no backlog.
- Deployment size starts again near zero and grows with the new Congress's bill pages.
- The old Congress's rows stay in `raw`. Remove them only after confirming the dump restores.
- Links from elsewhere to a 119th bill on the live site no longer resolve; the same path exists
  on the archive.
