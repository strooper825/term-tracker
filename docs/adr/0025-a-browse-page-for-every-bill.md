# 0025. A browse page for every bill, filtered in the browser

Date: 2026-11-15
Status: Accepted

## Context

The site exists to make Congress's bills easier to sift, and the only ways to a bill were a
search box, a member's page and the "passed both chambers" table. The owner also wants to write
"this week in Congress" articles and needs to narrow the list to what mattered.

Since ADR 0023 raw holds the whole Congress, about 27,000 bills and amendments, while the mart
and the site carry pages for the roughly 4,600 the tracked members touched. A page for every
bill would break the hosting limits (51 KB a page); a list of every bill does not.

A mockup was iterated with the owner and approved on 2026-11-15.

## Decision

**A page at `/bills`** replaces "Search bills" in the Congress menu. The header's search icon
is removed; `/search?bills` redirects to it. The homepage keeps its search box.

**What it offers.** A search box (title, number in any spelling, sponsor); when the bill last
moved (this week is today and the six days before, last week, this month, all); how far it got;
topic (Congress.gov's policy areas); chamber of origin; sponsor's party; "had a floor vote".
Three orders: most important, latest action, most cosponsors. Fifty results at a time.

- **Most important** is how far the bill got, then whether it had a floor vote, then the latest
  to move. The owner chose those two signals; cosponsors and bipartisanship are a separate order.
- **A search looks across the whole Congress**, whatever the time filter says.
- **Hidden until asked:** amendments, simple and concurrent resolutions, and bills that name a
  post office. A bill typed by its own number is found even when it is one of these.
- **Every filter is in the address**, so an article can link to a filtered view.

**Where the list comes from.** `mart.bill_index` has one narrow row per bill of the Congress,
with `stage` read from the Library of Congress action codes on the bill's own actions (so a
voice vote counts), `has_floor_vote`, `is_minor` and `has_page`. `GET /api/v1/bills/index`
serves it. The build writes two static files: `/bills/data/recent.json`, the bills that moved in
the last 45 days plus the topic list, which is all the page needs to open; and
`/bills/data/all.json`, fetched only when a search or "All" needs it. Rows are short arrays.

**Filtering happens in the browser.** The site is a static export with no server to ask.

A bill with a page links to it; one without links to Congress.gov.

## Alternatives considered

- **A page for every bill.** About 1.4 GB of pages; not on the free hosting tiers.
- **Only the bills that have pages.** It would hide five sixths of the Congress from the page
  whose point is to find things.
- **One file.** Several megabytes before anything shows, for a page that opens on one week.
- **A "copy link to this view" button.** Built and removed at the owner's request; the address
  bar already holds the link.

## Consequences

- The deploy gains two JSON files, a few megabytes together, and one page.
- The list is as complete as raw: it is short until the 119th backlog finishes loading.
- `stage` here and the vote journey on a bill's page (`mart.bill_journey_stage`, ADR 0009) are
  two readings of the same actions and can differ: the journey shows a chamber stage only from a
  roll call, this counts any passage.
- Topic pages and a "what moved this week" page are saved views of this one and can be added
  as links without new data.
