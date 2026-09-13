# 0003. bill.status is deferred: Congress.gov exposes no status field

Date: 2026-09-12
Status: Accepted

## Context

docs/PLAN.md section 4 lists `status` among the `bill` columns. The Congress.gov API v3 bill
and amendment detail records carry `latestAction` and the full `actions` list, but no status
or stage field; the stage shown on Congress.gov pages (Introduced, Passed House, Became Law
and so on) is derived by the website from action codes.

## Decision

Phase 1b stores `latest_action_date` and `latest_action_text` on `mart.bill` and every action
in `mart.bill_action`, and does not invent a status. A derived stage column can be added in
Phase 1d alongside the timeline work, once the action-code mapping is written down and tested
against the stages Congress.gov shows.

## Consequences

Panels that need a stage must wait for that mapping. Nothing is lost: all actions are stored,
so the column can be computed retroactively.

## Update 2026-09-12 (Phase 1d)

Re-assessed with the 119th Congress data loaded. The `actions[].type` values Congress.gov
emits (`IntroReferral`, `Committee`, `Calendars`, `Floor`, `ResolvingDifferences`,
`President`, `BecameLaw`, `Veto`, `Discharge`) identify the late stages reliably, but the
stages the dashboard needs most, Passed House and Passed Senate, are only recognisable from
action codes and free text that differ between the House Clerk, the Senate, and the Library
of Congress feeds, and Congress.gov publishes no reference mapping and no stage field to
validate a derivation against. A derived stage therefore cannot be checked for
correctness on a whole-Congress basis. Still deferred; the recorded roll calls in
`mart.roll_call` give a partial check for passage votes when this is revisited.
