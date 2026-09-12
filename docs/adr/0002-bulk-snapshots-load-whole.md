# 0002. Bulk snapshot sources are loaded whole into raw; tracked_members scopes the mart

Date: 2026-09-12
Status: Accepted

## Context

docs/PLAN.md section 3, principle 5, says member scope is driven by the `tracked_members`
seed. The congress-legislators source is three whole-file YAML snapshots; there is no way to
fetch only two members, and the committee and membership files are needed in full to resolve
assignments.

## Decision

Whole-file sources (congress-legislators now; Voteview and similar later) are upserted into
`raw` in full, keyed on their natural keys. The `tracked_members` seed is applied in dbt when
building `mart.member`, `mart.term`, and `mart.committee_membership`. Per-record API sources
(Congress.gov, OpenFEC) will iterate over `tracked_members` and only fetch in-scope records.

Rows that disappear upstream (a member who leaves office) are not deleted from `raw`; the mart
filters on current terms and tracked scope.

## Consequences

`raw.legislator` holds all current members (about 540 rows) while `mart.member` holds two.
Expanding to all members in Phase 4 is a seed change, as the plan intends.
