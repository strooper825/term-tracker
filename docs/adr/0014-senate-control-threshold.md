# 0014. The Senate's majority line counts the Vice President's tiebreak

Date: 2026-09-19
Status: Accepted

## Context

ADR 0012 sets `majority_threshold` to chamber seats / 2 + 1, and the overview page draws the
majority line at that count: 218 in the House, 51 in the Senate. That is right for the House. It
misstates who controls the Senate: the Vice President votes only to break a tie (Article I,
Section 3), so a party holding 50 seats and the vice presidency wins every 50-50 vote. The Vice
President is a Republican, so the Republican conference needs 50 senators to control the chamber
and the Democratic caucus needs 51.

No table holds the Vice President's party: `raw.legislator` lists members of Congress, and the
Vice President is not one.

## Decision

1. **`senate_vp_party`** is a dbt var (`republican` or `democratic`), hand-maintained beside the
   composition provenance vars in `dbt_project.yml` and changed with the seed when the office
   changes hands.
2. **`mart.chamber_majority.majority_threshold` is the count to control the chamber.** It is chamber
   seats / 2 + 1 everywhere except the Senate row when the Vice President's party is the party
   ahead, where it is chamber seats / 2 (50). `majority_pct`, the position of the line on the bar,
   follows it (50 %).
3. **`tiebreak_letter`** is the Vice President's party letter on the Senate row and null on the
   House row. The page prints it beside the seat count ("100 seats · R Vice President breaks
   ties") so the line at 50 is explained where it is read.

## Consequences

- The Vice President's party goes stale silently, like the composition seed. It changes at most
  every four years, and the var sits next to `composition_as_of` where an editor updates both.
- When the party ahead is not the Vice President's party, the Senate row falls back to 51. The
  page does not show the smaller count the trailing party would need with a tiebreak it lacks.
- The line describes control of the chamber (organising it, the majority leader's office), not every
  vote: cloture still takes 60 votes, and the Vice President votes only on a tie.
- `majority_threshold` changes meaning for the Senate only, from 51 to 50. Nothing else reads it.
