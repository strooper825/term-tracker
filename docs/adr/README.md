# Architecture decision records

Any deviation from [docs/PLAN.md](../PLAN.md) gets a short ADR here, written before the code
that implements it (plan, section 11). Decisions that the plan leaves open (section 12) are
also recorded here once made.

## Index

- [0001. Constituency natural key](0001-constituency-key.md)
- [0002. Bulk snapshot sources are loaded whole into raw](0002-bulk-snapshots-load-whole.md)
- [0003. bill.status is deferred](0003-bill-status-deferred.md)

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
