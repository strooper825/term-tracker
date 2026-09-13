# 0004. member_vote.position adds "Other" and keeps the upstream value in position_raw

Date: 2026-09-12
Status: Accepted

## Context

docs/PLAN.md section 4 gives `member_vote.position` the values Yea, Nay, Present, Not Voting.
The sources use a wider vocabulary (verified 2026-09-12): House recorded votes say `Aye` and
`No`; the House Speaker election records the candidate the member voted for (`Johnson (LA)`,
`Jeffries`, `Emmer`); Senate impeachment trials say `Guilty` and `Not Guilty`.

## Decision

`position` is normalised by the dbt macro `normalize_position`: `Yea`/`Aye` become `Yea`,
`Nay`/`No` become `Nay`, `Present` and `Not Voting` stay, and everything else becomes
`Other`. The original string is kept in `position_raw`. `voted` is true for anything except
`Not Voting`, so a Speaker-election vote or a Guilty/Not Guilty vote counts as attendance,
which matches how GovTrack counts missed votes.

## Consequences

Consumers that assume four values must handle `Other`. Party-unity statistics (Phase 1d)
should ignore `Other` and `Present` when computing the party majority.
