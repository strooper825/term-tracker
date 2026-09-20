# 0016. Constituency tab: Census boundary maps and ACS estimates, keyed by the Congress they describe

Date: 2026-09-20
Status: Accepted

## Context

The Constituency tab was a locked placeholder and `mart.constituency` held identity only (state
and district labels, ADR 0001). The research behind this ADR is docs/constituency-research.md
(2026-09-20); the choices below are the ones made after it. Four findings shape them.

1. **A district number means nothing without its Congress.** The 119th Congress (to
   2027-01-03) holds the lines drawn for 2022 plus five 2024 redraws. Ten states drew new lines
   for the 120th (Census's block equivalency page lists AL, CA, FL, LA, MO, NC, OH, TN, TX, UT).
   Of the ten tracked House districts, CA-3 (Kiley, who is running in the new CA-6), CA-17
   (Khanna) and LA-4 (M. Johnson) differ in the 120th layer. The latest ACS 5-year (2020-2024,
   released 2026-01-29) uses the 119th; Census has said nothing yet about a release on the 120th.
2. **The Census Data API refuses a request with no key**, whatever its user guide says about a
   keyless allowance: `api.census.gov/data/2024/acs/acs5?...` answers 302 to `missing_key.html`
   (checked 2026-09-20). The key is in the URL query, so it appears in every request URL.
3. **TIGERweb, the one Census geometry service, is not shoreline-clipped.** Wisconsin's 1st
   District from TIGERweb has 1.9 times the area of the cartographic boundary file and runs out
   into Lake Michigan. The cartographic files are the ones generalized for mapping.
4. **ACS has no urban/rural table.** The Census file that has one (`CD119_UR_POPAREA.txt`) omits
   the six at-large states and DC, has a header labelled for the 118th, and is 2020 decennial.

## Decision

**Sources.**

- Boundaries: three national cartographic boundary shapefiles at 1:500,000 from one vintage
  (`cb_{year}_us_state`, `cb_{year}_us_cd{congress}`, `cb_{year}_us_county`), no key.
  1:500,000 rather than the 5m files because the district view zooms to a district's own
  extent; the file is simplified again in frame units, so a small file costs nothing.
- Demographics: the ACS 5-year Data Profile and Hispanic-origin-by-race table (B03002) through
  the Data API, four requests for every state and district (the API returns every district for
  `for=congressional district:*&in=state:*`). Every estimate is stored with its margin of error.
  `CENSUS_API_KEY` is an Actions secret like the other keys.
- Both are loaded whole for the nation (ADR 0002); the mart scopes them to tracked members.

**Keyed by Congress.** `raw.constituency_geometry` is keyed `(congress, geoid)` and
`raw.acs_estimate` `(acs_year, geoid)` with a `congress` column. Which Congress a Census product
describes is a fact about the release, written down in `ingest/census.py`
(`GEOGRAPHY_CONGRESS = {2025: 119}`, `ACS_CONGRESS = {2024: 119}`, each with the Census statement
it rests on); a year not in the table stops the run instead of guessing. `mart.member_constituency`
takes only the rows of the tracked Congress (dbt var `current_congress`). When a member's
district has no map or no demographics for that Congress, `has_map` is false and the tab
shows what exists; the dbt test `assert_tracked_constituencies_covered` warns rather than fails,
because failing would take down the nightly ingest (the failure mode ADR 0011 was written for).
Consequence for 2027-01-03: bumping `current_congress` to 120 makes the tab say "not published"
for any member whose lines Census has not shipped as cb files, rather than draw the 119th district.
Kiley's new CA-6 has no ACS data until an ACS release uses the 120th's lines.

**Python, not dbt, for the geometry.** The plan says transformation happens in dbt. Projecting,
simplifying and clipping shapes cannot be written in SQL here (no PostGIS), so
`ingest/geometry.py` produces finished SVG path data at ingest and `raw.constituency_geometry`
stores that, not geometry. The mart only selects and assembles it. This keeps the site thin (it
draws `<path d>` as given, no map library, no client-side geometry) and is the one exception.

**Projection: Albers equal-area conic**, on the unit sphere. The 48 states and DC use the
standard USA parameters (parallels 29.5 and 45.5, central meridian -96), Alaska and Hawaii their
own (55/65 at -154, 8/18 at -157), and each territory is centred on itself. Alaska's Aleutian
Islands are stored east of 180 degrees and are shifted west before projecting, or the bounding
box spans the globe. Each shape is framed to a longest side of 300 units and simplified at 0.6
units, so the tolerance means the same on screen for a state and for a city district.

**Two views, hover-only county names.** A House member's map has a district view (the district
filling its frame, county lines clipped to it) and a statewide view (the district highlighted in
the state, all county lines), with a button to toggle; a senator's, and an at-large member's,
has the statewide view only. County names are SVG `<title>` hover text, not drawn labels.
Counties are Census's county equivalents: Connecticut's are its nine planning regions, Louisiana's
parishes, Alaska's boroughs and census areas.

