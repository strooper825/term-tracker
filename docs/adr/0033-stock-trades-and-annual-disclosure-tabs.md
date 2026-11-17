# 0033. Stock trades and the annual disclosure as two member tabs

Date: 2026-11-17
Status: Accepted

## Context

ADR 0027 put the annual financial disclosures on the Stock trades tab, renamed Financial
disclosures, with the id `stock-trades` kept for old links. ADRs 0028 to 0032 then filled both
halves. By 2026-11-17 the one tab held:

- the annual report's figures, holdings, debts, income, positions, agreements, gifts and travel,
  and a list of every report;
- the trades' summary figures, value totals, a 25-at-a-time trade list and every trade report.

The owner found it cluttered and wordy, out of step with the bill search page, with no way to
filter trades, and with the overlap notes of ADR 0032 easy to miss. Mockups were compared on a
design canvas, using real data: Boozman (345 trades), Fetterman (51 trades and the one trade
production marks as in a committee's industry) and Sanders (no trades). Sub-tabs inside the tab
were tried and rejected as tabs within tabs. Charts were tried and rejected as too much.

## Decision

**Two member tabs, side by side, no nesting:** Stock trades (id `stock-trades`, so `#stock-trades`
links still land on the trades) and Annual disclosure (id `annual-disclosure`). The tabs link to
each other in a line ("what they own", "their trades").

**Stock trades is laid out like the bill search** (`BillBrowser`):

- A search box (company or ticker) and an All / Buys / Sales switch.
- A filter panel, folded behind "More filters" on a phone. First comes "In an industry this
  member's committees oversee", with its count shown even at zero. Then asset type (only when
  there is more than one) and year traded, and Clear filters.
- Newest / Oldest sort, and the trades as list rows. Each row shows the ticker in navy, the asset,
  a detail line (type, owner, industry, account) and a buy or sale chip. It also shows the amount,
  the trade date, the days to report and a link to the report.
- A trade in a committee's industry has a tinted row and the line "In an industry the {committee}
  oversees, a committee this member sits on." with a link to the methods page. The wording uses no
  pronoun: the site does not know members' pronouns.
- The empty and unread states stay apart and get shorter: eFD never read, no reports, scanned
  paper. The report list sits at the foot, folded.
- The summed purchase and sale value ranges are no longer shown. The mart still has them.

**Annual disclosure shows one read report at a time:**

- A switch between the years read. `GET /annual-disclosures` gains `years`, every read report
  newest first. `latest` stays, as `years[0]`.
- Figures for assets, debts and outside income. Outside income adds only amounts stated to the
  dollar and counts the rest ("1 more without an exact amount"); it never adds a range or an "over
  $1,000".
- Holdings, largest first, ten at a time. A holding's income shows only when there was some.
- Debts, income, positions, agreements, gifts and travel as short lists, and one line for the parts
  read but empty. Every report is listed at the foot, open when none could be read.

## Consequences

- The member page has seven tabs instead of six. The tab bar already scrolls sideways on a phone.
- The `/annual-disclosures` response carries every read year, so a member page grows with each
  year read (Boozman: 129 and 116 holdings). This counts toward the page-weight budget the
  expansion batches track.
- The overlap filter shows 0 for most members today: production finds one trade across the 13
  members who trade (ADR 0032 is deliberately narrow).
- A trade filed without a ticker gets no industry, so it can never get a note. Matching on the
  company name would close that, and is not done.
