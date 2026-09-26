# Architecture decision records

Any deviation from [docs/PLAN.md](../PLAN.md) gets a short ADR here, written before the code
that implements it (plan, section 11). Decisions that the plan leaves open (section 12) are
also recorded here once made.

## Index

- [0001. Constituency natural key](0001-constituency-key.md)
- [0002. Bulk snapshot sources are loaded whole into raw](0002-bulk-snapshots-load-whole.md)
- [0003. bill.status is deferred](0003-bill-status-deferred.md)
- [0004. member_vote.position adds Other, keeps position_raw](0004-vote-position-vocabulary.md)
- [0005. Party unity scores Independents against the party they caucus with](0005-party-unity-scoring-party.md)
- [0006. Fundraising v1: principal campaign committee, current cycle, no industry categories](0006-fec-principal-committee-scope.md)
- [0007. A member can cosponsor the same bill twice](0007-repeat-cosponsorship.md)
- [0009. Bill vote journey: completed records only, not a bill status](0009-bill-vote-journey.md)
- [0010. The Speaker of the House is exempt from assert_positions_cover_roll_calls](0010-speaker-vote-coverage.md)
- [0011. A cosponsor row waits for the bill's own cosponsors list, not the member's list alone](0011-cosponsorship-date-lag.md)
- [0012. Chamber composition is a hand-maintained seed, cross-checked against congress-legislators](0012-chamber-composition-seed.md)
- [0013. Congress overview: what the tracked-member figures count](0013-congress-overview-definitions.md)
- [0014. The Senate's control threshold counts the Vice President's tiebreak](0014-senate-control-threshold.md)
- [0015. Public statements: official press feeds from a hand-verified seed, link-out for everyone else](0015-public-statements-feeds.md)
- [0016. Constituency tab: Census boundary maps and ACS estimates, keyed by the Congress they describe](0016-constituency-tab-census-sources.md)
- [0017. The deployment ships pages, not prefetch payloads](0017-strip-prefetch-payloads.md)
- [0019. Branch runs put the managed database back at main's schema](0019-branch-runs-restore-main-schema.md)

## Format

File name: `NNNN-short-title.md`, numbered in order. Keep each under a page.

```markdown
# NNNN. Title

Date: YYYY-MM-DD
Status: Proposed | Accepted | Superseded by NNNN

## Context
What the plan says, and what was found that makes it not fit.

## Decision
What is being done instead.

## Consequences
What becomes easier or harder; what has to change elsewhere.
```
