# 0010. The Speaker of the House is exempt from `assert_positions_cover_roll_calls`

Date: 2026-09-16
Status: Accepted

## Context

`assert_positions_cover_roll_calls` (and the "Attendance" section of docs/data-dictionary.md)
rests on a stated assumption: "both sources list every seated member on every roll call, Not
Voting included, so a member with fewer positions than roll calls... means a member list was
lost or overwritten." That has held for every tracked member so far, including two chamber
leaders (Cotton, Jeffries) who hold no exemption from ordinary voting.

Adding Mike Johnson (`J000299`, Speaker of the House since 2023-10-25, House Rep. Louisiana 4th)
broke it on the first `dbt build` after loading his votes: 516 positions against 669 House roll
calls this Congress, all 516 of them an actual Yea/Nay/Other, zero `Not Voting`. Checking which
roll calls he appears on (`raw.house_vote_members`) shows he is simply absent from the member
list itself for the roll calls he skips, not present with a `Not Voting` record like every other
member.

This is House Rule I, clause 7: the Speaker "shall not be required to vote in ordinary
legislative proceedings, except when such vote would be decisive," and by custom the Clerk does
not call the Speaker's name on a roll call unless the Speaker asks to be called (traditionally
added at the end of the roll). Congress.gov's `/house-vote/.../members` endpoint reflects the
Clerk's own roll, so the Speaker's name is absent from it on the roll calls he does not join,
rather than present with a recorded absence. This is a real, documented feature of how the House
polls its presiding officer, not a data gap: outside reporting on the current Speaker found the
same pattern (voted on 67 percent of roll calls in a sampled 2024 stretch; Johnson is at 516 of
669, 77 percent, this Congress through 2026-09-16).

No other tracked member is affected: this is specific to whoever currently holds the Speakership,
because only the Speaker is excused from being called.

## Decision

1. **`mart.member_vote` and `mart.member_vote_stats` are not changed.** No `Not Voting` row is
   invented for a roll call the Clerk never called the Speaker on; that would be data this
   pipeline did not observe. `positions`, `votes_cast`, and `attendance_pct` for the Speaker are
   computed, as for anyone else, from whatever `raw.house_vote_members` actually contains.
2. **`assert_positions_cover_roll_calls` exempts the current Speaker of the House.** The test
   joins `mart.leadership_role` and drops a (bioguide, congress, chamber) row from the `expected`
   side when the member holds `title = 'Speaker of the House'` with `is_current`, so a shortfall
   there no longer fails the build. Every other tracked member, including past or future
   Speakers outside their Speakership, still gets the full invariant.
3. **The Speaker's `attendance_pct` is not comparable to other members' and must be labelled as
   such wherever the site shows it.** Because `positions` already excludes the roll calls he was
   not called on, `votes_cast / positions` reads as 100.00 percent for Johnson (516 of 516) even
   though he did not participate in the other 153 of 669 roll calls this Congress. A future
   frontend change should caveat this (e.g. "votes when called, by House custom") rather than
   show a bare percentage next to every other member's true attendance figure; this ADR does not
   implement that caveat, since it is a display decision outside this ingest/schema PR.

## Consequences

- `assert_positions_cover_roll_calls` now has a named, narrow exception instead of a blanket
  tolerance, so a genuine lost-member-list regression for anyone else, Speaker included outside
  their Speakership, still fails the build.
- If the Speakership changes hands mid-Congress, the new Speaker's `is_current` row makes them
  the exempted member from that point; the outgoing Speaker's earlier, non-Speaker terms are
  unaffected. A Speaker who changes seats mid-Congress (unlikely, unprecedented) is not specially
  handled beyond this.
- The mart still has no column marking "the Speaker's record is partial by design"; a consumer
  reading `member_vote_stats` directly (not through a caveated frontend) can misread his 100
  percent figure. Recording that explicitly is left open rather than added speculatively here.
