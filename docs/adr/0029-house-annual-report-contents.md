# 0029. Reading House annual reports: Schedules A and D from the Clerk's PDFs

Date: 2026-11-16
Status: Accepted

## Context

ADR 0028 reads senators' annual reports into holdings, liabilities and a reported net-worth range.
The House files the same disclosure as PDFs on the Clerk's site
(`financial-pdfs/{year}/{DocID}.pdf`), listed by ADR 0027.

**What the PDFs are.** Of the House annual, amended and new-member reports for 2024 and 2025 (all
members), 746 originals have a text layer and 58 are scanned paper. The tracked members' 111
reports split 101 text, 10 scanned. The text ones use the layout of the Clerk's periodic
transaction reports (ADR 0018):

- Georgia text at fixed column positions, with a bold 9.4pt header row repeated on each page of a
  schedule.
- 9pt body lines, and 8.5pt detail lines under a row (Description, Location, Comments). The detail
  labels can print as unmapped glyphs.
- Each schedule opens with a bold 12pt heading whose only readable part is its letter: "S...
  A: A..." is Schedule A.

**How the rows look:**

- **Schedule A** (Assets and "Unearned" Income): Asset, Owner, Value of Asset, Income Type(s),
  Income, Tx. > $1,000?.
  - Each asset ends with a two-character type code (`[MF]`).
  - A holding in an account is printed "ACCOUNT ⇒ fund [MF]"; there is no separate account line.
  - A new member's report (type H) has two income columns, current year to filing and preceding
    year, instead of "Tx. > $1,000?".
- **Schedule D** (Liabilities): Owner, Creditor, Date Incurred, Type, Amount of Liability.
- **Wrapping:** asset names, value bands ("$50,001 -" then "$100,000"), incomes and income types
  wrap onto further lines. A row can run from the foot of one page onto the next, under the
  repeated header.
- **Values seen:** the standard bands, plus "$1 - $1,000", "None", "Undetermined", "Spouse/DC Over
  $1,000,000", and exact figures a filer entered ("$209,630.10"). Liabilities start at
  "$10,000 - $15,000".

## Decision

**Open each House report once** (`house_annual`).

- After listing, `house_annual` opens each annual, amended, new member or termination PDF it has
  not read. A filed PDF never changes.
- `ingest.house_annual_report` reads Schedules A and D into `raw.annual_report_page` and
  `raw.annual_report_row` (part `A` or `D`). Each row is stored as its cells by column name, plus
  its detail lines.
- A PDF with no text is stored as `paper`.
- A report is `failed`, stores no rows and is retried each night if:
  - its own state-district or filing year differs from the index row, or
  - its schedules do not read back whole: an asset without its code, or a row without a value or
    amount.

**How rows are found:**

- A row starts with its name (the asset; for a liability, the creditor) after a gap of 16pt or
  more.
- At a page break the first line continues the open row when that row is not yet whole: an asset
  without its code, or any band cut at its dash.
- A line with no name in the first column always continues the row above. A whole row can still
  spill a wrapped income type onto the next page.

**How values count** (the same marts as the Senate):

- House "None" is no value (0). Its scale has its own "$1 - $1,000" band, unlike the Senate's
  "None (or less than $1,001)", which counts 0 to 1,000.
- "Undetermined" is not stated by the filer and counts in no total.
- An exact figure counts as itself (`exact`).
- "Spouse/DC Over $1,000,000" is a top band with no upper end.

**Where the rows go:**

- Staging models `stg_house_annual_assets` and `stg_house_annual_liabilities` produce the Senate
  staging's columns. `annual_asset` and `annual_liability` stack both chambers.
- `held_in` names the account for both chambers: the House text before ⇒, or the Senate parent
  line.
- House type codes are labelled with `ptr_asset_types`.
- `annual_report_version` now includes new member reports, so a member's first year has figures.

## Consequences

- **The local run on 2026-11-16** read all 101 text reports with no failures and stored the 10
  scans as paper: 114 requests, 38 MB. A normal night opens only new filings.
- **Independent checks:**
  - On all 101, the reader's Schedule A row count equals a separate count of `[XX]` codes in the
    PDF's plain text (pdfplumber's `extract_text`, not word positions).
  - Steil's 2025 totals, re-added by hand from the text, match the mart: assets
    $1,178,025–$2,820,000, net $1,128,025–$2,804,999.
- **Ranges can be wide or negative.** Carol Miller's low end is -$23.5M: two spouse loans of up to
  $25M each, against spouse assets reported only as "Over $1,000,000". The site prints such a
  range as "-$23,522,930 or more".
- **Paper filers** (Khanna, among others) stay as links until OCR is decided (PLAN section 12).
- **Schedules B, C and E to I** (transactions, earned income, positions, agreements, gifts,
  travel) are not read. A "None disclosed." answer is recorded for each schedule. ADR 0031 reads
  C and E to H.
