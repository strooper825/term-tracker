# 0009. Bill vote journey: completed records only, not a bill status

Date: 2026-09-14
Status: Accepted

## Context

ADR 0003 deferred `bill.status`. Congress.gov publishes no status field, and the middle stages
("Passed House", "Passed Senate") are only recognisable from action codes and free text that
differ between source systems. The bill page now wants a vote journey: Introduced, House vote,
Senate vote, To President, Became Law. Each stage must show only what a completed record shows.

Verified 2026-09-14 against every roll call and action loaded for the 119th Congress
(1,721 bills, 153 amendments):

- **Passage roll calls are recognisable from the question text.** The House uses "On Passage",
  "On Agreeing to the Resolution[, as Amended]" and "On Motion to Suspend the Rules and
  Pass|Agree[, as Amended]". The Senate uses "On Passage of the Bill", "On the Joint Resolution",
  "On the Resolution" and "On the Concurrent Resolution", each followed by the document.
- **Results come in eight strings**, each plainly passed or failed.
- **The late stages have Library of Congress action codes:**
  - `E20000` Presented to President (filed under action type `Floor`)
  - `E30000` Signed, Vetoed, or Sent to Archivist unsigned
  - `E40000` Became Public Law (filed under action type `President`; the `BecameLaw` type
    appears once)
- **Many enacted bills cleared a chamber without a roll call.** Of the 68 bills that became law,
  32 have no Senate passage roll call and 9 no House one: they passed by voice vote or unanimous
  consent, which leaves no tally.

## Decision

1. **`mart.bill_passage_vote`**: one row per passage roll call on a bill.
   - Contents: the published result, `passed`, the tally, the Yea/Nay split by the party letter
     on each vote record, and party shares of Yea plus Nay.
   - `is_latest_in_chamber` picks the roll call the journey reads.
   - A result string outside the eight fails the build.
2. **`mart.bill_journey_stage`**: one row per stage per bill (kind `bill`).
   - A stage is `passed` or `failed` only from its latest passage roll call. `complete` comes
     only from the codes above. `vetoed` comes from E30000 "Vetoed by President." with no law.
   - A chamber stage without a roll call is `no_roll_call` when a later stage is on record
     (the page says only that no roll call exists), and `pending` otherwise.
   - A failed vote or veto with nothing recorded after it ends the journey. Later stages are not
     shown, so they don't look still possible.
3. **Stage order follows the bill's chamber of origin**, not a fixed House-then-Senate order.
   S. and S.J.Res. bills show Senate vote before House vote, so a Senate failure ends the row
   where it happened.
4. **Stage applicability follows bill type.**
   - H.Res. and S.Res. have one chamber stage.
   - Concurrent resolutions have both chamber stages and no President stages.
   - Bills and joint resolutions have all five.
   - Joint resolutions proposing constitutional amendments, which never go to the President, are
     not singled out. Their President stages read Pending.
5. **No status, label, or prediction is derived.** Nothing sums the stages into a current stage.
   The page reads labels, dates, tallies and bar widths from the mart.

## Consequences

- ADR 0003 stands. `bill.status` is still absent, and the journey is no substitute: a bill with
  no roll call and no late-stage action reads Introduced, then Pending, whatever the committee
  record says.
- A failed suspension vote reads Failed, and the journey ends there if nothing follows. The House
  can bring the bill back under a rule, and a later passage roll call replaces the failed one as
  the latest.
- A new question or result spelling in a later Congress is caught by the result test, or shows
  as Pending until the macro is updated. It is never guessed.
