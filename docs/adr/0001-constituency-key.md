# 0001. Constituency natural key: district is NULL for a state, 0 for an at-large district

Date: 2026-09-12
Status: Accepted

## Context

docs/PLAN.md section 4 describes `constituency` two ways that conflict: the natural key column
says "`district` (0 for at-large / Senate)" while the notes say "Senate seats reference state
with district = NULL". Using 0 for both would make an at-large House district (e.g. Alaska,
which congress-legislators records as `district: 0`) collide with the state itself.

## Decision

`district` is `NULL` for a state-level constituency (what a Senate seat points at) and `0` for
an at-large House district, matching the upstream source. The key `(fips_state, district)` is
enforced with a dbt singular test that treats NULLs as equal.

## Consequences

A state and its at-large district are distinct rows with the same `fips_state`. Anything that
joins a Senate term to `constituency` must join on `fips_state` with `district IS NULL`.
