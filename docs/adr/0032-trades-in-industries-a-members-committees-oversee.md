# 0032. Trades in industries a member's committees oversee

Date: 2026-11-17
Status: Accepted (2026-11-17). The owner reviewed `committee_industries.csv` line by line: security
services were dropped from House Homeland Security (now unmapped), meat packing and poultry
(SIC 2011-2015) were added to both Agriculture committees, and aircraft makers (3720-3729) stay out
of Armed Services. 50 rows across 15 committees.

## Context

PLAN section 2 asks for trades "flagged against committee jurisdiction". The open item records
why it waited: nothing maps an asset to a committee, and a flag on a trade reads as an accusation
the data cannot support on its own.

**What the data allows** (checked 2026-11-17):

- 441 of the 512 trades held (86 percent) carry a ticker, across 169 tickers and 13 members. The
  rest are corporate bonds (41), government and municipal debt, and private holdings.
- The SEC publishes, free, a list mapping each ticker to a company (`company_tickers.json`) and
  each company's Standard Industrial Classification code (SIC) (`data.sec.gov/submissions`).
  Its fair-access policy asks automated clients to declare a contact email in the User-Agent.
- Committee seats are stored per Congress (`mart.committee_membership`, the 119th only), with no
  start or end dates.
- Each committee's jurisdiction is in House Rule X and Senate Rule XXV, in prose. No official
  mapping to industries exists.

**The risk is breadth.** Taken literally, Energy and Commerce, Ways and Means, Finance or
Appropriations reach nearly every company, so nearly every trade by their members would be
flagged. A flag on everything tells a reader nothing, and it implies more than it shows.

## Decision

**Neutral overlap notes, not flags.** A trade gets a note only when the company's industry is one
that a committee the member sits on oversees, under a narrow, published mapping. The wording is
fixed: "In an industry the {committee} oversees". It is never "conflict", "violation" or
"suspicious", and a methods page explains what the note does and does not mean.

**Industries come from the SEC.** A new source, `sec_industry`, runs after the PTR sources:

- It reads the traded tickers from the PTR staging views (`staging.stg_house_ptr_transactions`,
  `staging.stg_senate_ptr_transactions`). Those views sit directly on the raw tables the PTR
  sources filled earlier that night, so the ticker parsing stays in one place. This is the first
  source to read a dbt view. On a database dbt has not built yet, the views are missing and it
  skips them.
- It looks up each ticker it has not stored yet: the ticker list once a run, then one
  submissions request per new company, at five requests a second. A run with nothing new makes
  no request. Tickers are normalised (`BRK.B` and `BRK-B` are the same).
- Stores the company's CIK, name, SIC code and SIC description.
- Declares a project contact email in the User-Agent, as the SEC asks. The owner chooses the
  address; it is never the owner's personal one.
- A ticker the SEC does not list stays unmatched. The warning test
  `assert_trade_tickers_matched` lists unmatched tickers. A hand-kept override seed can be added
  if a ticker worth fixing turns up (a misprinted or renamed one); there is none yet.
- Bonds, Treasuries, municipal debt and funds get no industry and never a note.

**The mapping is narrow and committee-level** (`seeds/committee_industries.csv`):

- Each row maps a committee to a range of SIC codes for one industry, with the part of the
  committee's jurisdiction it rests on.
- Only a committee's core industries are mapped: Armed Services to weapons makers, not to every
  company that sells to the Pentagon, and Financial Services to banks, securities firms and
  insurers.
- A committee whose remit is the whole economy (Appropriations, Budget, Ways and Means, Finance,
  Judiciary, Oversight), or that has no legislative jurisdiction, is not mapped.
- `seeds/committee_industry_scope.csv` records every committee and whether it is mapped, with the
  reason, so the methods page can list both.
- Subcommittees are not mapped. They are reshuffled each Congress and would need a full review
  each time.
- `assert_committee_industry_scope_complete` fails when a committee a tracked member sits on is
  missing from the scope seed. A new committee at a new Congress therefore cannot go unreviewed.
  `assert_committee_industries_mapped_in_scope` keeps the two seeds consistent.

**The rule:** a note shows when the member sat on the committee in the Congress of the trade date
and the company's SIC code falls in a range mapped to that committee. Committee seats carry no
dates, so a member who changed committees within a Congress is matched on the seats recorded for
it. The methods page says so.

**What is shown:**

- `mart.stock_trade` gains `company`, `sic` and `industry` (the SEC's description).
- `mart.trade_committee_overlap` has one row per trade and committee.
- On each trade with a matched company, its industry ("Industry: Guided Missiles & Space
  Vehicles & Parts"), with or without a note.
- The note, linking to the methods page.
- A count above the trade list, over trades with a known industry only, with the words "a note
  of overlap, not a finding of wrongdoing". No ranking of members against each other.
- The methods page `/methodology/committee-industries` sets out the rule in owner-editable
  Markdown (`site/content/pages/committee-industries.md`). Below it, the whole mapping is shown,
  mapped and unmapped committees alike, read from the seeds through
  `GET /api/v1/meta/committee-industries` so it cannot drift from what the notes use.

## Consequences

- **Upkeep:**
  - A few new tickers a week, looked up automatically.
  - An occasional look at the unmatched-ticker warning.
  - About an hour reviewing the mapping at each new Congress, when committees are renamed,
    created or abolished. The first review is the rollover to the 120th.
- **It undercounts on purpose.** A narrow mapping misses real overlaps: Energy and Commerce's
  consumer-protection reach, or a defense contractor classed as an aircraft maker. The methods
  page says the mapping is narrow and publishes it whole, so a disagreement is about a visible,
  editable line.
- **No industry, no note.** A trade in a fund, a bond or an unmatched ticker never gets one.
- **The owner must choose the SEC contact address** before the source can run.
