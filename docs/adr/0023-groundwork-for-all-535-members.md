# 0023. Groundwork for all 535 members: ingest the whole Congress incrementally, set limits first, stop hand-maintaining per-member data

Date: 2026-11-13
Status: Accepted in part, 2026-11-13. The owner chose to build the incremental ingest, grow to
about 100 members on the free tiers and stop there to measure. Nothing that costs money (Vercel
Pro, Neon Launch) and no step to 535 is decided; `track_all_members` waits with them. Longer
than a page because it covers three steps.

## Context

PLAN.md Phase 4 calls growth to 535 members "a seed change plus a runtime check", and section 12
lists the incremental bill ingest and a batching plan as open items. Everything below was
measured on 2026-11-13, from the last scheduled nightlies' logs and a few dozen live API calls.

**The nightly today (20 members).** Whole run 96 to 156 minutes on 11-11 to 11-13 (75 to 90 in
mid-October). The bills source is nearly all of it, and it has two costs, not one:

| Part of the bills source | 11-12 | 11-13 | What bounds it |
|---|---|---|---|
| Member sponsored/cosponsored lists (about 280 pages) | 69 min | 24 min | Congress.gov itself: a page at any offset takes 5 to 16 s (median), up to 60 s |
| Detail of all 4,826 bills, plus lists of the 46 to 91 that changed | 50 min | 61 min | 0.3 to 0.4 s a request; the 5,000-an-hour limiter slept 13 min on 11-13 |

The plan's "40 of 58 minutes" predates the twenty-member expansion. Neon is at 161.0 MB (raw
81.1, mart 68.7). The deployment is 247.3 MB unpacked (4,863 pages; the upload is a 31.5 MB
tgz); 495 MB was the figure before ADR 0017. The site build takes 2 to 4 minutes. The repository
is public, so Actions minutes are no longer a limit.

**What Congress.gov supports** (verified live):

- `/bill/{congress}?fromDateTime=` and `/amendment/{congress}?fromDateTime=` filter on
  `updateDate`, to the second; the format must be `YYYY-MM-DDTHH:MM:SSZ` (anything else is a
  400). `toDateTime` works. `sort` is ignored. A list page at offset 19,750 answers in 0.1 s.
- The 119th holds 19,964 bills and 7,281 amendments. Changed bills: 221 so far today, 435 since
  11-12 00:00Z, 1,096 in seven days (a bill counts once, at its latest update, so long windows
  undercount). A bill item's `updateDate` is a date in the list and a timestamp in the detail.
- Adding a cosponsor moves `updateDate`: H.R. 8041 gained one dated 11-11 and its `updateDate`
  is 11-12T09:06Z. The detail also carries `actions.count`, `cosponsors.count` and
  `countIncludingWithdrawnCosponsors`.
- **The member lists ignore `fromDateTime`** (same 627 items with and without) and mix every
  Congress the member served in: Sanders's cosponsored list is 7,957 items, 32 pages at about
  11 s each. Twenty members cost 24 to 69 minutes a night; about 100 would cost 2 to 6 hours and
  535 would cost 10 to 30. They cannot be the nightly discovery mechanism past about 25 members.
- The key's `X-RateLimit-Limit` header says 20,000 an hour; the documentation says 5,000.

**OpenFEC:** `/candidates/`, `/committees/` and `/totals/house-senate/` accept many ids in one
request and return the same totals fields the per-committee endpoint does. `/election-dates/`
and `/reporting-dates/` hold nothing for 2027 or 2028 yet.

## Decision

### 1. The ingest reads the whole Congress and asks only what changed

