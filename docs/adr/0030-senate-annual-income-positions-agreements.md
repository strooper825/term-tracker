# 0030. The rest of a Senate annual report: income, positions, agreements, gifts and travel

Date: 2026-11-16
Status: Accepted

## Context

ADR 0028 stores every part of every read Senate annual report in `raw.annual_report_row`, but the
site reads only Part 3 (assets) and Part 7 (liabilities). The other parts are already stored, so
showing them needs no new fetch and no migration.

**What the 35 read reports hold** (checked 2026-11-16). Every report that has a table for a part
uses the same headings for it:

| Part | Headings after the blank and "#" columns | Rows | Reports with rows |
|------|------------------------------------------|------|-------------------|
| 2. Earned and Non-Investment Income | Who Was Paid, Type, Who Paid, Amount Paid, Comments | 76 | 28 |
| 5. Gifts | Date, Recipient, Gift, Value, From, Comments | 4 | 3 |
| 6. Travel | Date(s), Traveler(s), Travel Type, Itinerary, Reimbursed For, Who Paid, Comments | 2 | 1 |
| 8. Positions | Position Dates, Position Held, Entity, Entity Type, Comments | 33 | 21 |
| 9. Agreements | Date, Parties Involved, Type, Status and Terms, Comments | 40 | 19 |

**How the cells look:**

- A member's own income is printed to the cent ("$193,400.00"). A spouse's income is printed only
  as "> $1,000": filers report a spouse's earned income source above $1,000, not its amount.
- eFD prints a filer's own wording as "Other (Member)" for a position or entity type, and as the
  type "Other" with the wording in parentheses as a nested note for income ("(Book advance)").
- Each payer, entity, giver or sponsor carries its city as a nested note.
- Comments sit in a nested note; "n/a" means none.
- Part 4b repeats the PTRs already read by ADR 0026, and Part 1 (honoraria, 3 rows) and Part 10
  (compensation over $5,000 from one source, never filled in) are left out.

## Decision

**Refuse changed headings.** `EXPECTED_COLUMNS` in `ingest/efd_annual_report.py` now covers Parts
2, 5, 6, 8 and 9 as well as 3 and 7. The staging models read cells by position, so a heading that
moves would otherwise put the wrong text in a column without anyone noticing. A report whose
headings differ is `failed` and retried, as ADR 0028 does for Parts 3 and 7. What the reader stores
is unchanged, so `READER_VERSION` stays at 2.

**One staging model and one mart per part:**

- `stg_annual_report_income` → `annual_income`. The amount is `exact` (low = high) or `over` (low
  = 1,000, no high). Amounts are never summed: "> $1,000" has no upper end.
- `stg_annual_report_positions` → `annual_position`, with `is_current` for dates that run "to
  present".
- `stg_annual_report_agreements` → `annual_agreement`.
- `stg_annual_report_gifts` → `annual_gift`, with a typed date and value.
- `stg_annual_report_travel` → `annual_travel`, with departure and return dates.

"Other (X)" becomes X, and one pair of outer parentheses is taken off an income description. Each
mart is keyed to `annual_report_version`, like `annual_asset`, and its names do not mention the
Senate. House Schedules C, E, F, G and H can stack into the same marts later.

**API and site:**

- `latest` in `GET /members/{id}/annual-disclosures` gains `income`, `positions`, `agreements`,
  `gifts` and `travel`.
- A list is `null` where the chamber's report is not read that far (House, for now) and empty
  where it is read and the filer listed nothing.
- The tab shows a section for each list with rows, in that order, after Debts. One line names the
  read parts with no rows ("The report lists no gifts."). A House report shows neither, so the
  site never says "none" about a schedule it has not read.

## Consequences

- **Local data (2026-11-16):** for the year each report stands for, the marts hold 74 income lines
  for 13 senators, 28 positions for 9, 40 agreements for 10, 4 gifts for 3 and 2 trips for 1.
  Some members have two read years, so these counts are larger than what the site shows for the
  newest report.
- **A heading change on eFD** now fails a newly opened report, which would earlier have read for
  its assets, on any of seven parts instead of two. The run logs a warning for it and counts it as
  `failed`. Reports already stored are not opened again, so they keep their rows.
- **House:** Schedules C, E, F, G and H still have to be read from the PDFs. That is the next stage
  and needs a House reader version, so stored reports are read again. Done in ADR 0031, which
  also replaces the chamber test in the API with `annual_report_version.sections_read`.
