# 0035. The States section: who controls each state government

Date: 2026-11-17
Status: Accepted

## Context

The owner asked for a States section (2026-11-16) that simply shows who controls each state
government right now:

- a national map coloured Republican control, Democratic control, or divided government;
- a page per state with the governor and a map of both legislative chambers by party;
- a click on a district shows its members' names and parties;
- a bar per chamber showing whether a party holds a majority or a supermajority.

It must be archived with the 119th Congress in January and go on describing the present
afterwards (ADR 0021). The owner decided the archive shows the states **as of 2026-11-02**, the
day before the 2026 elections, so it shows the legislatures that served alongside the 119th.

Measured on 2026-11-17, before building:

- **Open States** (now Plural Open) publishes every state legislator and governor in the
  public-domain repository github.com/openstates/people, one YAML file each, with dated roles
  and party history. The repository is a 5 MB tarball; 8,525 people have a legislative or
  governor role held since 2025. No key and no API are needed.
- Open States' own district shapes date from 2018, before redistricting. The Census Bureau's
  2025 cartographic boundary files have every state legislative district: 1,958 upper and 4,873
  lower.
- The openstates-core metadata (MIT) lists every chamber and district with its seat count. That
  is the only source for multi-member districts and so for counting vacant seats.
- Neon then held 296 MB of 1 GB; the deploy upload was 69 MB of Vercel Hobby's 100 MB.

## Decision

**Data.**

- `ingest.sources.openstates_people` runs nightly. It asks GitHub for the newest commit of
  `main` and, when that commit is new, downloads its tarball. It keeps people in the 50
  states, DC and Puerto Rico with a legislative or governor role held on or after 2025-01-01,
  and replaces `raw.state_person` with them. It refuses a load of fewer than 7,000 people.
- `ingest.state_maps` is run by hand, only when district lines change. It writes:
  - `dbt/seeds/state_chambers.csv` and `state_districts.csv` (seats per chamber and per
    district);
  - one drawing per state, `site/public/maps/states/{abbr}.json`, keyed by Census district
    code.

  It reads the openstates-core metadata with `ast` and never runs it. It matches every Open
  States district to a Census shape by name, with spelling rules (case, punctuation, "and",
  leading zeros, Idaho's A/B seats, DC wards). It stops on any district it cannot place, except
  the known seats with no shape of their own: DC and Puerto Rico's at-large seats, New
  Hampshire's 39 floterial districts, and Maine's two non-voting tribal seats.
- `seeds/state_supermajority.csv` is a hand-kept draft for the owner to confirm, row by row.
  It holds the share of seats needed to override a veto, or two-thirds where a simple majority
  overrides.
- `seeds/state_control_overrides.csv` (hand-kept) marks chambers run by a cross-party
  coalition. Today that is Alaska's two chambers.

**Which day.** One dbt var, `states_as_of`, is empty for today. The January archive sets it to
2026-11-02 (docs/rollover-runbook.md). A role or party counts if it was held that day.

- A role with no start date (850 of 10,267 legislative roles) counts as held since before.
- When that puts more people in a district than it has seats, the people with the latest known
  start dates are seated. The warning `assert_state_seats_not_overfilled` names the rest.

**Rules.** The owner chose to simplify parties to the federal ones. The fallback for a missing
start date (above) and these rules were left to Claude:

- **Parties.** The first party of a fusion label decides ("Republican/Conservative" is R,
  "Democratic/Working Families" is D, "Progressive/Democratic" is independent or other). The
  Democratic-Farmer-Labor party is D. "Nonpartisan" is N in Nebraska and independent elsewhere.
  Every other party is coloured as independent or other.
- **Control is decided per party, never for "others" taken together.** Puerto Rico's PNP, PPD
  and PIP stay apart, and so do independents.
- **Majority** is more than half of all a chamber's seats, vacant ones included.
  **Supermajority** is the share in the seed. Non-voting members count in neither.
- **Who controls a state.** A party controls a state when it holds the governorship and a
  majority or more in every chamber. A coalition chamber, a chamber where no party has a
  majority (Maine's House at 75 of 151, Minnesota's tied House), or a governor of the other
  party makes the government divided. Nebraska is shown as a nonpartisan legislature.

**API and site.**

- `/api/v1/states` returns every state's governor, chambers and control.
- `/api/v1/states/{abbr}` adds the district table and the seated legislators.
- `/states` is the national control map. It uses the homepage's state shapes and lists every
  state below the map. Puerto Rico is listed beside the map because it is not on the drawing.
- `/states/{abbr}` has a governor card, a bar per chamber with the majority and supermajority
  lines, and a zoomable district map. Multi-member districts that split between parties are
  striped. Shapeless seats are listed under the map.
- The map's rows are `/states/data/{abbr}.json`, a static file written at build time and not
  page props, so they are not stored twice in each page (see the page-weight work in ADR 0017).
- No photographs are shown. They are hotlinked from state sites and would mean third-party
  requests on our pages.

## Consequences

- **Measured on 2026-11-17.**
  - The 52 drawings are 7.3 MB raw and about 2.4 MB gzipped.
  - The 52 data files, 53 pages and their RSC payloads add a few MB more.
  - `raw.state_person` holds 8,525 rows. The nightly step takes about 10 s, and when the
    commit is unchanged it is one GitHub API request.
  - Each build reads the four new mart tables (about 9,000 rows) from the snapshot, not from
    Neon (ADR 0034).
- **District lines are the 2025 Census vintage.** Some states redraw mid-decade. When a district
  name stops matching, `assert_state_holders_have_district` fails, and rerunning
  `ingest.state_maps` fixes it.
- **New Hampshire's floterial districts** are listed under the map rather than drawn. Each one
  overlays several ordinary districts.
- **Coalitions and Maine-style pluralities are judgement calls.** The override seed and the
  supermajority seed are the owner's to keep. Neither has been checked by the owner yet: their
  `checked` columns are blank.
- **After the January rollover.** Open States takes a few weeks to record new legislators. A
  missing new member shows as a vacant seat. A missing governor is a warning
  (`assert_state_governors_recorded`) and the page says so.