**Scope.** The bills source ingests every bill and amendment of the current Congress into `raw`.
`seed.tracked_members` stops deciding what is fetched; it decides what the mart keeps. A new
staging model keeps a bill when a tracked member sponsored or cosponsored it (read from the
bill's own sponsor and cosponsors list, as ADR 0011 already requires for cosponsor rows) or a
roll call names it. `raw.member_legislation` stops being a nightly input.

**State.** Two tables in `meta`:

- `ingest_cursor (source, congress, kind, changed_through)`: the watermark, one row for bills
  and one for amendments. It lives in the database, next to the rows it describes, so a restore
  or a branch run cannot leave the two disagreeing.
- `bill_refresh_queue (congress, bill_type, bill_number, reason, enqueued_at, attempts)`: bills
  known to need reading. `reason` is `changed`, `new`, `resweep` or `backfill`.

**A night, in two phases.**

1. *Enumerate.* Note the start time. Page both lists with `fromDateTime` = watermark minus six
   hours (no watermark: the whole list). Put every item in the queue. In one transaction with
   that, set the watermark to the noted start time.
2. *Drain.* Take queue rows, `changed` and `new` first, oldest first. Fetch the detail; fetch
   actions, cosponsors and summaries when the stored `updateDate` differs or a list was never
   stored (today's rule, unchanged). Upsert, delete the queue row, commit, per bill. Stop when
   the queue is empty or the run's request budget is spent (default 9,000, under two hours).

**Failure and retry.** If enumerating fails, the watermark has not moved and the next run asks
the same window again; upserts make the repeat harmless. If draining stops part-way (crash,
timeout, cancelled run, budget), every finished bill is already committed and the rest are still
queued. Nothing depends on a run finishing, which the current one-transaction load does (a run
killed at minute 110 keeps nothing). A bill that fails three times stays queued, is named in the
run summary and does not block the others; a changed shape still stops the run (plan section
11). Freshness for this source becomes: enumerated within 26 hours, and no `changed` row older
than 72 hours.

**Full re-sweep.** Weekly, page both lists with no filter (about 110 requests, under a minute),
compare every item's `updateDate` and existence with what `raw` holds, and enqueue each
mismatch as `resweep`. The count should be zero; it is reported every week, and a non-zero count
is the evidence that `fromDateTime` missed something. Each night a few members' lists (five,
rotating) are read and compared with the mart as a warn-only check that discovery through bills
agrees with Congress.gov's own member view. `--full-refresh` remains for a deliberate re-read,
and is run once before an archive.

**Backlog for new tracked members.** There is none to fetch: the Congress is already in `raw`,
so a new seed row changes only the mart, and the member's pages appear on the next build. The
one backlog is the first run on a Congress already under way. For the 119th that is about
22,400 bills and amendments not yet held, roughly 80,000 requests: 16 hours at 5,000 an hour,
drained as `backfill` over several nights or one dispatched run with a raised budget. The 120th
starts empty and has no backlog at all.

**Expected requests a night** (a sitting week; the changed-bill rate is the assumption to
confirm, see Consequences):

| Tracked members | Today's design | This design |
|---|---|---|
| 20 | 5,200 to 5,350 measured (87 to 124 min) | about 1,900 (12 to 15 min); 6,700 on a heavy day |
| about 100 | about 13,500, of which 1,400 slow list pages (4 to 8 hours) | the same 1,900 |
| 535 | about 35,000, of which 7,000 slow list pages (over a day) | the same 1,900 |

1,900 is 6 list pages, 450 changed bills at about 4 requests each and 30 amendments at 3. The
count no longer depends on how many members are tracked. The ingest stays at the documented
5,000 an hour; the 20,000 in the header is used only if api.data.gov confirms it.

**At 535 the seed is replaced by a rule**: a dbt var `track_all_members` makes every member
with a term in the current Congress tracked, so arrivals and departures need no edit.

### 2. Limits are measured and set before each batch

Projections, from today's per-bill and per-member sizes (about 7 KB raw and 8.5 KB mart per
bill, 0.7 MB mart per member; about 36 KB shipped per bill page and 1.2 MB per member page).
They are estimates until the first batch is measured.

| | 20 (measured) | about 100, 119th | 535, 120th at its start | 535, 120th at its end |
|---|---|---|---|---|
| Neon | 161 MB | 400 to 450 MB | about 150 MB plus the 119th's raw | 0.9 to 1.0 GB |
| Deployment, unpacked | 247 MB | 450 to 700 MB | about 0.7 GB | about 1.7 GB |
| Upload (tgz) | 31.5 MB | 60 to 90 MB | about 90 MB | about 215 MB |
| Site build | 2 to 4 min | 5 to 10 min | 3 to 6 min | 15 to 25 min |

- **Vercel retention, set now:** Production 1 week (from 2 weeks); Pre-production, Canceled and
  Errored at the shortest period the menu offers. Hobby keeps the last three production
  deployments whatever the policy, counts a deployment until the day it is deleted, deletes
  unprotected deployments at once above 10 GB and can refuse new ones. Eight nightly deploys at
  the 100-member size are about 4.6 GB; at two weeks they would be 8.6 GB.
