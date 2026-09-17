# 0011. A cosponsor row waits for the bill's own cosponsors list, not the member's list alone

Date: 2026-09-17
Status: Accepted

## Context

The nightly ingest failed twice after the twenty-member expansion (PR #30) merged: 2026-09-16
23:50 UTC (a post-merge dispatch) and 2026-09-17 11:05 UTC (the scheduled run), both at the same
`dbt build` test, `not_null_bill_sponsorship_date`, with exactly one failing row each time. The
ingest step itself succeeded both times; only the mart build failed.

`mart.bill_sponsorship.date` for a cosponsor comes from the bill's own `/cosponsors` endpoint
(`stg_bill_cosponsors`, joined by bill and bioguide id), not from the member's personal
`cosponsored-legislation` list (`stg_member_legislation`), because the member's list dates are
known not to be usable (see the source comment: the list's `introducedDate` is actually the
cosponsorship date, but even that is dropped in favor of the bill's own list, which is also what
`ADR 0007`'s "most recent stint" logic reads). `ingest/sources/congress_gov.py` re-fetches a
bill's cosponsors list only when the bill's own `updateDate` has changed, was never stored, or
on `--full-refresh` -- not on every run. A member's personal list and a bill's own cosponsors
list are two different Congress.gov endpoints updated by two different parts of its backend, and
nothing guarantees they change in the same instant: a cosponsorship can appear on the member's
list before the bill's `updateDate` ticks and its cosponsors list is re-fetched. When that
happens, `stg_member_legislation` has a `(bioguide_id, congress, bill_type, bill_number,
cosponsor)` row with nothing to join to in `stg_bill_cosponsors` yet, and the previous version of
`mart.bill_sponsorship` emitted that row anyway with a null `date`.

Re-running the exact same ingest locally about twelve hours after the second failure found zero
null dates: the gap had already closed, meaning the bill's `updateDate` had ticked and its
cosponsors list caught up in the meantime. This confirms the mechanism is a transient,
self-healing lag between two Congress.gov endpoints, not a defect in either fetch or a permanent
data loss -- but the two-timezone reproduction means I did not capture the specific row before it
resolved. The direction of the fix does not depend on which bill it was.

This is the same class of gap the plan already tolerates elsewhere: docs/data-dictionary.md's
count-matching tolerance for `mart.bill_sponsorship` exists precisely because "Congress.gov
updates continuously and the nightly job snapshots once a day, so bills introduced or cosponsored
since the last run are missing until the next one." A cosponsorship recorded on the member's list
but not yet on the bill's is the same situation, one endpoint further along.

## Decision

`mart.bill_sponsorship` drops a cosponsor-role row when the bill's own cosponsors list has no
matching entry for that member yet, instead of emitting the row with a null `date`. The member's
personal list is still what puts the bill in scope for detail/actions/summaries fetching (a
cosponsorship a tracked member reports is enough reason to have fetched the bill), but it is not,
on its own, enough to say the member cosponsored it in `mart.bill_sponsorship` -- that still
requires the bill's own list to agree. The row reappears automatically once the bill's
`updateDate` ticks and its cosponsors list is re-fetched, the same night or a later one; no data
is invented and no backfill is needed.

Sponsor-role rows are unaffected: `ingest/sources/congress_gov.py` fetches a bill's detail record
unconditionally every run (no `updateDate` gate), so a sponsor's `introduced_date` does not have
the same structural race. Nothing in this ingest run showed a null sponsor date, and none is
expected; if one appears, it is a different, unexplained shape and should be reported rather than
folded into this fix.

## Consequences

- A member briefly undercounts `bills_cosponsored` by one on the night a cosponsorship is this
  fresh, self-correcting the next night (or later the same night, if the bill's dependent lists
  are refetched later in the same run) -- the same tolerance already documented for the count
  check, applied one day earlier than it would have surfaced there anyway.
- `not_null_bill_sponsorship_date` keeps meaning what it says: every row that exists has a real
  date. It no longer needs a special-case exemption or a relaxed severity.
- If the bill's own cosponsors list genuinely never includes a member Congress.gov's personal
  list says cosponsored (not just delayed, but permanently absent), that member's cosponsorship
  is silently absent from `mart.bill_sponsorship` rather than flagged. That is consistent with
  treating the bill's own list as the authority (ADR 0007), not a new risk introduced here.
