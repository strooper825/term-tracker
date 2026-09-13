# 0006. Fundraising v1: principal campaign committee, current cycle, no industry categories

Date: 2026-09-13
Status: Accepted

## Context

docs/PLAN.md describes Phase 2 as "OpenFEC committee lookup via `fec_ids`, cycle totals,
small-donor %, contribution aggregates by industry" with tables `fec_committee`,
`fec_summary`, `fec_contribution_agg`, and panel 7 listing "PAC vs individual share, top
industries". Three things about the source do not fit that description as written, all
verified against the live API on 2026-09-13:

1. **A member has several FEC candidate ids and several committees.** congress-legislators
   `id.fec` lists every candidate id a member ever registered: Cotton has `H2AR04083` (House,
   2012-2014) beside `S4AR00103` (Senate); Sanders and Slotkin likewise carry old House ids.
   Each current-office candidate is in turn linked to more than one committee in the cycle:
   Cotton to a joint fundraising committee (`C00571018 COTTON VICTORY`, designation `J`),
   Kiley to a leadership PAC (`C00818328 PAC FOR NEW LEADERSHIP`, designation `D`). Summing
   "the member's committees" would double count transfers and mix money the member does not
   control with money they do.
2. **Industry categories need a classification source** the plan leaves open (section 12:
   OpenSecrets bulk data or a self-built employer/occupation mapping). Nothing in OpenFEC
   classifies contributors.
3. The plan lists "current cycle" nowhere explicitly, but the header and every Phase 1 panel
   are scoped to the 119th Congress, and the FEC's own candidate pages default to the two-year
   period for House candidates.

## Decision

Phase 2 v1 shows the **principal campaign committee only**, for the **current cycle only**
(2025-2026, derived from `current_congress`: cycle = 1788 + 2 x 119 = 2026), with **no
contributor industry categories**. Concretely:

- **Current-office candidate:** of the member's `id.fec` ids, the one whose OpenFEC
  `office` letter matches the chamber of the member's latest term (`H` for the House, `S`
  for the Senate). The letter is also the first character of the id. Two matches stop the
  ingest with a `SourceShapeError` rather than picking one; none means the member has no
  FEC record for the office and the panel says so.
- **Principal campaign committee:** among the committees `/candidate/{id}/committees/`
  lists for the cycle, the one with `designation = 'P'`. Two stop the run; none is reported
  as "no committee". Other designations (`A`, `J`, `D`, ...) are stored in
  `raw.fec_committee` and `mart.fec_committee` for reference but never summed.
- **Totals** come from `/committee/{id}/totals/?cycle=` for that one committee. The FEC's
  candidate-level totals (`/candidate/{id}/totals/`) equal these for all six tracked
  members because none has a second authorized committee; the committee endpoint is used
  because it is the one whose grain matches the decision above.
- `fec_contribution_agg` and the "top industries" line of panel 7 are deferred until the
  classification source is chosen (still open in plan section 12).

## Consequences

- Money raised through a joint fundraising committee reaches the panel only when it is
  transferred to the principal committee, where the FEC reports it as "transfers from other
  authorized committees". The panel shows that line separately so it is not mistaken for
  direct contributions (Steil: 40 percent of receipts in this cycle).
- Leadership PAC activity is invisible in v1. A later phase can add it as its own line
  from the rows already in `raw.fec_committee`.
- Senators mid-term (Sanders, Slotkin, election 2030) show the 2025-2026 two-year totals,
  not the six-year election-period totals the FEC candidate page shows by default. The
  panel labels the cycle and links to the two-year view of the committee page.
- Small-donor share is defined as unitemized individual contributions ($200 or less in
  aggregate per donor) over total receipts, the OpenSecrets convention; the share of
  individual contributions only is also a mart column for anyone who prefers that basis.
