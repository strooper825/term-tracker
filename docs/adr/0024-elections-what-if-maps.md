# 0024. Elections is a set of what-if maps the owner feeds by hand

Date: 2026-11-14
Status: Accepted

## Context

ADR 0022 reserved an Elections section and left four "coming soon" pages. The owner's idea for
it (2026-11-14) is not a results site: a visitor games an election out on a map, the way
270toWin works, and the owner enters the candidates and, when a race is called, the winner.
Granular data (vote counts, money, polling) is wanted later, not now.

A mockup was iterated with the owner and approved on 2026-11-14: one playable map screen and
one editor screen.

## Decision

**What is built.** Maps for President, Senate and Governor, for the 2026 and 2028 cycles. House
stays "soon". There is no Elections front page: `/elections` redirects to the default map.

**Addresses.** `/elections/{cycle}/{race}`, for example `/elections/2026/senate`. They never
change, so archiving a cycle breaks no link. `/elections/{cycle}/{race}/{state}` is reserved for
a race's own page (money, polling) and is not built.

**The map.** State shapes are the ones the homepage already ships
(`site/public/maps/national.json`). A visitor selects a state to change who wins it; the count
at the top moves. Three views:

- *Play it out*: the races on the ballot, starting from whoever holds each seat.
- *Full Senate* / *All governors*: every state as it would stand after the visitor's picks,
  seats not on the ballot included. A state whose two senators differ is striped.
- *Final result*: the owner's entered winners, once there are any.

President has every state on the ballot, so it has no full view. Maine and Nebraska are seven
units (two statewide, five districts), the districts as boxes beside the map.

**Counting.** A holder or candidate has a party and, optionally, a party they caucus with. The
map colours by party (an independent is purple); control is counted by caucus, so Sanders and
King count toward the Democrats. A 50 to 50 Senate reads "tied": the vice president is not
modelled. Current control is shown for the Senate and the governors; the presidential map
compares against 2024.

**Where the data lives.** Files the owner edits at `/admin`, one per map
(`site/content/elections/{cycle}/{race}.json`), so one save publishes a whole map. A race has a
permanent id, the holder going in (party, caucus, vacant, an optional member id), any number of
candidates (permanent id, name, party, optional caucus, optional member id, optional FEC id) and
a result (the winner, the date it was called, an optional note). A result can be cleared.
Results are entered when the owner calls the race; no source link is kept.

- A race with no candidates offers the parties only. 2028 starts that way.
- A candidate with a member id links to that member's profile when one exists.
- A Senate holder defaults to `mart.seat` (ADR 0022) at build time; the file overrides it, which
  is how a vacancy, an appointment or a party switch is recorded. The site has no data on
  governors, so their parties are in the files. The presidential map starts from the 2024
  result, which is a constant in `site/src/lib/elections.ts` with the electoral votes.
- The 2028 maps start from the 2026 results seat by seat, and from today's holder for any seat
  whose result has not been entered.

**The visitor's map** is kept in their browser's local storage, per map, and goes nowhere else.
The privacy policy gains a line saying so. There are no share links and no accounts.

**Archiving.** A cycle is archived by a flag in its files when its Congress ends
(rollover-runbook.md). It keeps its address, opens on the final result, and stays playable.
Before the seat data rolls over to the new Congress, `scripts/freeze-election-holders.mjs`
writes the Senate map's holders into its file, so the old map keeps the senators it had.

## Alternatives considered

- **A results section** (winners, votes, money per race). Built as a first mockup and rejected:
  it is not what the section is for, and results have no single free source.
- **Tables in Postgres and an ingest.** Nothing here comes from an upstream source yet; the
  data is about 170 hand-entered races. Files keep it editable without code and out of the
  nightly. Money, when it comes, arrives through the nightly and joins on the FEC id.
- **Share links.** Deferred by the owner.

## Consequences

- A handful of static pages and no new data in the deploy beyond small JSON files.
- The owner maintains candidates, holders and results by hand. The editor publishes on save,
  so each map is one file.
- The race and candidate ids, the reserved race address and the FEC id field are there so
  per-race detail and the House (435 races, district shapes already in `national.json`) can be
  added without changing what exists.
- The "soon" pages at `/elections/{senate,governor,presidential}` become redirects.

## Build order

All three steps were built together (2026-11-14).

1. The data shape, its loader and checks, the map component, and the 2026 Senate and Governor
   maps with all three views; the editor collection; the header menu and redirects.
2. The 2028 maps: President with the Maine and Nebraska split, Senate and Governor starting
   from the 2026 results.
3. Saving in the browser and the privacy line; the archive flag.
