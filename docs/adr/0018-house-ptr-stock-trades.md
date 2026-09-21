# 0018. Stock trades: House PTRs from the Clerk's own files, no Senate, no OCR

Date: 2026-09-20
Status: Accepted

## Context

docs/PLAN.md lists panel 8, "Stock trades", with the sources "House Clerk PTRs, Senate eFD" and
calls it the hardest source. Building it turned up four things the plan did not anticipate.

- **The House Clerk publishes two files that are enough.** `financial-pdfs/{year}FD.zip` is a
  tab-separated index of every filing (name, state-district, filing type, date, DocID, no
  bioguide id), and `ptr-pdfs/{year}/{DocID}.pdf` is the report. Filing type `P` is a Periodic
  Transaction Report. Neither needs a key, a login or a browser. The Clerk has no `robots.txt`.
- **Only some PTRs are text.** Electronic filings (DocIDs starting `2`) have a text layer and a
  table whose columns sit at fixed positions. Paper filings (`8` and `9`) are photographs of the
  form: a CCITT image per page, no text at all, transactions in a checkbox grid, some pages
  rotated, some rows reading "Please see the attached". Across every 2025 and 2026 PTR (910 of
  them, all House filers) 798 have text and 112 (12.3 percent) are scans.
- **Of the ten tracked House members only one has filed a PTR since 2025-01-03: Ro Khanna, with
  20, and all 20 are scans (590 pages).** Steil, Kiley, Jeffries, Crawford, Pocan, Massie,
  Ocasio-Cortez, M. Johnson and Perry filed annual reports and extensions but no PTR. So the
  text-PDF reader built here has no tracked member's electronic filing to read today.
- **The Senate cannot be collected.** The Senate's eFD system (efdsearch.senate.gov) actively
  blocks automated access: Akamai edge blocking, HTTP 403 on datacenter and CI addresses. Every
  free workaround found in the research needed either a residential proxy or a full browser
  automation dependency. Both are a different risk and maintenance profile from anything else in
  this stack (plain HTTP to public files from a GitHub Actions runner). The research write-up is
  not in this repository; this ADR records its conclusion as the owner reported it. The brief
  for this change scoped the Senate out.

capitol-api (github.com/crnicholson/capitol-api) does the House half of this in Node with
`pdf-parse`, and its README says it "can miss trades or provide incorrect information".

## Decision

1. **House only, from the Clerk's files, read by this project's own Python** (`ingest/house_ptr.py`,
   `ingest/sources/house_ptr.py`, source name `house_ptr`, registered just before `statements` so a
   failure cannot hold up the vote, bill, FEC or Census loads). Both index years of the tracked Congress are
   read whole. A `P` row belongs to a tracked member when the state, the district and the
   normalised last name all equal those of the member's current House term; a row that shares
   state and last name but not the district is logged as a near miss and not matched. Each
   matched PDF is fetched once (a DocID's file does not change) at one request a second with the
   project's honest user agent; `--full-refresh` reads them again. A nightly is therefore two
   requests plus one per new filing.
2. **Nothing is copied from capitol-api.** It has no license: GitHub reports `license: null`,
   there is no LICENSE file, and the README is silent. Code without a license is all rights
   reserved, so no parsing logic or pattern was taken from it, verbatim or translated. The URL
   shapes and the PDF layout are facts about a public source and are used freely; the reader is
   written from the PDFs themselves. It also confirms the limit found here: `pdf-parse` reads the
   text layer only, so capitol-api returns nothing for a scanned filing.
3. **The reader keeps every cell as printed** and dbt reads dates, amounts, codes and tickers out
   of the strings (plan principle 2). Columns are found from the table header, a transaction
   starts on the line that holds both a type code and a date, wrapped asset names and amounts
   (including across a page break) are joined, and the smaller-font detail lines under a row
   (filing status, sub-holding, description, location, comments) are kept with it. The PDF's own
   name and state-district are checked against the index row.
4. **Codes are mapped by seeds and never dropped.** `seed.ptr_transaction_types` (`P` purchase,
   `S` sale, `S (partial)` partial sale, `E` exchange), `seed.ptr_owner_codes` (a blank cell is
   `SELF`; `SP` spouse, `DC` dependent child, `JT` joint) and `seed.ptr_asset_types` (the Clerk's
   48 asset-type codes, copied 2026-09-20). A code no seed maps keeps its row, labelled by the
   raw code, with `has_unmapped_code` set; the ingest logs the tally of every code seen and the
   count of unmapped ones, and the dbt warning test `assert_stock_trade_codes_mapped` names them.
   Amounts are a band (`$1,001 - $15,000`), a top band (`Over $50,000,000`, or `Spouse/DC Over
   $1,000,000`, 10 rows), or, for 15 rows of 10,936, a single figure the filer chose to enter
   (`$823.45`); `amount_kind` says which and the panel shows the amount as printed.
5. **How reading can fail, and what each outcome does.**
   - **`parsed`**: a text layer and a table that reads back as whole rows. A row missing an asset
     code, a notification date or an amount fails the *whole filing* (`failed`), not the row: a
     trade with a missing cell is worse than no trade, and a partial list would look complete.
   - **`scanned`**: no text layer. Stored with its page count, shown on the site as "Scanned paper
     form" with a link to the PDF, counted in the tab's summary, and never retried (the file does
     not change).
   - **`failed`**: text but no whole table, or the PDF header disagrees with the index. Stored with
     the reason, shown as "Could not be read" with the reason and a link, retried every night so
     a parser fix reaches it, and named by the dbt warning `assert_ptr_filings_parsed`. It never
     fails the run. On the 910-filing sweep the first version failed 104 (11.4 percent):
     rows that continued across a page break, exact amounts, and the Spouse/DC band. All three are
     fixed, and the sweep now reads 798 parsed, 112 scanned, 0 failed.
   - **A PDF that cannot be fetched** (transport failure, 404) is skipped tonight, stored as
     nothing, and retried tomorrow; the run fails only if every fetch failed. A changed index
     header or row shape raises `SourceShapeError` and stops the run (plan section 11).
