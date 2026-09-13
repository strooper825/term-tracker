# 0007. A member can cosponsor the same bill twice; cosponsorship is keyed on the member, not the date

Date: 2026-09-13
Status: Accepted

## Context

docs/PLAN.md section 4 gives `bill_sponsorship` the natural key
`(bioguide_id, congress, bill_type, bill_number, role)`, which assumes a member cosponsors a
given bill at most once. Building the bill pages surfaced a counter-example. Congress.gov
returns two entries for the same member on one bill (verified 2026-09-13):

| Bill | Member | Cosponsored | Withdrawn |
|---|---|---|---|
| S. 1383 | Sen. Warnock, Raphael G. [D-GA] (`W000790`) | 2025-07-10 | 2025-07-14 |
| S. 1383 | Sen. Warnock, Raphael G. [D-GA] (`W000790`) | 2025-09-18 | 2026-02-25 |

He cosponsored, withdrew, cosponsored again, and withdrew again. That is one case among
39,346 cosponsorship rows across the 1,874 bills loaded, and no tracked member is involved
today, so nothing on the live site was wrong. The hazard is that the join in
`mart.bill_sponsorship` matched on `(bill, bioguide_id)` alone: had a tracked member done
this, they would have gained a second row and been counted twice in `bills_cosponsored`, with
no test to catch it.

## Decision

Cosponsorship is keyed on the member, not on the date. `mart.bill_cosponsor` and the cosponsor
join in `mart.bill_sponsorship` both take **one row per (bill, member): the most recent
stint**, by `sponsorship_date` descending. `mart.bill_cosponsor.cosponsorships` records how
many separate stints there were, so the repeat is visible as a number rather than lost; every
stint stays in `staging.stg_bill_cosponsors` and in `raw.bill_cosponsors`.

The bill page therefore lists a member once, showing the date they most recently joined and
whether that stint is withdrawn. `assert_bill_cosponsor_key_unique` and
`assert_bill_sponsorship_key_unique` enforce the grain in both tables.

## Consequences

- `cosponsor_count` on `mart.bill` is a count of members, which is what the page's "Cosponsors
  (N)" means and what Congress.gov shows.
- A member who is currently withdrawn but cosponsored earlier reads as withdrawn, which is
  their present position. The earlier stint is not shown in v1; the count of stints is there
  if a later phase wants to.
- If a member ever cosponsors and withdraws several times, only the latest stint reaches the
  mart tables. That is a deliberate simplification of a case that has happened once.
