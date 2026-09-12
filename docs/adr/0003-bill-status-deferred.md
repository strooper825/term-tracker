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
