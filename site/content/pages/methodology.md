---
title: Methodology and sources
description: Where every number on Term comes from, and how often it is refreshed.
---

Every number on Term is read from a public record and links back to it. The site is rebuilt every night from those records; nothing is entered by hand except the few items noted below.

## Sources

- **Congress.gov** (the Library of Congress API): bills, their actions, summaries and cosponsors, and House roll-call votes.
- **Senate.gov**: Senate roll-call votes.
- **The Federal Election Commission**: campaign fundraising totals.
- **The unitedstates/congress-legislators project**: who holds each seat, party, terms, committee assignments and office contact details.
- **The Census Bureau**: state and district boundaries for the maps, and district demographics from the American Community Survey.
- **Members' own press offices**: public statements, from each office's published feed where it has one.
- **Open States (Plural Open)**: every state's governor and legislators, their parties and districts, from its public-domain [openstates/people](https://github.com/openstates/people) data. The States section counts a party as controlling a chamber when it holds more than half of all its seats, vacant ones included, and as controlling a state when it also holds the governorship. A supermajority is the share of seats needed to override a veto. Nebraska's Legislature is officially nonpartisan; its senators are shown by their party registration. Each chamber's roster page lists its members' contact details, committee seats and the service Open States records; earlier terms are often missing there, and where a member's records contradict each other only the current seat is shown.
- **The Securities and Exchange Commission**: the industry of each company a member trades. A trade in an industry one of the member's committees oversees is noted; [how that is decided](/methodology/committee-industries).

## Refreshed nightly

The data is reloaded every night. When a source is temporarily unavailable, the site keeps the last good copy and says on the page that it may be out of date.

## Entered by hand

A few things have no machine-readable source and are maintained by hand: the party breakdown of each chamber on the Congress overview (no source lists vacancies), a few key dates such as election day, each state's supermajority threshold, the state chambers run by a cross-party coalition, and Nebraska senators' party registration.

## Full technical documentation

The complete list of tables and fields is in the [data dictionary](https://github.com/strooper825/term-tracker/blob/main/docs/data-dictionary.md), and the code that builds the site is [public on GitHub](https://github.com/strooper825/term-tracker).
