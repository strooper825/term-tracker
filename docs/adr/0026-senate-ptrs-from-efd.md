# 0026. Senate stock trades from eFD, agreeing to its terms each run

Date: 2026-11-16
Status: Accepted

## Context

ADR 0018 built the Stock trades tab for the House and left the Senate as a stated gap: the
Senate's disclosure system, eFD (`efdsearch.senate.gov`), refused automated access when it was
researched in September 2026 (Akamai, HTTP 403 on datacenter and CI addresses), and every free
workaround needed a residential proxy or browser automation.

On 2026-11-16 that changed. Two probes ran from GitHub-hosted runners with this project's own
User-Agent, on throwaway branches since deleted:

- run 43905001944: one GET of the eFD home page, HTTP 200;
- run 43914683575: the whole path, every step HTTP 200. That is the statement page, agreeing to
  it, the search page, and one search for periodic transaction reports submitted since
  2025-01-03. The search found 308 reports by every filer.

A sample read from this PC the same day found:

- **Electronic reports are HTML tables.** Columns: #, transaction date, owner, ticker, asset
  name, asset type, type, amount, comment. Each report states its own count ("(7 transactions
  total)"), which the reader can check itself against.
- **Paper reports are page images.** In the 308, all 30 paper reports were one senator's
  (Blumenthal, not tracked).
- **Amendments do not say which report they amend,** and a senator can file two reports for
  the same day. An amendment restates one original in full. Boozman's amendment of his
  12/08/2025 report shares 13 of its 14 rows with one of that day's two reports and none with
  the other. His amendment of 05/14/2025 shares 8 of 9 with one and none with the other.
- **Search rows carry a name and an office but no member id.** Former senators and candidates
  file too; "(Former Senator)" marks them.

Before searching, eFD shows a statement the visitor must agree to. Under 5 U.S.C. 13107 the
reports may not be used for an unlawful purpose, a commercial purpose (other than news), credit
ratings, or soliciting money. This site is a non-commercial public-information site.

## Decision

**Collect Senate periodic transaction reports from eFD, nightly, as the `senate_ptr` source.**
It runs after `house_ptr`. Raw tables `raw.senate_ptr_report` and `raw.senate_ptr_transaction`
come from migration 0013.

**The collector agrees to eFD's statement on every run.** The owner decided this on
2026-11-16, for the reason above: this site's use is the use the law allows. The agreement is a
form post (`prohibition_agreement=1`) with the page's CSRF token. If the session lapses (eFD
sends the client back to the statement), the client agrees once more.

**One search, read whole.** The collector asks for report type 11 (periodic transaction
reports), submitted since the tracked Congress began, by every filer. It reads 100 rows a page,
about 4 requests a night. Rows are matched to tracked senators the way ADR 0018 matches the
House index: the office must be a sitting senator's and the last name must agree (before any
", Jr."). When two tracked senators share a last name, a first, middle or nickname must agree
too, and a row still matching two is logged and skipped.

**Reading a report.**

- A report page is fetched once. A filed eFD report cannot be edited, only amended.
- A `failed` report is retried every night.
- A report is `failed` when its table does not read back as the count it states, or when its
  heading does not name the senator the search row matched. It then stores no rows.
- A paper report is `paper`: listed and linked, not read. The mart shows it as `scanned`, like
  a House paper form.

**Amendments replace the report they restate.** `ingest.senate_efd.amended_report` picks the
same filer's earlier report for the same date that shares the most rows with the amendment. It
must share at least half the amendment's rows, and strictly more than any other candidate.

- The match goes in `supersedes`, and `supersedes_note` says how it was decided.
- The replaced report stays listed in `mart.stock_trade_filing` with `superseded_by`. Its
  trades are not in `mart.stock_trade`; the amendment's are.
- An amendment that cannot be matched keeps both reports' trades. The warning test
  `assert_senate_amendments_resolved` names it.
- An amendment whose original predates the tracked Congress stands alone.
- On the first full run (84 reports of tracked senators), all 8 amendments matched: six shared
  every row but one, and two were two-row amendments sharing one row with their original and
  none with any other.

**One trade list for both chambers.** In staging, the Senate's spelled-out owners and types
become the House codes for the same legal categories: Joint→`JT`, Child→`DC`,
Sale (Partial)→`S (partial)`. One set of seeds then labels both chambers. Asset types stay as
eFD prints them ("Stock", "Corporate Bond") and are labelled by a new seed, `efd_asset_types`.
The coupon, maturity or strike that eFD prints under a bond or an option becomes the
description. eFD has no notification date, so that column is null for the Senate.

**`senate_unavailable` now means "never read."** A senator is `senate_unavailable` only while
eFD has never been read successfully. After that, a senator is `no_filings` or `filed`, like a
House member, and `checked_at` is the last successful `senate_ptr` run.

**A refusal does not stop the night.** A 403 at any step raises `SourceUnavailable`
(ADR 0020): the run is `unavailable`, and the rows already held stay on the site.

## Consequences

- The tab shows Senate trades. On the first run, 5 of the 16 tracked senators had reports:
  Boozman 345 trades, Fetterman 51, McConnell 10, Collins 4, Schiff 1. The other 11 read
  "no reports on file". Every tracked senator's report was electronic.
- The block may come back, as senate.gov's did for roll calls from 2026-10-23. The data then
  stops at the last successful run, and the freshness check reports the source as unavailable.
- A first word of an eFD first name has to agree when two tracked senators share a last name.
  The Senate has such pairs (the two Scotts), so this matters once more senators are tracked.
- The tab's wording is chamber-aware (Clerk index or eFD search). A replaced report is marked
  "Replaced by amendment", and an amendment carries its number.
- Annual financial disclosures (a later step) can reuse the same client and agreement: eFD
  files them as report type 7.
