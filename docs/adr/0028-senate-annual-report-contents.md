# 0028. Reading Senate annual reports: holdings, liabilities, a reported net-worth range

Date: 2026-11-16
Status: Accepted

## Context

ADR 0027 lists and links each member's annual financial disclosures. The owner asked for what is
inside them, starting with the Senate, whose eFD reports are web pages rather than PDFs.

All 35 annual reports and amendments that the 16 tracked senators filed for 2024 and 2025 were
read from this PC on 2026-11-16.

- **Every report is one page in the same parts:** 1 Honoraria, 2 Earned and Non-Investment
  Income, 3 Assets, 4a/4b Transactions, 5 Gifts, 6 Travel, 7 Liabilities, 8 Positions,
  9 Agreements, 10 Compensation, and Attachments & Comments.
  - A part the filer answered "No" to has no table.
  - Every part that does have a table had the same headings on all 35 reports, and every row had
    as many cells as its headings.
- **Part 3 (Assets):**
  - Lines are numbered "1", "2", and a holding inside line 1 is "1.1". Line 1 is then an account
    or plan whose value is "--"; its holdings carry the values.
  - Values seen: the standard bands, "None (or less than $1,001)", "--" (127 lines) and
    "Unascertainable" (8 lines).
  - A cell can hold nested notes: the filer's comment under a name, a subtype under a type.
- **Part 7 (Liabilities):** mostly mortgages, all in bands. Four reports have none.
- **Amendments restate the report in full.** Boozman's Amendment 2 for 2025 changes his asset
  range from $2,205,102–$5,777,000 to $2,156,102–$5,692,000.

## Decision

**Open each electronic Senate annual report once, and keep every part.**

- `senate_annual` (ADR 0027) now also opens each annual, amendment, new filer or termination
  report it has not read. A filed eFD report is never edited, only amended by a new one.
- Every part's table goes to `raw.annual_report_row`, one row per table row, with each cell's
  text and notes. The report's header and per-part summary go to `raw.annual_report_page`
  (migration 0015).
- Income, positions, gifts and travel are stored now, so using them later needs no re-fetch.
- Parts 3 and 7 carry the figures, so their headings must be exactly the ones seen. A report
  without a Part 3, with a row whose cell count differs from its headings, or whose heading names
  someone other than the matched senator, is `failed`: it stores no rows and is tried again each
  night.
- A paper report is stored as `paper` and not opened.

**The latest version of a year's report stands for that year** (`annual_report_version`): the
highest amendment number, then the latest filed, among reports that read.

**Every figure is a range** (`annual_net_worth`):

- Assets add the ends of each line's band. "None (or less than $1,001)" counts 0 to 1,000.
- An account line counts nothing; its holdings do.
- "Unascertainable" lines count nothing and are counted separately.
- A top band ("Over $50,000,000") has no upper end, so the asset high end, and with it the
  net-worth high end, is unknown.
- Liabilities work the same way.
- Net worth runs from assets low minus liabilities high, to assets high minus liabilities low.

**On the tab:**

- The tab is renamed **Financial disclosures**. Its anchor stays `#stock-trades`, so existing
  links keep working.
- The annual section shows, from the newest read report:
  - reported net worth, assets and liabilities;
  - the report it comes from, linked;
  - a note that these are ranges of what was reported, not a full net worth: some things need
    not be reported, such as a home that earns no income, and spouse and dependent children's
    holdings are included;
  - holdings, largest first, ten at a time, each naming the account it sits in;
  - liabilities.
- The report list follows. For the House, nothing changes until its reports are read.

## Consequences

- **The first local read** opened all 35 reports with no failures: 41 requests and 2.3 MB. A
  normal night then opens only newly filed reports.
- **Reported net-worth ranges for 2025** run from about -$4.9M–-$5,000 (Murphy: two mortgages
  larger than his reported assets) to about $26.7M–$131.4M (Ron Johnson).
- **Spot check:** Sanders, Murphy and Boozman (Amendment 2) were added up a second time from the
  saved pages with independent code, and matched the mart exactly.
- **The figures depend on what members must report.** A member's home that earns no income is
  not reported, and a mortgage on it may or may not be. The tab says so instead of calling the
  range a net worth.
- **The House is stage 2b:** the same three tables, filled from the Clerk's electronic PDFs
  (about 93% of 2024 and 2025 annual reports), with paper filers left as links.
