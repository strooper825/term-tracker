# 0027. Annual financial disclosures, listed and linked

Date: 2026-11-16
Status: Accepted

## Context

Besides periodic transaction reports (ADR 0018, ADR 0026), every member files an annual financial
disclosure. It covers the previous calendar year: assets and unearned income, liabilities,
outside earned income, positions, gifts, travel and agreements, all in value ranges. The owner
wants them on the site.

They agreed on 2026-11-16 to put annual disclosures on the existing Stock trades tab, in two
stages:

1. **List and link** each member's reports.
2. **Read the asset and liability schedules.** At that point the tab is renamed "Financial
   disclosures" and keeps the `#stock-trades` anchor working.

The owner chose what stage 1 shows:

- annual reports, amendments and termination reports, each linked;
- extensions as a note on the report they delay;
- not candidate reports, which repeat much of the annual report.

Both offices already publish listings this site reads.

- **House.** The Clerk's yearly index, which the stock-trades source reads, carries every
  filing's type. Checked 2026-11-16:
  - Each index file is named for the year its reports cover. The annual report for 2024, filed
    in May 2025, is in `2024FD.zip`.
  - Every non-PTR filing's PDF is at `financial-pdfs/{year}/{DocID}.pdf`.
  - Types: `O` annual, `H` a new member's first report, `A` amendment, `T` termination,
    `X` extension, `C` candidate. `D`, `W`, `E`, `G` and `B` are not explained in the index.
  - Fedorchak and Begich, first elected in 2024, filed `H` reports in August 2025 after an `X`
    that May.
  - The index does not say which report an extension or an amendment is for.
- **Senate.** eFD search, report types 7 (annual, new filer, termination, candidate) and 10
  (due-date extensions). The titles say what each is and which year:
  - "Annual Report for CY 2025"
  - "Annual Report for 2025 Due Date Extension 1"
  - A paper report's title has no year.

Reading the House index turned up a matching gap. Ashley Hinson files as "Arenholz, Ashley
Hinson". The last-name rule of ADR 0018 matched none of her filings, of either kind.

## Decision

**Two sources, one raw table.**

- `house_annual` reads the Clerk index for the year before the Congress began and each year of
  the Congress that has begun. It keeps types `O`, `H`, `A`, `T` and `X`.
- `senate_annual` runs one eFD search: types 7 and 10, filer type senator, filed since the
  Congress began. It agrees to eFD's statement as ADR 0026 does.
- Both write `raw.annual_disclosure`, migration 0014, keyed by `(source, doc_id)`, keeping only
  filings since the Congress's first day. No report is opened.

**A House filer is matched by seat and name.**

- A row filed for a tracked member's seat is that member's when the member's last name is the
  row's last name, or one of the words of its name (`SeatIndex`).
- A seat has one member, and challengers for it have other names.
- The stock-trades source now uses the same rule.

**Extensions are notes, not rows.**

- An eFD extension names its year.
- A House extension is taken to be for the annual or new member report of the year it is
  listed under when it was filed in the following year, the year those reports are due. One
  filed in the covered year itself, a candidate's for instance, is not shown.
- The latest such extension before the report becomes `extended_on` on that report.
- An extension with no report yet becomes one row: "Report for 2026: not filed yet", linking
  the extension.

**Labels.**

- "Annual report for 2025" and "New member report for 2024".
- "Amended report for 2024" for the House, whose index does not say whether an amendment is to
  an annual or a new member report. "Amended annual report for 2024" for eFD.
- "Termination report".

**Statuses.** `mart.member_annual_disclosures` gives each member `filed`, `no_filings`, or
`unavailable` (the chamber's listing was never read successfully). `checked_at` is the last
successful run of the chamber's source.

**On the tab.** An "Annual financial disclosures" section sits above the trades for every member
and says it lists the reports but does not read them. The API endpoint is
`GET /members/{id}/annual-disclosures`.

## Consequences

- A local run on 2026-11-16 found:
  - House: 171 filings for all 50 tracked House members (97 annual, 3 new member,
    11 amendments, 60 extensions), 3 requests.
  - Senate: 47 filings for all 16 tracked senators, 6 requests.
  - No report was left "not filed yet".
- The new rule finds Hinson's annual reports. She has no trade reports, so the stock-trades
  numbers do not change.
- Stage 2 reads the schedules: House PDFs, where paper filers are scans, and eFD's HTML.
- An eFD paper report has no year in its title, so it is listed without one.
- House amendments and extensions are attributed by date, not by the index's own say. A late
  extension for a termination report would be shown as an annual report's.