6. **No OCR.** Reading Khanna's filings means OCR of rotated fax images plus checkbox-column
   detection, with a native `tesseract` binary in CI and Docker. That is the same kind of
   dependency the Senate was excluded for, and the accuracy this project holds itself to ("to
   the cent") could not be checked without reading 590 pages of scanned tables by eye. The tab says plainly
   that a filing is scanned, counts it, and links it.
7. **Senate: a distinct state, not a blank.** `mart.member_stock_trades.status` is
   `senate_unavailable` for a senator; the tab says the data is not available for the Senate,
   that this is a gap in the site and not evidence of no trades, and links the Senate's own
   search. It is not the dashed "Coming in a future release" panel (nothing is scheduled) and
   not the "No reports on file" message (the record is not empty), the way "No roll call vote"
   is kept apart from "Pending".
8. **The mart** is `mart.stock_trade` (one row per trade), `mart.stock_trade_filing` (one row
   per report, whatever reading it gave) and `mart.member_stock_trades` (one row per tracked
   member: status, filing and trade counts, and the value totals). The value totals add the ends
   of each disclosed band, so `*_low` and `*_high` bracket the true total, and
   `*_high_is_open` says a top-band trade has no upper end. The site computes none of it.
9. **Use of the data.** 5 U.S.C. § 13107(c) makes it unlawful to obtain or use a financial
   disclosure report for an unlawful purpose, for a commercial purpose other than news and
   communications media, to set a credit rating, or in soliciting money for a political,
   charitable or other purpose. This site is a free, non-commercial, informational page with no
   advertising or solicitation, and every trade links to the report it came from.

## Consequences

- Today the Stock trades tab shows one member with reports (Khanna, 20 scanned filings and no
  listed trades), nine House members with "No reports on file", and ten senators with "Not
  available for the Senate". That is what the source gives; it is not a defect.
- The reader has been checked against 5 filings by eye and against all 798 electronic filings
  by an independent row count (adjacent trade-date and notification-date pairs, counted with a
  different PDF library): 10,936 rows on each side, no filing differing. No **tracked** member's
  electronic filing exists to check, so the first one that appears is unverified until someone
  compares it with the PDF; every trade links to its page for that.
- The index has no link between an amended PTR and the report it amends; an amendment arrives as
  another `P` filing, so a trade could appear twice. None of the 20 tracked filings is a
  candidate, so this is untested and unhandled.
- A trade dated after its filing, or notified before it was made, is a typo in the filing that the
  Clerk publishes as is: 46 of the 10,936 rows in the sweep, one filing printing a notification
  date of 03/28/1935. Each is shown as printed and named by `assert_stock_trade_dates_sane`.
- The ticker is the last parenthetical of the asset name when it looks like one; a CUSIP stays in
  the name, and an asset with no parenthetical (`... NYSEARCA: DIA [OT]`) has no ticker.
- Getting Khanna's trades needs one of: OCR (a native dependency and row-by-row checking), a keyed
  aggregator that transcribes paper filings (Quiver Quantitative and Financial Modeling Prep were
  not tested), or hand transcription of the 20 filings into a seed. Getting the Senate needs a
  decision on the proxy or browser-automation profile. Both are recorded in docs/PLAN.md, section 12.
- `pdfplumber` (MIT, pure Python over pdfminer.six) is a new dependency. PyMuPDF was used only for
  a one-off cross-check and is not one: it is AGPL.
