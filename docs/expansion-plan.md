# Expansion plan: 20 members to 535 by the 120th Congress

2026-11-13. The design and its evidence are in
[ADR 0023](adr/0023-groundwork-for-all-535-members.md). The rollover itself stays as written in
[rollover-runbook.md](rollover-runbook.md).

**Decided 2026-11-13:** build the incremental ingest, grow to about 100 members on the free
tiers, then stop and measure. The 535 step and anything paid are not decided; the real upload
and database sizes at about 100 decide whether lighter pages can carry 535 for free.

**Status:** step 0's Vercel retention was set by the owner on 2026-11-13 (the Neon allowance
is still to be confirmed). Step 1 is built (the nightly reports what `fromDateTime` says changed beside what
the full re-read found; each deploy reports its upload size and bytes per part of the site).
Step 2 is built and switched off: the incremental loader, its queue and watermark, and the
mart's explicit scope rule are in, and the nightly keeps using the `full` loader until the
repository variable `BILL_INGEST_MODE` is set to `incremental`. Set it after five nightlies whose
"Bill change filter" section reports every changed record. Not built yet: the nightly member-list
spot check. Steps 3 to 7 are not started.

## Order of work

| # | What | Why in this place | Size |
|---|---|---|---|
| 0 | Settings, no code: Vercel retention to 1 week production and the shortest period for the rest; confirm the Neon allowance in the console | Free, and needed before any growth | minutes |
| 1 | Measurement lines: the nightly logs how many bills `fromDateTime` reports beside how many the full re-read found changed; the deploy summary gains the upload size and bytes per part of the site | Five nights of evidence before the ingest relies on the filter | small PR |
| 2 | Incremental whole-Congress ingest: cursor, queue, enumerate and drain, weekly re-sweep, the in-scope staging model | Everything else is cheap once this lands; it is the only large piece | large PR |
| 3 | Drain the 119th backlog (about 80,000 requests over several nights) | The only full-volume rehearsal available: the 120th starts empty and will not stress anything for months | no code |
| 4 | FEC in batches, per-source freshness thresholds | Independent of 2; small | small PR |
| 5 | Statements: default link mode and the monthly press-page probe | Independent; needed before any batch | medium PR |
| 6 | `election_dates` seed: 2026 for all 50 states, 2028 projected | Independent; mostly research, reusable by Elections | medium PR |
| 7 | Batch 1 | After 2 to 6 | seed change |
| 8 | Rollover (runbook), then batch 2 | | runbook |

Steps 4, 5 and 6 do not depend on step 2 and can be reviewed in parallel with it.

## Batches

| Batch | When | Gate before it | Measure after it |
|---|---|---|---|
| 20 (now) | | | Baseline recorded in ADR 0023 |
| About 100 | By mid-December, so two weeks of nightlies precede the archive | Steps 2 to 6 merged; 119th backlog drained; re-sweep count zero; five clean incremental nights | Ingest minutes and requests; queue depth after the run; Neon MB (raw, mart); deployment MB unpacked and tgz; pages; build minutes; Vercel retained storage; members on the official-website fallback |
| 535 | Not decided. Earliest with the 120th, once `assert_tracked_members_seated` passes for every member | The owner's decision after batch 1's figures: lighter pages or a paid Vercel tier; `track_all_members` rehearsed on a database copy | The same list, weekly through March, then monthly: the deployment and the database both grow with the 120th's bills |

Stop and reassess if, after batch 1, the tgz is over 80 MB, Neon is over 80 percent of its
allowance, or the re-sweep keeps finding bills the filter missed.

## What each step costs

| Step | Vercel | Neon | GitHub Actions |
|---|---|---|---|
| Today, 20 members | Hobby, free | Free | Free (public repo) |
| About 100 | Hobby, free, with the shorter retention | Free; near the limit if the allowance is 0.5 GB | Free |
| 535 | Pro, $20 a month, forced by the 100 MB upload cap | Launch, about $2 to $3 a month, some time in 2027 | Free |

## Decisions needed from the owner

1. **Whole-Congress ingest.** Decided 2026-11-13: yes. The ingest reads every bill of the
   Congress and the roster only scopes the mart.
2. **Rehearse on the 119th.** Spend about 16 hours of requests over a few nights loading the
   rest of a Congress that is archived in seven weeks? Recommended: yes, it is the only
   full-volume test before 535.
3. **Who is batch 1.** Recommended: the whole Senate, a complete chamber of exactly 100. It
   needs all 50 states' dates (step 6) first. The alternative is full delegations of chosen states.
4. **Batch 1 before or after the rollover.** Before puts about 100 members into the frozen
   119th archive; after keeps the archive at twenty and gives up the full-volume page test.
   Recommended: before.
5. **Vercel at 535.** Deferred by the owner until batch 1 is measured: pay for Pro ($20 a
   month), or lighter bill and member pages to try to stay on Hobby.
6. **Neon.** Confirm whether the project's Free allowance is 0.5 GB or 1 GB, and whether moving
   to Launch (about $2 to $3 a month) when it is crossed is acceptable.
7. **Congress.gov rate.** Stay at the documented 5,000 an hour (recommended), or ask
   api.data.gov whether the 20,000 the key reports is real, for the one-off backlog?
8. **Statements default.** The monthly automated press-page probe (recommended), or link every
   unchecked member to the official website only and fetch nothing?
9. **Key dates.** Fill 2026 for all 50 states as history and 2028 as "expected" (recommended),
   or 2028 only? And is showing a projected date, labelled as such, acceptable?
10. **Fundraising gap.** From January 3 to mid-April 2027 the 2028 cycle has no reports. Show
    the final 2026-cycle totals labelled as the previous cycle, or "no report yet"?
