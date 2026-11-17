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
- [0018. Stock trades: House PTRs from the Clerk's own files, no Senate, no OCR](0018-house-ptr-stock-trades.md)
- [0017. The deployment ships pages, not prefetch payloads](0017-strip-prefetch-payloads.md)
- [0019. Branch runs put the managed database back at main's schema](0019-branch-runs-restore-main-schema.md)
- [0020. A source that refuses the nightly reader does not stop the nightly](0020-refused-source-does-not-stop-the-nightly.md)
- [0021. The site describes one Congress; a finished Congress becomes a frozen archive](0021-one-congress-at-a-time-and-a-frozen-archive.md)
- [0022. A homepage for several sections, a map of every seat, and words the owner edits](0022-homepage-sections-and-owner-content.md)
- [0023. Groundwork for all 535 members: ingest the whole Congress incrementally, set limits first, stop hand-maintaining per-member data](0023-groundwork-for-all-535-members.md)
- [0024. Elections is a set of what-if maps the owner feeds by hand](0024-elections-what-if-maps.md)
- [0025. A browse page for every bill, filtered in the browser](0025-a-browse-page-for-every-bill.md)
- [0026. Senate stock trades from eFD, agreeing to its terms each run](0026-senate-ptrs-from-efd.md)
- [0027. Annual financial disclosures, listed and linked](0027-annual-disclosures-listed.md)
- [0028. Reading Senate annual reports: holdings, liabilities, a reported net-worth range](0028-senate-annual-report-contents.md)
- [0029. Reading House annual reports: Schedules A and D from the Clerk's PDFs](0029-house-annual-report-contents.md)
- [0030. The rest of a Senate annual report: income, positions, agreements, gifts and travel](0030-senate-annual-income-positions-agreements.md)
- [0031. The rest of a House annual report: Schedules C and E to H from the Clerk's PDFs](0031-house-annual-income-positions-agreements.md)
- [0032. Trades in industries a member's committees oversee](0032-trades-in-industries-a-members-committees-oversee.md)

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
