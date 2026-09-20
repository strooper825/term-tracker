# Constituency tab and district/state map: source research

Date: 2026-09-20. Branch `constituency-research`. Research only: no ingestion, dbt, API or
site code was written, and no ADR (this is input to the scope decision, not a decision).

**Update, later the same day:** the tab was then built on this branch, and the decisions are in
[ADR 0015](adr/0015-constituency-tab-census-sources.md). Where the build departs from this
report: Albers instead of Equal Earth (the reviewer's choice); one PR instead of two; the
1:500,000 files instead of 5m, so the district view can zoom to a district; and TIGERweb ruled
out on a measurement made while building (it is not shoreline-clipped, section 1's fallback).
Everything below is unchanged as the record of what was found.
Everything below was checked on 2026-09-20 against live Census endpoints unless marked
**not verified**. Files were downloaded to a scratch directory only, not to the repo.

## 0. Where the repo stands

- `mart.constituency` (dbt/models/mart/constituency.sql, ADR 0001) is **identity only**:
  `fips_state`, `district` (NULL for a state, 0 for at-large), `state_abbr`, `state_name`,
  `label`, provenance. Live local DB today: **496 rows = 57 state rows (FIPS seed, includes
  territories) + 439 district rows** (every current House term in congress-legislators, not
  only tracked members, delegates included). No geometry, no population, no demographics.
- The panel is `LockedTabPanel` (site/src/components/SideCards.tsx:147,
  "Coming in a future release"). `MemberDashboard.tsx:124-127` mounts it as the
  **Constituency** tab. The Claude Design mockup (`design/src/pages/MemberDashboard.jsx:18`)
  names the panel **State map** (Senate) / **District map** (House) and promises "county
  results and demographics" (Senate) and "boundaries, county splits and district
  demographics" (House). County splits and county results are beyond what was asked and are
  not covered below except where noted.
- PLAN.md section 5 says Census is "key optional". **That is stale for the API** (section 2).
  PLAN.md section 2 lists "District map" (panel 10) as USAspending awards, Phase 3; section 12
  leaves "Map content" open. This research is about boundaries and demographics, not awards.
- The site is `output: 'export'` (static), Next 16 / React 19 / Tailwind, **no charting or map
  dependency**, and no existing inline-SVG component.
- Tracked constituencies today: 10 House districts (AR-1 Crawford, CA-3 Kiley, CA-17 Khanna,
  KY-4 Massie, LA-4 M. Johnson, NY-8 Jeffries, NY-14 Ocasio-Cortez, PA-10 Perry, WI-1
  Steil, WI-2 Pocan) and 8 states for 10 senators (AR x2, CA, CT, GA, KY, MI, VT, WI x2):
  **18 distinct constituencies**.

## 1. Boundaries

### Which files, which vintage

| Source | What | Notes |
|---|---|---|
| Cartographic boundary (generalized) | `https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_cd119_{500k,5m,20m}.zip`, plus `cb_2025_us_state_{500k,5m,20m}.zip` | 119th Congress, 2025 vintage; modified 2026-04-23. One national file per resolution. Fields: `STATEFP, CD119FP, GEOIDFQ, GEOID, NAMELSAD, LSAD, CDSESSN, ALAND, AWATER`. 441 records at 500k/5m (435 districts + 6 delegate/resident-commissioner), 437 at 20m. |
| TIGER/Line (full resolution) | `https://www2.census.gov/geo/tiger/TIGER2025/CD/tl_2025_{ss}_cd119.zip`, one per state (CA 3.7 MB, TX 4.0 MB, NC 2.1 MB) | Full detail, per state. Not needed for a small map. |
| TIGERweb REST (Legislative MapServer) | `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/{4}/query` | **Layer 4 = 119th, layer 0 = 120th.** Supports `f=geojson`, `outSR=4326`, and server-side generalization with `maxAllowableOffset`. Keyless. |

Cartographic file page: <https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html>
(offers shapefile and KML, plus GeoPackage from 2024; **no GeoJSON**). Directory listing:
<https://www2.census.gov/geo/tiger/GENZ2025/shp/>.

### Format and conversion

- Downloads are **shapefile (or KML)**, in NAD83 lon/lat. A frontend cannot use them directly.
  Census does not publish static GeoJSON or TopoJSON for districts.
- The only "pre-rendered GeoJSON" is the **TIGERweb REST query**, which returns GeoJSON on
  demand. Measured: CA's 52 districts, layer 4: 15.5 MB at full resolution, **82 KB with
  `maxAllowableOffset=0.01`** (degrees). One district (WI-1) at 0.001: 5.0 KB; KY-4 at
  0.01: 2.6 KB. The whole nation (441 districts) at 0.01: **689 KB**, 444 features (three
  non-district "ZZ"-style areas to filter out). Server-side generalization is a plain
  simplify, not topology-preserving, so shared borders can show slivers; harmless for one
  district drawn alone.
- TIGERweb is a live service with no published SLA. Reasonable for a one-off seed or a yearly
  refresh, not for a nightly dependency. The shapefile route is the reproducible one and
  needs a converter (pyshp + shapely worked; `pip install` only, no GDAL).

### The redistricting question (the important finding)

- **The 119th Congress files match the districts the 20 members currently hold.** Census:
  the 119th map suite "depict[s] the congressional districts in effect for the 119th
  Congress (January 2025-2027)"; five states (AL, GA, LA, NY, NC) drew new lines for 2024
  ([wall maps page](https://www.census.gov/geographies/reference-maps/2025/geo/cong-dist-119-wall.html)).
  Confirmed against our data: the 119th CA-3 in the cb file is 56,117 km2 (the large Sierra /
  eastern-CA district), CA-6 is 652 km2 (Sacramento).
- **Kiley "moved" from CA-3 to CA-6 for the 2026 election, not for the current term.**
  California's Proposition 50 map applies to the 120th Congress (from 2027-01-03); Kiley is
  running as an independent in the new CA-6
  ([CalMatters](https://calmatters.org/politics/2026/03/kevin-kiley-chooses-reelection-district/),
  [CapRadio](https://www.capradio.org/articles/2026/09/16/meet-the-candidates-running-in-sacramentos-new-congressional-district-6/)).
  `mart.term` and `mart.constituency` correctly say CA-3 for the 119th. **For a 119th-Congress
  dashboard the right boundary and the right ACS data are both 119th CA-3**; using CA-6 now
  would show a district he does not represent yet.
- **Census already has 120th-Congress geography.** TIGERweb layer 0 "120th Congressional
  Districts" is live, and the Census BEF page says ten states submitted new plans (AL, CA,
  FL, LA, MO, NC, OH, TN, TX, UT)
  ([120th BEF page](https://www.census.gov/geographies/mapping-files/2027/dec/rdo/120-congressional-district-bef.html);
  read through a page summariser, so treat the list as unconfirmed; ADR 0012 records why).
  Cross-check I ran: comparing `AREALAND` per district between layer 0 and layer 4 flags
  changed districts in exactly those ten states plus small differences in IL (6) and SC (4)
  that are probably boundary clean-ups, not new plans.
  - Of the 10 tracked House districts, **3 differ in the 120th layer**: CA-3 (Kiley, 56,117 to
    8,770 km2), CA-17 (Khanna, 464 to 469 km2) and LA-4 (M. Johnson, 37,823 to 33,222 km2).
    The other 7 are identical.
  - The 120th `cb_2026` / `tl_2026` **files are not published yet**: `TIGER2026/` and
    `GENZ2026/` on www2.census.gov return 404. Census says 120th products "are released on a
    flow basis". Missouri's 120th plan is in flux (a 2026-09-03 state Supreme Court ruling,
    same BEF page).
  - Consequence: a build that keys the map on `(fips_state, district)` alone will silently
    change meaning on 2027-01-03. The vintage (`cd119` vs `cd120`) has to be a column, and a
    member's boundary has to be joined through their term's Congress. This is a data-model
    point for the scope decision, not something to fix now.

### Sizes (measured from the real files)

Full-resolution and generalized shapefile downloads (one national file each):

| File | Zip size |
|---|---|
| cb_2025_us_cd119_500k | 6.7 MB (7,067,743 B) |
| cb_2025_us_cd119_5m | 2.0 MB (2,095,960 B) |
| cb_2025_us_cd119_20m | 0.4 MB (409,687 B) |
| cb_2025_us_state_500k / 5m / 20m | 3.1 MB / 1.1 MB / 0.18 MB |

Per-shape SVG path length, projected (cos-latitude scaling) into a 300 px box, one decimal
place, computed from those files. "Tol" is an extra Douglas-Peucker simplify in degrees:

| CD resolution | Tol | 10 tracked districts | All 435 districts | Largest district (Alaska) |
|---|---|---|---|---|
| 500k | 0 | 182.5 KB | 6.8 MB | 1.08 MB |
| 500k | 0.005 | 25.0 KB | 922 KB | 152 KB |
| 5m | 0 | **50.4 KB** (gz 18.8 KB) | 1.9 MB | 105 KB |
| 5m | 0.005 | 20.2 KB (gz 8.4 KB) | 662 KB | 61 KB |
| 5m | 0.02 | 7.3 KB (gz 3.6 KB) | 250 KB | 28 KB |
| 20m | 0 | 9.2 KB | 318 KB | 22 KB |

Per tracked district at 5m with no extra simplify: 0.4 KB (NY-8, dense urban) to 5.3 KB
(KY-4). Mean over all districts is 4.3 KB. States, 8 tracked / all 56 at 5m: 165 KB / 994 KB
unsimplified (Michigan and California dominate at 27-33 KB each), **13.4 KB / 91 KB at
tol 0.02**; at 20m: 25 KB / 146 KB unsimplified.

Visual quality at these levels was **not inspected** (no image was rendered). A 5m district
with tol 0.005 is a reasonable first guess for a 200-300 px thumbnail; the choice of level
needs a look at rendered output before it is fixed.

## 2. Demographics (ACS 5-year)

### Release and geography

- **Latest: 2020-2024 ACS 5-year, released 2026-01-29**, and its congressional-district data
  "are based on the 119th Congress"
  ([ACS 5-year developer page](https://www.census.gov/data/developers/data-sets/acs-5year.html)).
  So the newest 5-year product **matches the boundaries above with no reconciliation**.
- The 2025 ACS 1-year has **no release date**: Census is assessing a new Commerce disclosure
  avoidance order and says it is "seeking DAO-compliant solutions to allow the release of the
  ACS 1-year tables later this year"
  ([ACS 2026 updates](https://www.census.gov/programs-surveys/acs/news/updates/2026.html),
  page updated 2026-08-06). The next 5-year (2021-2025) would be the first plausible
  120th-boundary release, and Census has published nothing about its date or CD basis. For
  Kiley's new CA-6 there is **no ACS product yet**.
- The 2024 5-year API advertises `congressional district` (requires `state`, wildcard on
  state) on the detailed tables, `/profile` and `/subject`, and only `state` on `/cprofile`.
  Endpoints: `api.census.gov/data/2024/acs/acs5`, `.../acs5/profile`, `.../acs5/subject`.

### API access: a key is required now, contrary to the docs

- The Census Data API User Guide (through its July 2024 edition) says up to 50 variables per
  query and 500 queries per IP per day without a key, more with a key
  ([user guide](https://www.census.gov/content/dam/Census/data/developers/api-user-guide/api-user-guide.pdf)).
  I could not read the current (May 2026) edition's text.
- **Observed 2026-09-20: keyless requests are refused.**
  `https://api.census.gov/data/2024/acs/acs5?get=NAME,B01003_001E&for=state:55` returned
  `302` with `X-DataWebAPI-KeyError: 1` to `https://api.census.gov/data/missing_key.html`,
  whose text reads "A valid key must be included with each data API request." The ACS
  developer page also says all queries require a key. The `variables.json`, `groups.json`
  and `geography.json` metadata endpoints do work keyless (that is how the variable labels
  below were verified).
- A key is free (request form at <https://www.census.gov/data/developers/api-key.html>,
  emailed). **It needs Zach to request it**; I did not and cannot. A `CENSUS_API_KEY` secret
  would join `CONGRESS_GOV_API_KEY` and `FEC_API_KEY` (PLAN.md section 3). No published
  per-key rate limit was found; the 500/day figure is the keyless one from older guides.
- **Consequence for this research:** no ACS estimate was fetched, so **no demographic figure in
  this report was checked against real values**. What is verified is that the variables exist
  in the 2024 5-year metadata, their labels, and the geography.

### Request shape

`GET https://api.census.gov/data/2024/acs/acs5/profile?get=NAME,DP05_0001E,DP05_0001M,...&for=congressional%20district:*&in=state:*&key=KEY`

The geography metadata marks state as wildcardable, so **one request returns all districts**
(about 441 rows), up to 50 variables per call. A state-level call is the same with
`for=state:*`. `NAME` returns the district label. Every estimate `E` has a margin of error
`M`, which the mart would need to carry (ACS figures are estimates, not counts).

### What exists (labels checked in `variables.json` for the 2024 5-year)

| Want | Variable(s) | Confirmed label |
|---|---|---|
| Total population | `DP05_0001E`/`M` (or `B01003_001E`) | "Total population" |
| Median age | `DP05_0018E` (or `B01002_001E`) | "Median age (years)" |
| Median household income | `DP03_0062E` (or `B19013_001E`) | "Median household income (dollars)", in 2024 inflation-adjusted dollars |
| Education | `DP02_0068PE`, `DP02_0067PE` | Bachelor's degree or higher; high school graduate or higher (pop. 25+) |
| Unemployment | `DP03_0009PE` | "Unemployment Rate" (civilian labor force) |
| Poverty | `DP03_0128PE` | All people below poverty level |
| Race and ethnicity | `B03002_003E` etc. (Hispanic origin by race, mutually exclusive) or `DP05_0037PE` etc. | White alone non-Hispanic is `B03002_003E`; the other B03002 cells not individually checked |
| Households, housing units | `DP02_0001E`, `DP04_0001E` | Total households; total housing units |

Table groups also exist for foreign-born (`B05002`), commuting (`B08301`), health insurance
(`B27001`), internet access (`B28002`), poverty (`B17001`), home value (`B25077`).
1,199 detailed-table groups in all.

### Urban/rural is not an ACS field

Searching the 2024 5-year metadata (28,475 detailed, 1,427 profile, 19,120 subject
variables) finds no urban/rural table; the only hit is the geography name `UA`.
The Census source is the **119th CD to Urban and Rural Population and Land Area relationship
file** (2020 Census blocks):
`https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/CD119_UR_POPAREA.txt`
(29 KB, keyless, dated 2024-10-15; listed on the
[relationship files page](https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.2020.html)).
Problems found opening it:
- Only **429 rows in 44 states**. The six at-large states (AK, DE, ND, SD, VT, WY), DC and
  the territories are absent. Vermont is one of the tracked senators' states, so the state
  level needs another source (probably 2020 Census DHC table P2 through the decennial API,
  which needs the same key; **not verified**).
- The header column is `GEOID_CD11820`, which reads like a 118th label on a file named CD119.
  Row counts by state look like the 119th (CA 52, NC 14, AL 7, LA 6, NY 26), but I did not
  prove the mapping, so verify before relying on it.
- Values are the **2020 decennial** classification (e.g. CA-6 in the file: 99.57% urban),
  a different year and method from the ACS columns beside it.

### The population figure

Two defensible numbers for "population represented": the ACS 5-year estimate (with margin of
error, 2020-2024 average) or the 2020 Census apportionment count (exact, about 760,000 per
district by construction, but four years old). The ACS figure is the one comparable to the
other columns and to other trackers; the count is what the constitution requires. Which to
headline is a product decision. TIGERweb's `POP100` field was empty for the 119th layer, so
the 2020 count is not available from that service.

## 3. Rendering

- The site is a static export with no map library and a thin-frontend rule. A slippy map
  (Leaflet / MapLibre) would add a client-side dependency, tile hosting or a third-party tile
  provider, and client JS to a site that has none. For one district or state outline it buys
  nothing: no zoom or pan is asked for.
- **A stored SVG path fits the existing pattern.** Project and simplify once at ingest (Python,
  where the other derived values are computed), store the `d` string and a `viewBox` in a mart
  column with provenance, and let the component render `<svg><path d=... /></svg>`. That keeps
  the "frontend computes nothing" rule literally: no projection, no simplification, no
  geometry math in the browser. It is also crisp at every size, themeable with the design
  tokens, and needs no image pipeline.
- Sizes make it viable: the 10 tracked districts are 20 KB of path (8 KB gzipped) at 5m with
  tol 0.005, and the 8 states 13 KB at tol 0.02. Rendered into each member page's static HTML
  it is 1-5 KB per page, against the 178 MB bill-page output that PLAN.md section 12 already
  flags. It adds no files to the deploy.
- A pre-rendered PNG at build time is worse than inline SVG here: more files (Vercel's file
  count is the binding limit per PLAN.md section 12), no theming, blurry on high-DPI screens.
- Unresolved design questions that need Zach or the mockup: projection (plain cos-latitude was
  used for the measurements; Albers is the convention for the lower 48), how Alaska,
  Hawaii and multi-part districts (islands) are drawn, and whether a House district should sit
  inside a faint state outline (it needs the state path too, +1-30 KB).

## 4. Scale check

The unit of work is the **constituency**, not the member. All 435 districts and all states
come from the same national files and the same API calls whether 20 or 535 members are tracked.

| | 20 tracked members (18 constituencies) | 100+ members | All 535 |
|---|---|---|---|
| Boundary downloads | 2 national zips (cd119 5m 2.1 MB + state 5m 1.1 MB), or 2 zips even at 500k (10 MB) | same 2 | same 2 |
| ACS API requests | ~4-6 (profile in 1-2 calls, B03002 in 1, state-level repeats): `for=congressional district:*&in=state:*` is one call for all 441 districts; 50 variables per call | same ~4-6 | same ~4-6 |
| Other downloads | urban/rural file (29 KB), 1 request | same | same |
| Rows written | if loaded whole (ADR 0002): ~441 districts + ~56 states demographic rows, about 30-60 columns, tens of KB | same | same |
| SVG path bytes stored | 50 KB (10 districts, 5m, unsimplified); ~20 KB with tol 0.005; +13 KB states | ~4.3 KB/district mean, so ~0.4-0.5 MB for 100 districts | 0.66-1.9 MB for all 435 districts (5m), 91 KB-1 MB states |
| Added per-page HTML | 1-5 KB per member page | same | same |
| Nightly cost | none (annual data: refresh on release or redistricting only) | none | none |

So this does not have the bill-page scaling problem: request count is flat in the member
count, storage is under 2 MB even for everyone (Neon's 0.5 GB free tier is not a concern),
and it adds no route or file to the deploy. It is closer to the composition seed (ADR 0012)
than to bills: a small reference dataset refreshed rarely. The two things that grow with time
are vintages (a 120th set in 2027, then 121st) and, at 435 members, the Alaska path (1 MB at
500k, 105 KB at 5m; simplify it).

Loading the whole nation rather than only tracked constituencies follows ADR 0002 and makes
adding a member a seed change with no new ingestion.

## 5. Verdict and proposed v1

### Buildable now with confidence

1. **Population, median age, median household income, education, poverty, unemployment, and
   race/ethnicity** for the 435 districts and the states, from the 2020-2024 ACS 5-year via
   the API (one wildcard request per table group, 119th boundaries, matches current members).
   Store estimates **with margins of error** and the `2020-2024` label; ADR 0002 applies.
   Dependency: a Census API key (Zach requests; one Actions secret).
2. **A static SVG outline** per current constituency (119th district for House members, state
   for Senate), generated at ingest from `cb_2025_us_{cd119,state}_5m` with a light simplify,
   stored as path plus viewBox in the mart, drawn as a plain `<svg>`.

### Uncertain and needs a second look

- **Urban/rural**: the file has gaps (6 at-large states, DC, territories), a mislabelled
  header, and is 2020 decennial rather than ACS. Needs a source for the at-large states and a
  check of the column mapping. Ship without it, or show it only where it exists and say why.
- **120th Congress handling**: keyed how? A `congress`/vintage column is needed on the
  boundary and demographic rows before anyone sees a Constituency tab that will be wrong for
  three tracked members (Kiley, Khanna, M. Johnson) on 2027-01-03 and has no ACS backing at
  all for Kiley's new district until the 2021-2025 5-year exists. Decide before building,
  and probably as an ADR, because it changes the natural key in ADR 0001.
- **Headline population**: ACS estimate vs 2020 count (section 2).
- **SVG fidelity and projection**: not looked at; needs a rendered sample.
- **Live ACS values**: nothing verified. First build step should be a value check against
  `data.census.gov` or Census's `My Congressional District` tool, as the fundraising
  panel was checked against the FEC to the cent.
- **Census's "no key" documentation vs the live redirect**: worth one email to
  census.data@census.gov only if the key turns out to have a low daily limit.

### Not realistically free or automatable

- **County results and county splits** (both promised by the mockup copy): county-to-district
  splits are free (`cb_2025_us_county_within_cd119_500k.zip`, 12 MB, not examined in detail),
  but "county results" means election returns, which are not Census data and were out of
  scope here. Treat as a separate sourcing question.
- **ACS for the 120th boundaries**: not available from Census yet, and the 2025 1-year that
  would carry it has no date. Not something to build against.

### Separate build phases: yes

The two pieces have different sources, keys, risks and failure modes, and can ship
independently:

1. **Phase A, demographics**: Census key, ACS ingest, `mart.constituency_demographics` (or
   columns on `mart.constituency`, see the vintage question), API endpoint, Constituency tab
   populated. Blocked on the key and the population-headline decision.
2. **Phase B, map**: shapefile conversion, simplification, stored path, SVG component.
   No key, no dependency on Phase A, but it needs the projection and simplify decision and
   depends on the same vintage decision.

Doing the vintage/key decision as a small ADR first would keep both phases from encoding the
119th-only assumption.

## Sources consulted

- Census cartographic boundary files: <https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html>; directory <https://www2.census.gov/geo/tiger/GENZ2025/shp/>; TIGER/Line <https://www2.census.gov/geo/tiger/TIGER2025/CD/>
- TIGERweb Legislative MapServer: <https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer> (layer 0 = 120th, layer 4 = 119th)
- About Congressional Districts: <https://www.census.gov/programs-surveys/geography/guidance/geo-areas/congressional-dist.html>
- 119th wall maps (redistricted states): <https://www.census.gov/geographies/reference-maps/2025/geo/cong-dist-119-wall.html>
- 120th Congress BEFs: <https://www.census.gov/geographies/mapping-files/2027/dec/rdo/120-congressional-district-bef.html>
- ACS 5-year API page: <https://www.census.gov/data/developers/data-sets/acs-5year.html>; 1-year: <https://www.census.gov/data/developers/data-sets/acs-1year.html>; ACS 2026 updates: <https://www.census.gov/programs-surveys/acs/news/updates/2026.html>
- ACS metadata (keyless): `https://api.census.gov/data/2024/acs/acs5/{variables,groups,geography}.json`, and `/profile`, `/subject`, `/cprofile` variants
- API key page and missing-key notice: <https://www.census.gov/data/developers/api-key.html>, <https://api.census.gov/data/missing_key.html>; API user guide <https://www.census.gov/content/dam/Census/data/developers/api-user-guide/api-user-guide.pdf>
- 119th CD ACS press release: <https://www.census.gov/newsroom/press-releases/2024/acs-119th-congress.html>
- Relationship files: <https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.2020.html>, file `https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/CD119_UR_POPAREA.txt`
- Kiley and Proposition 50: <https://calmatters.org/politics/2026/03/kevin-kiley-chooses-reelection-district/>, <https://www.capradio.org/articles/2026/09/16/meet-the-candidates-running-in-sacramentos-new-congressional-district-6/>

Method notes: file sizes are `Content-Length` from the Census servers. SVG sizes came from a
throwaway script (pyshp + shapely, cos-latitude projection, one decimal, Douglas-Peucker at
the stated tolerance) run against the 2025 cb shapefiles. The mart state was read from the
local Docker database on 2026-09-20.
