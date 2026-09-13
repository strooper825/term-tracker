# ADR 0005: Party unity scores Independents against the party they caucus with

Date: 2026-09-13. Status: accepted.

## Context

Plan section 4 defines `party_unity_pct` as the share of a member's Yea/Nay votes that match
the majority of "the member's party". Phase 1c implemented that literally, taking the party
letter from the vote record (House `voteParty`, Senate `party`). Adding Bernie Sanders and
Kevin Kiley to `tracked_members` exposed the degenerate case:

- The Senate has two Independents (Sanders and King). Both carry `I` on senate.gov vote
  records, so "the majority of party I" is the majority of two people: when they agree the
  majority is their shared position, when they split there is no majority and the vote is
  excluded. Sanders' score under the literal definition is 100 percent on every roll call,
  by construction, and says nothing.
- Kiley's House vote records carry `R` until 2026-03-08 and `I` from 2026-03-09
  (congress-legislators records the change in `party_affiliations`, with
  `caucus: Republican`). As the only `I` in the House his "party majority" after March is his
  own vote, so the score is again 100 percent by construction.

Published party-unity studies (CQ Vote Studies, Brookings Vital Statistics) score Independents
with the party they caucus with, which is also how the members' own chambers seat them.

## Decision

`mart.member_vote_stats` computes a **scoring party** per voter: the party letter on the vote
record, except that a member whose congress-legislators term overlapping the current Congress
carries `caucus` is scored with, and counted in the majority of, that caucus (`Democrat` to
`D`, `Republican` to `R`). This applies to every voter, tracked or not, because
`raw.legislator` holds all sitting members, so King is counted in the Democratic majority
alongside Sanders. Majorities are computed only for `R` and `D`; a member scored under any
other letter (an Independent with no recorded caucus) gets `NULL` for both unity figures
rather than a degenerate 100 percent. The scoring party is exposed as
`member_vote_stats.scoring_party`, in the API as `votes.scoring_party`, and the site's stat
note reads "votes with Democratic caucus" (or Republican) when it differs from the member's
own party.

A mid-term party change is scored against the caucus for the whole term: Kiley's votes before
March 2026 already carried `R`, so nothing changes for him; for a member who switched caucus
the whole term would follow the latest one, which is a known simplification recorded here.

## Consequences

- `party_unity_pct` and `party_unity_cq_pct` for Republicans and Democrats are unchanged
  except that caucusing Independents now count toward the D/R majorities (three votes in a
  chamber of 100 or 435 rarely move a majority).
- Sanders and Kiley get meaningful figures comparable to published ones; the dashboard labels
  the basis so the number is not mistaken for agreement with "Independents".
- The data dictionary paragraph "party is taken from the vote record itself" is superseded by
  this ADR.