- **Vercel Hobby holds to about 100 members and not to 535.** CLI uploads are capped at 100 MB
  on Hobby and 1 GB on Pro, and the tgz reaches about 90 MB at 535 members before the 120th has
  a single bill. Pro is $20 a month; storage beyond that is $0.10 per GB-month (about $1 at this
  size, inside Pro's included credit). The alternative is lighter pages, a separate decision.
- **Neon.** The Free allowance in the repo is 0.5 GB; Neon's pricing page now reads 1 GB a
  project. Either way 535 members outgrow it during 2027. Launch has no minimum: $0.35 per
  GB-month and $0.106 per compute-hour, about $2 to $3 a month here.
- **Tripwires added to the run summaries:** the upload size with a warning at 80 MB, bytes
  and pages per part of the site, queue depth, the weekly re-sweep count. Retained storage is
  read from Vercel's Usage page; the workflow does not call Vercel's API for it. `deploy.yml`'s
  timeout goes from 30 to 60 minutes before 535.

### 3. Per-member data that needs no hand

**FEC.** Read in batches: candidates by id list, principal committees by candidate list, totals
by committee list, 100 to a request. 535 members are about 20 requests instead of about 1,820,
so the limits stop mattering and the source stays nightly; identity records move to weekly.
ADR 0006's rules (one current-office candidate, one principal committee, else stop) are
unchanged, and the switch is made only after the batched answers equal the per-member ones for
all twenty. The panel already states "through {coverage end date}"; it gains the date last
checked and the next report's due date from a small seed of FEC reporting dates. Freshness
thresholds become per source.

**Public statements.** `seed.statement_sources` becomes a list of exceptions. A tracked member
with no row is `link` mode; the URL is the office's press page as found by a monthly automated
probe (a short list of known paths under the official site, robots.txt honoured, first one that
answers with a press listing), else the official website from congress-legislators. Nobody
checks these by hand, and the tab says "press page" or "official website" accordingly. Feeds
stay opt-in rows a person verified, exactly as ADR 0015 decided.

**Key dates.** A new seed, `election_dates`: one row per `cycle, state, office, event`
(`filing_deadline`, `primary`, `primary_runoff`, `general`, `general_runoff`) with `date`,
`basis` (`official`, `statutory`, `projected`), `rule`, `source_url`, `checked_on`.
`mart.key_date` unions it with the remaining hand rows of `key_dates`, and the Elections section
reads the seed directly. Today's seed covers 11 states (21 state rows), all for 2026. Sources,
in order: the FEC's per-cycle "Congressional Primary Dates and Candidate Filing Deadlines for
Ballot Access" (one document, every state), the state's election calendar or statute for the
rule, NCSL's primary table as a cross-check. 2026 is filled as `official` for all 50. 2028 is
filled as `projected` from each state's statutory rule and shown as "expected", because neither
the FEC nor most states have published 2028 calendars; rows flip to `official` as they do.

## Consequences

- The nightly falls from 90 to 155 minutes to an estimated 15 to 30, and its length stops
  depending on the roster. A long outage is caught up by the queue, not by a longer run.
- `raw` holds the whole Congress from the first run (about 190 MB of bill data by the end of
  one) whatever the roster. Bill search across all legislation gets its data as a by-product.
- The mart's bill scope moves from "what was fetched" to an explicit model, the largest dbt
  change here. Counts for today's twenty must not move when it lands; that is the acceptance test.
- The changed-bill rate was measured in a post-election week. Before the switch the nightly
  logs the enumerated count beside what the full re-read found changed, for at least five
  nights, and the switch waits for the two to agree.
- Correctness rests on `updateDate` moving when anything moves. The weekly re-sweep and the
  nightly member spot check are how a failure of that would be seen.
- At 535 every bill of the Congress has a page. That, not ingestion, is what needs a paid
  Vercel tier or lighter pages.
- A projected 2028 date can be wrong: New Hampshire has reportedly moved its state primary to
  June from 2028, and Louisiana's 2028 calendar lists a party primary in May, which also puts
  the existing 2026 Louisiana rows in doubt. `basis` keeps a projection from reading as fact.
- From January 3 to the first 2028-cycle reports (due April 15, 2027) no member has totals for
  the new cycle. What the panel shows in that gap is an open question.
