# 0020. A source that refuses the nightly reader does not stop the nightly

Date: 2026-11-09
Status: Accepted

## Context

The plan has every source failure fail the run, so that a broken ingest is never published as
if it were whole. That was written for failures the pipeline can fix: a changed shape, a bad
key, a bug.

From 2026-10-23, `www.senate.gov` answered the first request of the `senate_votes` source with
`403 Forbidden` on every scheduled run, and the four tracked senators' press feeds on
`*.senate.gov` began answering 403 the same night (the run of 2026-10-22 read all of them). The
same client, with the same `User-Agent`, was served normally from a home connection on
2026-11-09, so the refusal is of GitHub's hosted runners, not of the request. Nothing in the
repository changed on 2026-10-23.

Because one failed source failed the ingest step, nothing after it ran. For seventeen nights the
mart was not rebuilt and the site was not deployed, although House votes, bills, FEC, Census and
the House press feeds all loaded each night. The schedule was then disabled by hand.

There is no other primary source to switch to: the Congress.gov API publishes House roll calls
only (its changelog, read 2026-11-09, has no Senate vote endpoint).

## Decision

A source may say that its upstream refused it by raising `ingest.http.SourceUnavailable`, and a
refusal is not a failure of the run.

- `senate_votes` raises it on a 403 from senate.gov. A 302 or 404 still means "no such session",
  and every other status still fails as before. No other source raises it: a 403 from
  api.congress.gov or the FEC is a bad key, which is ours to fix.
- `ingest.run` logs the refusal, keeps the rows already held, and exits 0 if nothing else
  failed, so the build and the deploy go ahead.
- The run is still recorded in `meta.ingest_run` as `failed`, with the error text beginning
  `SourceUnavailable:`. That prefix, on the newest finished run of a source, is what marks the
  source unavailable. No new status value and no migration.
- `ingest.freshness` reports such a source as `unavailable` and does not fail on its age. It
  still fails for a source that has never been read. The names go to a step output, and the
  alert job keeps one issue labelled `source-unavailable` open until a run in which every source
  answers.
- `/api/v1/meta/freshness` carries `unavailable` per source. The footer dates a refused source
  separately from "Last updated", and a senator's vote list says which date it stops at and
  links to Senate.gov.

The pipeline does not disguise the client or move the request to another network to get past
the refusal. Getting Senate votes back means senate.gov serving the runner again, or the owner
choosing to run the ingest from somewhere it is served.

## Consequences

- The site is rebuilt nightly again, with Senate roll calls and the Senate press feeds frozen at
  2026-10-22 and labelled as such. Senate votes cast in the lame-duck session are missing until
  the source answers; a single run then fetches every roll call the menu lists that is not yet
  held, so nothing has to be backfilled by hand.
- A green run no longer means every source was read. The `source-unavailable` issue and the
  freshness table in the run summary are the signals.
- Bill pages that describe a Senate roll call held after 2026-10-22 show the action text from
  Congress.gov but no tally, the same as any roll call not yet loaded (ADR 0009).
- If the 119th Congress is archived (planned for January 2027) while the source is still
  refusing, the archive would freeze with Senate votes missing. The archive runbook has to check
  this first.
