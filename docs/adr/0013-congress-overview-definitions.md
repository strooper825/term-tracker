# 0013. Congress overview: what the tracked-member figures count

Date: 2026-09-19
Status: Accepted

## Context

The overview page's activity section is scoped to the tracked members ("Everything below counts
only the 20 members this site tracks"). Building it against the loaded data (2026-09-19)
turned up four places where the mockup asks for something the mart does not record.

1. **Roll-call passage is rarely recorded for what tracked members sponsor.** Of the 702 bills
   the tracked members sponsored, `mart.bill_journey_stage` has 5 House passage roll calls, 0
   Senate ones, and 3 bills enacted; the 3 enacted bills cleared the Senate with no roll call
   (ADR 0009: voice vote or unanimous consent leaves no tally). The rule "both chamber stages
   show Passed" therefore returns no rows.
2. **The journey misses most passages.** A chamber stage is `passed` only from a roll call, and
   `no_roll_call` only when a later stage is on record. A simple resolution agreed to by unanimous
   consent, or a bill passed by voice vote, has neither, so it reads `pending`. Counting the
   journey alone gave 6 bills that passed a chamber; the Library of Congress actions give 45.
   Those actions are consistent enough to use: the wording "Passed/agreed to in House" arrives
   under one code (`8000`) and "... in Senate" under one (`17000`), always typed Floor, from the
   Library of Congress feed. Checked 2026-09-19 against the whole mart: all 445 passage roll calls
   that read `passed` carry the matching action (445 of 445), and a further 304 chamber passages
   carry it with no roll call. This is the whole-Congress validation ADR 0003 said a derived stage
   lacked.
3. **No bill list page exists.** The mockup's "All 412 introduced" and "Show all 13" links have
   no route to go to; only `/bills/{congress}/{type}/{number}` exists.
4. **"Still in committee" is not a recorded status** (ADR 0003). 694 of the 702 bills have no
   vote stage, but 90 of those have a Calendars, Floor or Discharge action and are visibly out
   of committee.

Also found: tracked members number 10 House and 10 Senate, not the mockup's 12 and 8. The page
reads the count from the mart.

## Decision

- **Scope.** A bill counts when a tracked member is its sponsor (`mart.bill.sponsor_is_tracked`,
  kind `bill`). Amendments are excluded, cosponsorship does not count, and bills that entered
  the mart only because a roll call named them are excluded.
- **Bills introduced** is that count, split by `origin_chamber`. The measure-type bar splits it
  into House bills (`hr`), Senate bills (`s`), joint resolutions (`hjres`, `sjres`) and other
  (`hres`, `sres`, `hconres`, `sconres`). **Resolutions** is joint plus other, so the two
  figures cannot disagree.
- **A chamber passed a bill** when its journey stage is `passed` (a passage roll call) or the bill
  carries action code `8000` (House) or `17000` (Senate). No `no_roll_call` inference is made.
- **Passed a chamber** counts distinct bills where either chamber passed. It is split by chamber
  of origin, matching Bills introduced, so the two halves sum to the total rather than double
  counting a bill that cleared both.
- **Passed both chambers** takes bills of a two-chamber type (not `hres`, `sres`) that both
  chambers passed. Where a chamber has no roll call the table says "No roll call recorded"; it
  does not say voice vote or unanimous consent, which the mart does not record. Outcome:
  **Law** (with the public law number parsed from the `Became Public Law No:` action),
  **Vetoed** (a veto action and no law), **Overridden** (a veto action and a law), **Adopted**
  (a concurrent resolution, which never goes to the President), or **Not enacted yet** (passed
  both, no law or veto on record).
- **Vetoed** counts vetoed bills, split overridden and not overridden. The mockup says
  "sustained"; the mart cannot tell a failed override from one not yet attempted.
- **Roll call votes** counts votes cast by tracked members (`mart.member_vote.voted`), split by
  chamber. A chamber-wide roll-call count would put all 535 members' votes under the scope
  divider.
- **Committee actions** counts `committee_action` rows in `mart.member_feed`.
- **Still in committee** is a bill with no vote stage other than Introduced and no Calendars,
  Floor, Discharge, President, Resolving Differences or Veto action. The card states the
  definition. It is a derivation from action types, not a Congress.gov status, so it is
  labelled with what it checks and ADR 0003 stands.
- **No bill list route is built.** "Show all" expands the table in place, from rows embedded at
  build time; the "All N introduced" link is left out. A bill list is its own piece of work.

## Consequences

- With today's data the page shows 45 bills passing a chamber, 6 passing both (3 laws and 3
  adopted concurrent resolutions), 0 vetoes, and a 0.4% law rate. It reads thin because tracked
  members' bills mostly do not move; that is the data, not a defect.
- `mart.bill_journey_stage` is unchanged and still reads `pending` for those chamber-only
  passages. The bill page's journey therefore shows fewer passages than this page counts; the
  journey is a record of roll calls (ADR 0009), and reconciling the two is left to its own PR.
- The override path (a veto followed by a law) has no instance among tracked-member bills yet,
  so it is covered by a dbt test on a constructed case, not by live data.
- A status field from Congress.gov would replace items 2 and 4.

## Update 2026-09-19 (scope of the passed-both table, metrics cut)

Reviewing the merged page: the table listed six measures and left out H.R. 1, the reconciliation
act (Public Law 119-21), and the budget resolution H.Con.Res. 14, because both were sponsored
by a member who is not tracked. Restricting the table to tracked sponsors answered a question a
reader was not asking. Changes:

- **The passed-both table reads every bill in `mart.bill`**, whoever sponsored it, and moves above
  the scope-change divider. It says what it covers: the tracked members' bills plus any bill a
  recorded roll call named, not every bill in Congress (about 19,000; PLAN.md section 12). A bill
  that passed by voice vote and that no tracked member and no roll call touched is still missing.
  On 2026-09-19 this gives 84 measures: 69 law, 6 adopted, 2 vetoed, 7 not yet law.
- **`mart.congress_tracked_bill` became `mart.congress_bill_outcome`** with a `sponsor_is_tracked`
  column. The four stat cards below the divider filter to it; the table does not.
- **Removed** the measure-type bar, Roll call votes, Committee actions, Resolutions, and Still in
  committee. The page is for a general reader first, and those five were the ones that needed a
  paragraph to explain. Their marts and columns (`congress_overview_type`, `measure_type`,
  `still_in_committee`, the vote and committee counts) are gone rather than left unused. The
  definitions above for them no longer apply. Orphaned tables from the earlier build
  (`mart.congress_tracked_bill`, `mart.congress_overview_type`) are not dropped by `dbt build`.
- **"Passed a chamber" reads "22 House bills · 23 Senate bills"**, not "House-origin".
- **Control is stated in words** ("Republicans control the House"), with the seat counts behind it
  and a marker at the majority line, replacing the bare "R +5". `mart.chamber_majority.majority_pct`
  places the marker.
