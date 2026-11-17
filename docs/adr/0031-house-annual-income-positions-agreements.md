# 0031. The rest of a House annual report: Schedules C and E to H from the Clerk's PDFs

Date: 2026-11-17
Status: Accepted

## Context

ADR 0030 shows senators' outside income, positions, agreements, gifts and travel in five marts
whose names leave room for the House. The House prints the same disclosures as Schedules C and E
to H of the PDFs that ADR 0029 already reads for Schedules A and D. Those schedules were skipped,
and every stored House report would have to be fetched again to read them.

**What the PDFs show** (the tracked members' 101 text reports for 2024 and 2025, checked
2026-11-16). Each schedule has a bold 9.4pt header row, as A and D do:

| Schedule | Columns | Rows | Reports with rows |
|----------|---------|------|-------------------|
| C, Earned Income | Source, Type, Amount (a new member's report: two amounts, current year to filing and preceding year) | 150 | 70 |
| E, Positions | Position, Name of Organization | 136 | 41 |
| F, Agreements | Date, Parties To, Terms of Agreement | 79 | 54 |
| G, Gifts | Source, Description, Value | 2 | 2 |
| H, Travel | Source, Start Date, End Date, Itinerary, Days at Own Exp., Lodging?, Food?, Family? | 36 | 26 |

**How they differ from the Senate's:**

- There is no owner column. A spouse's income says so in its type ("Spouse Salary").
- An amount of "N/A" lists a source without its amount. 107 of the 150 income lines give no
  amount, almost all a spouse's.
- Positions carry no dates, location or entity type. Agreements carry no type. Gifts carry no
  date or recipient, and the giver's city is printed in brackets after the name. Trips carry no
  traveler or what was paid for, but do give the days spent at the member's own expense.
- Lodging?, Food? and Family? are check marks drawn as graphics. They read empty on all 36 trips.
- Rows wrap in the first column too ("Little, Brown and" / "Company"), and one of Clyburn's trips
  runs from the foot of page 2 onto page 3. So for these schedules a line that has text in the
  first column does not mark a new row the way an asset's name does.

## Decision

**Read Schedules C and E to H** in `ingest.house_annual_report`:

- Each schedule gets a layout keyed on its header words. C has two layouts, told apart by how
  many "Amount" headings it has, the way A is told apart by "Income".
- A row starts on the cell printed only on a row's first line (`ROW_STARTS`): the amount (C), the
  organization (E), the date (F), the value (G) or the start date (H). Any other line continues
  the open row, on the same page or the next.
- `REQUIRED` names the cells each schedule's rows cannot be without. A report with a row missing
  one is `failed`, as A and D already are.

**Read stored reports again.** `READER_VERSION = 2` is kept in each page's payload. As on the
Senate side (ADR 0028), `stored_pages` treats a `parsed` House report read by an older reader as
unread. The first nightly after this change fetches every text report once more: 101 PDFs,
12.8 MB locally. Paper reports are not fetched again.

**One staging model per schedule:** `stg_house_annual_income`, `_positions`, `_agreements`,
`_gifts` and `_travel`.

- Each has the columns of its Senate counterpart. What the House does not print is null, never
  guessed: an owner, a position's dates and `is_current`, an agreement's type, a gift's date and
  recipient, travelers.
- Income adds `amount_kind = 'not_stated'` for "N/A". On a new member's report, the current-year
  amount is used when stated, else the preceding year's, and `amount_period` says which.
- A gift's giver is split from the bracketed city.
- `days_at_own_expense` is added to travel; it is null for the Senate.
- The five marts now stack both chambers.

**The API decides from the report, not the chamber.** `annual_report_version.sections_read` is
true for every eFD report and for a House report read by reader 2 or later. Only then does
`latest` carry lists. A House report the nightly could not fetch again keeps null sections, so
the site never says "lists no income" of a report whose Schedule C was never read.

**On the site:**

- An "N/A" amount shows as "No amount given".
- The income note names only the reporting rule the lines shown follow.
- A missing agreement type, gift date or recipient is left out of the line.
- A trip shows its days at own expense when there are any.

## Consequences

- **Independent check:** on all 101 text reports, the reader's row count for each of C, E, F, G
  and H equals a separate count from pdfplumber's plain text (`extract_text`, not word
  positions). Income lines end with an amount or "N/A", agreements start with a date, gifts end
  with a dollar value, and trips have two dates on one line. Positions have no such anchor, so
  every non-header line was counted, and no position wrapped. Totals: 150, 136, 79, 2 and 36,
  with no report differing. Every row was also read by hand.
- **Schedules A and D are unchanged:** the re-read stored the same 3,423 assets and 245
  liabilities.
- **Local mart counts** (the report that stands for each year): 135 income lines for 33 members,
  119 positions for 20, 72 agreements for 26, 2 gifts and 36 trips for 18.
- **The first nightly after merging** reads 101 PDFs instead of none. A failed fetch leaves that
  report on reader 1, with its sections hidden, until a later night reads it.
- **Not read:** Schedule B (transactions), I (payments to charity in lieu of honoraria) and J
  (compensation over $5,000 from one source, new member reports), and the Lodging?, Food? and
  Family? marks. Paper filers (Khanna among others) stay as links.
