---
title: Methodology and sources
description: Where every number on Term Tracker comes from, and how often it is refreshed.
---

Every number on Term Tracker is read from a public record and links back to it. The site is rebuilt every night from those records; nothing is entered by hand except the few items noted below.

## Sources

- **Congress.gov** (the Library of Congress API): bills, their actions, summaries and cosponsors, and House roll-call votes.
- **Senate.gov**: Senate roll-call votes.
- **The Federal Election Commission**: campaign fundraising totals.
- **The unitedstates/congress-legislators project**: who holds each seat, party, terms, committee assignments and office contact details.
- **The Census Bureau**: state and district boundaries for the maps, and district demographics from the American Community Survey.
- **Members' own press offices**: public statements, from each office's published feed where it has one.

## Refreshed nightly

The data is reloaded every night. When a source is temporarily unavailable, the site keeps the last good copy and says on the page that it may be out of date.

## Entered by hand

Two things have no machine-readable source and are maintained by hand: the party breakdown of each chamber on the Congress overview (no source lists vacancies), and a few key dates such as election day.

## Full technical documentation

The complete list of tables and fields is in the [data dictionary](https://github.com/strooper825/term-tracker/blob/main/docs/data-dictionary.md), and the code that builds the site is [public on GitHub](https://github.com/strooper825/term-tracker).