**Demographics shown.** Population, median age, median household income, households,
bachelor's-or-higher and high-school-or-higher shares (adults 25+), unemployment rate, poverty
rate, and race and ethnicity from B03002 (non-overlapping, so the shares sum to 100). The headline
population is the ACS estimate with its margin of error, labelled "2020-2024 American Community
Survey estimate", not the 2020 decennial count. Census's "could not compute" sentinels
(-666666666 and the rest below -100,000,000) become null in staging; nothing else is cleaned.
**Urban/rural is deferred.** The file has gaps (finding 4) and a different year and method from
the ACS columns beside it, and the state-level source is unchecked.

**Nightly cost.** `census_geography` sends three HEAD requests and, when the files'
`Last-Modified` has not changed, stops; `census_acs` makes four requests. Neither grows with the
number of tracked members.

## Consequences

- One new secret, `CENSUS_API_KEY`. `ingest/census.py` never logs or raises a request URL, scrubs
  the key from an error body, and installs a filter on the `httpx` logger, which otherwise prints
  every URL (and so the key) at INFO.
- `shapely` and `pyshp` are runtime dependencies. Both install from wheels.
- Storage on 2026-09-20: 497 geometry rows, 4.5 MB of path data, 2.2 MB stored after compression;
  a state map is 7-45 KB (Georgia, 159 counties, is the largest of the tracked states), a district
  view 3-18 KB, so a member's page carries roughly 10-60 KB of map data.
- Verified on real data: all 20 tracked members have a map; WI-1 and NY-14 district views match
  their real counties. **No real ACS value has been fetched**: the key exists only as an Actions
  secret, and the tests use invented values (tests/fixtures/census/__init__.py says so). The first
  nightly run logs each tracked member's population, margin and median income for checking
  against data.census.gov.
- The migration is `0008`, after the Public statements migration `0007`, and this is ADR
  0016 for the same reason: both were first numbered 0007 and 0015 on this branch and
  renumbered when it was merged with main after the statements work landed. (The unmerged
  `election-context` branch also claims `0007`; it will need renumbering too.)
- **Update 2026-09-20, first real ACS load.** The API returns a row for the part of a state
  with no district, coded `ZZ` ("Congressional Districts not defined"), which the fixtures
  lacked; casting it to a district number failed dbt in that night's run. The loader now skips
  `ZZ` rows and staging ignores any district code that is not two digits, because the failed
  run had already stored some. The same run showed that Census gives no margin of error for a
  state's population (`-555555555`, which staging turns into null), so a state's population
  has none on the page, and gave real values to compare (WI-1 733,917 with margin 742).
- Not covered, and not free from Census: county-level election results (the mockup copy
  promises them), demographics for the 120th Congress's lines, urban/rural.
