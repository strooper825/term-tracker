# Data dictionary

Every table the pipeline creates, by schema. Updated in the same PR as any migration that adds
or changes a table (docs/PLAN.md, section 11).

## Schemas

| Schema | Written by | Purpose |
|---|---|---|
| `raw` | `ingest/` | Source payloads as JSONB plus extracted natural-key columns. One table per source entity. |
| `staging` | dbt | Typed, renamed views over `raw` (`stg_*`). |
| `mart` | dbt | Tables the API reads. Every mart table carries `source`, `source_url`, `fetched_at`. |
| `seed` | dbt seeds | Hand-maintained inputs: `fips`, `tracked_members`, `key_dates`, `composition_seats`. |
| `meta` | `ingest/` and Alembic | Operational metadata about the pipeline itself. |

Alembic's own `alembic_version` table lives in `public`.

## `meta.ingest_run`

One row per ingestion run of one source. Backs `GET /api/v1/meta/freshness` and the nightly
freshness check (`python -m ingest.freshness`), both of which read the latest
`status = 'success'` row per `source`.

| Column | Type | Null | Description |
|---|---|---|---|
| `id` | bigint identity | no | Primary key |
| `source` | text | no | Source name, e.g. `legislators`, `congress_gov`, `senate_votes` |
| `source_url` | text | yes | Base URL the run fetched from, for provenance |
| `status` | text | no | `running`, `success`, or `failed` (check constraint) |
| `started_at` | timestamptz | no | Defaults to `now()` |
| `finished_at` | timestamptz | yes | Set when the run ends, whatever the outcome |
| `rows_loaded` | integer | yes | Rows upserted by the run |
| `error` | text | yes | Error message for failed runs |

Index: `ix_ingest_run_source_finished_at (source, finished_at)`.

Migration: `migrations/versions/20260912_0001_initial_schemas.py`.

## Raw tables: congress-legislators (Alembic migration `0002`)

All three share `payload jsonb`, `source_url text`, `fetched_at timestamptz` and are upserted
whole from the unitedstates/congress-legislators YAML files (see ADR 0002). Dates in payloads
are ISO strings.

| Table | Key | One row per |
|---|---|---|
| `raw.legislator` | `bioguide_id` | current member of Congress (`legislators-current.yaml`) |
| `raw.committee` | `thomas_id` | top-level committee; subcommittees nested in `payload.subcommittees` (`committees-current.yaml`) |
| `raw.committee_membership` | `committee_id` | committee or subcommittee id (e.g. `HSBA`, `HSBA21`); payload is its member list (`committee-membership-current.yaml`) |

## Raw tables: Congress.gov bills (Alembic migration `0003`)

Loaded by `python -m ingest.run --source congress_gov_bills` for every member in
`seed.tracked_members`, current Congress only (`CURRENT_CONGRESS`, default 119). All rows share
`payload jsonb`, `source_url text`, `fetched_at timestamptz`. `bill_type` is the lower-case
Congress.gov type: `hr`, `s`, `hres`, `sres`, `hjres`, `sjres`, `hconres`, `sconres` for bills
and `hamdt`, `samdt`, `suamdt` for amendments, which Congress.gov lists under Sponsored and
Cosponsored Legislation and which are kept here for that reason.

| Table | Key | One row per |
|---|---|---|
| `raw.member_legislation` | `bioguide_id`, `role`, `congress`, `bill_type`, `bill_number` | list item of `/member/{id}/sponsored-legislation` or `/cosponsored-legislation` |
| `raw.bill` | `congress`, `bill_type`, `bill_number` (+ `kind` = bill or amendment) | detail record from `/bill/...` or `/amendment/...` |
| `raw.bill_actions` | same | full actions list (payload is the JSON array) |
| `raw.bill_cosponsors` | same | full cosponsors list (payload is the JSON array) |

The detail record is re-fetched every run. Its dependent lists -- actions, cosponsors, and
(bills only) CRS summaries -- are re-fetched when the detail `updateDate` changed, and any list
that was never stored is fetched on its own; `--full-refresh` re-reads all of them. Bills
referenced by roll calls in `raw.house_vote` (`legislationType`/`legislationNumber`) and
`raw.senate_vote` (`document_type`/`document_number`, bill types only) get the same treatment,
because every row of `mart.bill` has a detail page. Run the vote sources before this one
(`--source all` does).

Source quirk (verified 2026-09-12): on the cosponsored list the item `introducedDate` is the
date the member cosponsored, not the introduction date. List-item dates are therefore never
used downstream.

## Raw tables: roll-call votes (Alembic migration `0004`)

Loaded by `python -m ingest.run --source congress_gov_house_votes` and
`--source senate_votes` for the current Congress. Every member position is stored, not only
the tracked members, because party-unity statistics need the whole chamber. All rows share
`payload jsonb`, `source_url text`, `fetched_at timestamptz`.

| Table | Key | One row per |
|---|---|---|
| `raw.house_vote` | `congress`, `session`, `roll_number` | item of Congress.gov `/house-vote/{congress}/{session}` |
| `raw.house_vote_members` | same | `/house-vote/{congress}/{session}/{roll}/members` object; positions under `results[]` (`bioguideID`, `voteCast`) |
| `raw.senate_vote_menu` | `congress`, `session` | senate.gov `vote_menu_{c}_{s}.xml` as JSON |
| `raw.senate_vote` | `congress`, `session`, `vote_number` | senate.gov `vote_{c}_{s}_{n}.xml` as JSON; positions under `members.member[]` (`lis_member_id`, `vote_cast`) |

Sessions are walked from 1 until Congress.gov returns an empty list or senate.gov has no
menu (HTTP 404). House member lists are re-fetched when the list item `updateDate` changes;
Senate roll calls are fetched once (senate.gov publishes no update stamp) unless
`--full-refresh` is passed. XML becomes JSON via xmltodict with `vote` and `member` always
lists; nothing else is altered.

## Raw tables: CRS bill summaries (Alembic migration `0006`)

| Table | Key | One row per |
|---|---|---|
| `raw.bill_summaries` | `congress`, `bill_type`, `bill_number` | bill; payload is the full `summaries` array from `/bill/{c}/{t}/{n}/summaries`, every version, oldest first |

Loaded by the `congress_gov_bills` source alongside actions and cosponsors. Source shape
(verified 2026-09-13): each item carries `versionCode` (stage code: `00` Introduced, `07`
Reported, `53` Passed House, `55` Passed Senate, `49` Public Law), `actionDate`, `actionDesc`,
`updateDate`, and `text` as HTML. A bill with no summary returns an empty list rather than a
404, and that empty array is stored, which is what keeps the nightly from re-asking. The
endpoint does not exist for amendments (it answers 404), so amendments never have a row here.

## Raw tables: OpenFEC (Alembic migration `0005`)

Loaded by `python -m ingest.run --source fec` for every member in `seed.tracked_members`,
current cycle only (`fec_cycle`, derived from `CURRENT_CONGRESS`: 119 -> 2026). All rows share
`payload jsonb`, `source_url text`, `fetched_at timestamptz`. Every record is re-fetched each
run (about four requests per member; `--full-refresh` changes nothing for this source). See
ADR 0006 for what is and is not loaded.

| Table | Key | One row per |
|---|---|---|
| `raw.fec_candidate` | `candidate_id` | `/candidate/{id}/` record for every id in the member's congress-legislators `id.fec` list, old offices included; `bioguide_id` links it back |
| `raw.fec_committee` | `committee_id`, `cycle` | item of `/candidate/{id}/committees/?cycle=` for the member's current-office candidate: every committee linked to the candidate in the cycle (`candidate_id` column), whatever its designation |
| `raw.fec_committee_totals` | `committee_id`, `cycle` | `/committee/{id}/totals/?cycle=` record of the principal campaign committee |

Source shapes (verified 2026-09-13): the totals endpoint has no `cash_on_hand_end_period`;
cash on hand and debts are `last_cash_on_hand_end_period` and `last_debts_owed_by_committee`.
House and Senate committees both report transfers as
`transfers_from_other_authorized_committee`. Candidate totals (`/candidate/{id}/totals/`)
equal the committee totals for all six tracked members (no second authorized committee).
The key reports a 60-requests-per-minute limit in `X-RateLimit-Limit` on top of the
documented 1,000 per hour; the client throttles on both.

## Raw tables: Census boundaries and ACS (Alembic migration `0007`, ADR 0015)

Loaded by `python -m ingest.run --source census_geography` and `--source census_acs`, for the
whole nation, not only the tracked members (ADR 0002). Both share `payload jsonb`,
`source_url text`, `fetched_at timestamptz`.

| Table | Key | One row per |
|---|---|---|
| `raw.constituency_geometry` | `congress`, `geoid` | state (`geoid` 2 digits) or House district (`geoid` state + district: `5501`; `0200` at large; `1198` DC's delegate) in the Congress's lines |
| `raw.acs_estimate` | `acs_year`, `geoid` | state or district in an ACS 5-year release; `acs_year` is its last year (2024 is 2020-2024) |

`raw.constituency_geometry.payload` is finished SVG path data, not geometry (projection,
simplifying and clipping cannot be done in dbt; `ingest/geometry.py`): `name`, `frame`
(`width`, `height`, the viewBox is `0 0 width height`), `outline` (the shape in its own frame),
`counties` (list of `geoid`, `name`, `d`), and `county_source_url`; a district row adds `in_state`
(the district drawn in its state's frame) and `state_geoid`. `source_modified` holds the
`Last-Modified` of the three source zips at load time, which is how the next run knows the files
have not changed (a run that finds them unchanged loads nothing and still records a success).
Source: `cb_{year}_us_{state,cd{congress},county}_500k.zip` from
https://www2.census.gov/geo/tiger/GENZ{year}/shp/, the Census cartographic boundary files
(shoreline-clipped; TIGERweb's polygons are not, ADR 0015). On 2026-09-20: 56 states, 441
districts (435 plus five delegates and the Resident Commissioner), 3,235 counties, 497 rows,
4.5 MB of payload.

`raw.acs_estimate.payload` is `name` plus, per dataset, every variable the Data API returned
for it, verbatim (strings, and the Census "-666666666" for a value it could not compute): `profile`
(`DP05_0001E` population, `DP05_0018E` median age, `DP03_0062E` median household income,
`DP02_0001E` households, `DP02_0068PE` bachelor's degree or higher, `DP02_0067PE` high school or
higher, `DP03_0009PE` unemployment rate, `DP03_0128PE` poverty rate; each with its `M` margin of
error) and `detail` (B03002, Hispanic or Latino origin by race). `congress` is the Congress whose
district lines the release uses, from `ACS_CONGRESS` in `ingest/census.py`. Four requests load
every state and district. The Data API needs `CENSUS_API_KEY`.

## Seeds (`seed` schema, dbt)

| Table | Key | Description |
|---|---|---|
| `seed.fips` | `fips_state` | Census state FIPS reference: `fips_state` (2-char, zero-padded), `state_abbr`, `state_name`, `statens`. Source and retrieval date are dbt vars `fips_source_url` / `fips_fetched_at`. |
| `seed.tracked_members` | `bioguide_id` | Members in scope (the plan calls this `tracked_member`). Columns `bioguide_id`, `note`. Twenty members: Steil, Cotton, Sanders, Slotkin, Kiley, Jeffries, Crawford, R. Johnson, Baldwin, McConnell, Pocan, Ossoff, Boozman, Murphy, Schiff, Massie, Khanna, Ocasio-Cortez, M. Johnson, Perry. |
| `seed.key_dates` | `date`, `label` | Hand-maintained calendar (plan `key_date`): `date`, `label`, `kind` (election, session, deadline, recess), `scope` (congress, chamber, state, member), `scope_value`, `note`, `source_url`. Retrieval date is the dbt var `key_dates_fetched_at`. State rows exist for WI, AR, VT, MI, CA, NY, KY, GA, CT, LA, PA (2026 primaries and filing deadlines, each with a statute or election-authority URL); a member whose state has no rows still gets the congress-scoped rows. Recesses not seeded yet. |
| `seed.composition_seats` | `chamber`, `party_group` | Hand-maintained party split of the 435 House and 100 Senate seats (ADR 0012): `chamber` (`house`/`senate`), `party_group` (`republican`, `democratic`, `independent`, `vacant`), `seats`, `caucus_with` (independents only). Typed from the Clerk of the House and Senate.gov; provenance is the dbt vars `composition_as_of`, `composition_house_source_url`, `composition_senate_source_url`. The warning test `assert_composition_matches_legislators` compares it with `raw.legislator`. Seeded 2026-09-19: House 218 R, 214 D, 1 I (caucus R), 2 vacant; Senate 53 R, 45 D, 2 I (caucus D). |

## Staging views (`staging` schema, dbt)

`stg_legislators` (names, `bio` birthday and gender, external ids), `stg_legislator_terms`
(one row per term, `chamber` mapped from `rep`/`sen` to `house`/`senate`, plus `caucus`,
`party_affiliations`, `how`, `end_type`), `stg_legislator_leadership_roles` (one row per
entry of `leadership_roles`), `stg_committees` (committees and subcommittees flattened;
subcommittee `thomas_id` = parent id + suffix), `stg_committee_memberships` (one row per
committee member).

Bills: `stg_member_legislation` (list items), `stg_bills` (detail records; amendment titles are
composed from description, purpose, or the amended bill), `stg_bill_actions` (one row per
(bill, date, action text), see below), `stg_bill_cosponsors` (one row per cosponsor).

Votes: `stg_house_roll_calls`, `stg_house_member_votes` (every member), `stg_senate_roll_calls`
(dates parsed from "January 9, 2025, 02:54 PM" Eastern; Senate document types such as `S.` and
`H.R.` mapped to `bill_type`, nominations `PN` kept in `document_type`/`document_number`),
`stg_senate_member_votes` (every senator, `lis_member_id` joined to `stg_legislators.lis_id`
for `bioguide_id`). Positions are normalised by macro `normalize_position` (ADR 0004).

`stg_bill_summaries` unnests `raw.bill_summaries`: one row per version with `version_code`,
`seq` (position in the upstream array, which breaks a tie when two versions share a date),
`action_date`, `action_desc`, `text_html`, `update_date`. `stg_bill_cosponsors` also carries
the cosponsor's `full_name`, `display_name`, `party`, `state` and `district`, and `stg_bills`
the sponsor's, because the bill pages name everyone rather than only tracked members.

FEC: `stg_fec_candidates` (one row per candidate id: `office`, `state`, `district`,
`candidate_status`, `cycles`), `stg_fec_committees` (`designation`, `committee_type`,
`last_file_date`), `stg_fec_committee_totals` (every amount typed as `numeric(14,2)`;
`cash_on_hand` and `debts` from the `last_*` columns).

`stg_constituency_geometry` (typed `raw.constituency_geometry`: `fips_state`, `district` null for a
state and 0 for at large or a delegate, the frame size, paths and counties) and `stg_acs_estimates`
(one row per state and district: the ACS variables as numbers with their `_moe`; the Census
"could not compute" sentinels, anything below -100,000,000, become null through the macro
`acs_number`).

## Mart tables (`mart` schema, dbt)

Every table carries `source` (`legislators` or `census_fips`), `source_url`, `fetched_at`.

### `mart.constituency`

Natural key `(fips_state, district)`; `district` NULL is the state itself, 0 an at-large
district (ADR 0001). States come from the FIPS seed; districts from current House terms.

| Column | Type | Description |
|---|---|---|
| `fips_state` | text | Census state FIPS |
| `district` | int | NULL for the state; 0 for at-large |
| `state_abbr`, `state_name` | text | From the FIPS seed |
| `label` | text | `Wisconsin`, `WI-1`, `AK (At Large)` |

### `mart.constituency_demographics`

Who lives in a state or House district, one row per geography per ACS 5-year release. Natural key
`(acs_year, fips_state, district)`; `district` is null for the state, 0 at large (ADR 0001).
`congress` is the Congress whose district lines the release uses (119 for 2020-2024), which is
what joins a row to a member's term (ADR 0015). Every estimate has a margin of error `_moe` at 90
percent confidence; a null is a value the Census could not compute, never zero. `period` is
`2020-2024`.

| Column | Description |
|---|---|
| `population`, `median_age`, `median_household_income` (dollars of the last year), `households` | Estimates, each with `_moe` |
| `bachelors_or_higher_pct`, `high_school_or_higher_pct` | Percent of people 25 and over, with `_moe` |
| `unemployment_pct` | Percent of the civilian labor force, with `_moe` |
| `poverty_pct` | Percent of all people below the poverty level, with `_moe` |
| `race_total`, `race_{white,black,native,asian,pacific,other,multiple,hispanic}_pct` | B03002 shares of the total, two decimals. Every group but `hispanic` is non-Hispanic, so they do not overlap and sum to 100 (`assert_constituency_demographics_consistent`). The shares carry no margin of error |

`source` is `census_acs`; `source_url` the Data API endpoint (it needs a key to open, so the site
links the public ACS page instead). Not loaded: urban/rural (no ACS table; ADR 0015), and
anything for the 120th Congress's lines.

### `mart.member_constituency`

One row per tracked member: the constituency they represent in the tracked Congress (dbt var
`current_congress`) and its map. A senator's constituency is the state, a House member's the
district. Key `bioguide_id`.

| Column | Description |
|---|---|
| `chamber`, `congress`, `fips_state`, `state_abbr`, `district`, `label`, `geoid` | The seat; `district` null for a senator, 0 at large; `label` from `mart.constituency` |
| `has_map` | The state's map exists for the tracked Congress. False rather than a wrong shape when the Census has not published that Congress's lines |
| `map_state` | jsonb: the state view, `width`, `height`, `outline`, `counties` (list of `geoid`, `name`, `d`), and `district`, the member's district in the state's frame (null for a senator and at large) |
| `map_district` | jsonb: the district view in its own frame, same keys minus `district`, county lines clipped to the district. Null for a senator and at large |
| `map_source_url`, `map_district_source_url`, `map_county_source_url`, `map_fetched_at` | The three Census files the paths came from |

`GET /members/{id}/constituency` returns it with `mart.constituency_demographics` (the latest
`acs_year` for the member's `congress`, `fips_state` and `district`) as `map.views` (district view
first, then state), `demographics`, and `sources`; each is null when not loaded. The site draws
the paths as given. The dbt test `assert_tracked_constituencies_covered` warns when a tracked
member has no map or no demographics for the tracked Congress.

Verification (ADR 0015): the maps were checked by eye against real districts (WI-1, NY-14) and
their county names; the demographics, once loaded, are to be checked against data.census.gov
(American Community Survey, 2024 5-year, congressional district, 119th Congress) for each tracked
member, read the same day as the ingest. The first nightly run logs each tracked member's
population, margin and median household income for this. No real ACS value had been fetched when
this was written; the figures in the test fixtures are invented.

### `mart.member`

One row per tracked member. Key `bioguide_id`.

| Column | Type | Description |
|---|---|---|
| `first_name`, `middle_name`, `last_name`, `nickname`, `suffix`, `official_full_name` | text | From congress-legislators `name`; middle, nickname, and suffix are null when the source has none |
| `birthday` | date | From `bio.birthday`; the API derives `bio.age` from it at request time |
| `gender` | text | `M` or `F`, as the source records it |
| `govtrack_id`, `icpsr_id` | int | For later joins (Voteview uses ICPSR) |
| `lis_id` | text | Senate LIS id, the key on senate.gov vote records |
| `fec_ids` | jsonb | Array of FEC candidate ids (Phase 2) |
| `opensecrets_id`, `wikipedia_id`, `ballotpedia_id`, `wikidata_id` | text | External ids from `id`; Wikipedia and Ballotpedia hold the page title |
| `cspan_id`, `votesmart_id` | int | External ids from `id` |
| `photo_url` | text | Congress.gov member image convention; replaced by the API value in Phase 1b |

Source fields not captured (kept only in `raw.legislator.payload`): `id.thomas`,
`id.maplight`, `id.house_history`, `id.google_entity_id`, `id.pictorial`, `family`, and
`other_names`. The per-term contact block is in `mart.member_contact`.

### `mart.term`

Tracked member-terms overlapping the current Congress. Natural key
`(bioguide_id, congress, chamber, start_date)`.

| Column | Type | Description |
|---|---|---|
| `congress` | int | Congress in session when the term began (macro `congress_number`) |
| `end_congress` | int | Congress in session on the day before the term ends; the term spans `congress` through `end_congress` (a six-year Senate term from 2021-01-03 gives 117 through 119) |
| `chamber` | text | `house` / `senate` |
| `start_date`, `end_date` | date | From the source term |
| `state_abbr`, `fips_state`, `state_name` | text | Joined to the FIPS seed |
| `district` | int | House only |
| `senate_class`, `state_rank` | int, text | Senate only |
| `party` | text | Party during the term (the latest one when it changed mid-term) |
| `caucus` | text | For Independents, the party they caucus with (`Democrat` / `Republican`); null otherwise |

### `mart.term_history`

Every term a tracked member has served, in source order. Natural key `(bioguide_id,
term_index)`. Same columns as `term` plus `term_index`, `party_affiliations` (jsonb list of
`{start, end, party, caucus}` when the party changed within the term), `how` (`appointment`
or `special-election`), and `end_type` (why a term ended early). Backs the header lines
"serving since" and "Nth term" (see `member_summary`).

### `mart.leadership_role`

Party and chamber leadership roles of tracked members from congress-legislators
`leadership_roles` (Speaker, floor leaders, whips, conference and caucus officers). One row
per role and Congress, so a title held continuously appears once per Congress; `end_date` is
null and `is_current` true while held. Columns `title`, `chamber`, `start_date`, `end_date`,
`is_current`.

### `mart.member_contact`

One row per tracked member, from the latest term in congress-legislators (the per-term contact block
that `mart.member` leaves in `raw.legislator.payload`). Key `bioguide_id`. Columns `website_url`,
`contact_form_url`, `phone`, `fax`, `office` (building and room), `address` (Washington mailing
address), `rss_url`, plus `source`, `source_url`, `fetched_at`. Every column but the key is null when
the source has no value: on 2026-09-19 all 20 members have website, phone, office and address; 8 have
a contact form, 1 a fax and 11 an RSS feed. `GET /members/{id}/contact` returns it; the site's Contact tab shows
what is present, and shows "coming soon" when none of the contact columns has a value. The data is
the member's official office information as congress-legislators records it and can lag a change of
office; it is not verified against the member's own site.

### `mart.committee`

All committees and subcommittees. Key `thomas_id`; `parent_thomas_id` NULL for top-level.
Columns `name`, `chamber` (`house`/`senate`/`joint`), `url`, `jurisdiction`.

### `mart.committee_membership`

Assignments of tracked members. Natural key `(bioguide_id, committee_thomas_id, congress)`.
Columns `rank`, `title` (e.g. `Chair`, `Ranking Member`), `party`. `congress` is the dbt var
`current_congress` because the source file is the current snapshot.

### `mart.bill`

One row per bill or amendment a tracked member sponsored or cosponsored, plus every bill a
loaded roll call references (so vote headlines carry titles). For those roll-call bills only
the detail record is fetched; `bill_action` and cosponsor data exist only for member
legislation. Natural key `(congress, bill_type, bill_number)`.

| Column | Type | Description |
|---|---|---|
| `kind` | text | `bill` or `amendment` |
| `title` | text | Bill title; for amendments the description, purpose, or "Amendment N to ..." |
| `policy_area` | text | Congress.gov policy area (bills only) |
| `introduced_date` | date | Introduction date (bills) or submitted date (amendments) |
| `latest_action_date`, `latest_action_text` | date, text | From the detail record |
| `origin_chamber` | text | Chamber of origin |
| `sponsor_bioguide_id` | text | First sponsor |
| `amended_bill_congress`, `amended_bill_type`, `amended_bill_number` | int, text, text | Amendments only |
| `update_date` | timestamptz | Congress.gov `updateDate`; drives change detection |
| `congress_gov_url` | text | Public page, from macro `congress_gov_url` |

`status` is deliberately absent: see ADR 0003.

Every row has a detail page at `/bills/{congress}/{type}/{number}`, so the row also carries
what that page shows: `label` (the human form from the `bill_label` macro), the sponsor's
`sponsor_name`, `sponsor_full_name`, `sponsor_party`, `sponsor_state`, `sponsor_district` and
`sponsor_is_tracked`, and the counts `cosponsor_count`, `cosponsors_democratic`,
`cosponsors_republican`, `cosponsors_other`, `cosponsors_withdrawn`,
`first_cosponsorship_date`, `last_cosponsorship_date`, `action_count`, `summary_count`,
`has_summary`, `latest_summary_date`, `roll_call_count`.

A zero count means the source published none, never "not fetched yet": the loader stores an
empty array for a bill with no cosponsors or no summary, and the dbt test
`assert_bill_lists_loaded` fails the build if any bill in the mart is missing a list
altogether.

`action_count` counts the rows in `mart.bill_action`, which is what the page lists, and that
is lower than the total Congress.gov reports for the same bill wherever the source publishes
one action more than once. See `stg_bill_actions`: the grain is one row per (bill, date,
action text). 773 of the 1,874 bills loaded on 2026-09-13 have at least one repeat, and
collapsing them removes 1,213 of 12,896 action rows. `assert_bill_summary_one_latest` checks the counts against the rows in
`mart.bill_summary` and `mart.bill_cosponsor`.

### `mart.bill_passage_vote`

One row per passage-type roll call on a bill with a page (`mart.bill`, kind `bill`); ADR 0009.
Natural key `(congress, chamber, session, roll_number)`. Passage questions are matched by the
macro `is_passage_question`: House "On Passage", "On Agreeing to the Resolution[, as Amended]",
"On Motion to Suspend the Rules and Pass|Agree[, as Amended]"; Senate "On Passage of the Bill",
"On the Joint Resolution", "On the Resolution", "On the Concurrent Resolution".

| Column | Description |
|---|---|
| `congress`, `bill_type`, `bill_number` | The bill |
| `chamber`, `session`, `roll_number`, `voted_at`, `vote_date`, `question`, `result` | From `mart.roll_call` |
| `passed` | `result` read by macro `passage_passed`; an unmapped result fails `assert_bill_passage_vote_consistent` |
| `majority_label` | `2/3 required` or `3/5 required` when the source states it (House `vote_type`, Senate `majority_requirement`), else null |
| `is_latest_in_chamber` | The latest passage roll call for the bill in the chamber, the one the journey reads |
| `yea_total`, `nay_total`, `present_total`, `not_voting_total` | Tally |
| `yea_pct`, `nay_pct` | Of Yea plus Nay |
| `yea_republican`, `nay_republican`, `yea_democratic`, `nay_democratic`, `yea_independent`, `nay_independent`, `yea_other`, `nay_other` | Split by the party letter on each member's vote record (R, D, I, other) |
| `*_pct` for each of the eight | Share of Yea plus Nay, so a Yea bar and a Nay bar share one scale |

`source` and `source_url` are the roll call's (`congress_gov` with the House Clerk XML, or
`senate_gov`). Coverage on 2026-09-14: 400 House passage roll calls on 399 bills (20 failed),
63 Senate ones on 60 bills (8 failed); 40 bills have both, 419 of the 1,721 bills either.

### `mart.bill_journey_stage`

One row per stage of a bill's vote journey (kind `bill` only); ADR 0009. Natural key
`(congress, bill_type, bill_number, stage_key)`. Not a status: each stage reads one completed
record.

| Column | Description |
|---|---|
| `stage_key`, `stage_label` | `introduced` Introduced, `house_vote` House vote, `senate_vote` Senate vote, `to_president` To President, `became_law` Became law |
| `stage_order` | 1 is Introduced; chamber votes follow the chamber of origin (S. and S.J.Res.: Senate first). H.Res./S.Res. have one chamber stage; concurrent resolutions no President stages |
| `status`, `status_label` | `complete` (Introduced; To President from action codes E20000, E30000, E40000; Became law from E40000 or type BecameLaw), `passed`/`failed` (latest passage roll call), `vetoed` (E30000 "Vetoed by President." and no law), `no_roll_call` (no passage roll call although a later stage is on record), `not_recorded` (To President with no action although Became law is on record), `pending` |
| `event_date`, `detail` | Introduction date, roll-call date and published result, or the action date and text |
| `vote_chamber`, `vote_session`, `vote_roll_number` | The passage roll call for a `passed` or `failed` stage |
| `ends_journey` | A failed or vetoed stage with nothing recorded after it |
| `is_shown` | False for stages after the one that ends the journey; the API returns shown stages only |

`GET /bills/{congress}/{type}/{number}` returns the shown stages as `journey`, each vote stage
with its passage roll call and party split. Status counts on 2026-09-14 (shown stages): House
vote 380 passed, 19 failed, 12 no roll call; Senate vote 55 passed, 5 failed, 39 no roll call;
To President 70 presented; Became law 68 enacted, 2 vetoed; 26 journeys end at a failure or
veto, hiding 40 later stages.

### `mart.bill_action`, and how repeated actions are collapsed

Congress.gov publishes the same action for a bill more than once on the same day: sometimes
byte for byte, more often under a different action code, from a different source system, or
filed under a different type. "Introduced in House" arrives under both `Intro-H` and `1000`,
and a committee report arrives from both the Library of Congress and House floor actions.
Collapsing only byte-identical rows (the Phase 1b rule) left both on the bill page.

The grain is therefore **one row per (bill, action date, action text)**, with `action_hash` =
md5 of the date and that text. An action with no text keys on its code instead, so two
untitled actions on one day stay apart. The surviving row keeps the code, time and type of the
first occurrence in the upstream array and adds:

| Column | Description |
|---|---|
| `source_system` | Every source that reported it, joined: `House floor actions and Library of Congress` |
| `action_types` | Every type the group carried, e.g. `{Committee,Discharge}`; `mart.member_feed` selects committee actions on this rather than on `action_type`, so an action one source filed as `Committee` and another as `Discharge` still reaches the feed |
| `reported_times` | How many upstream entries collapsed into this row |

Measured 2026-09-13: 1,213 of 12,896 action rows collapse away, across 773 of the 1,874 bills.
503 of those groups differ by source system, 1,093 by action code, 301 by type. The activity
feed's `committee_action` count falls from 96 to 72, which is duplicate removal, not loss:
counting distinct (bill, date, text) groups where any occurrence was typed `Committee` gives
72 independently.

### `mart.bill_summary`

One row per CRS summary version of a bill in `mart.bill`. Natural key `(congress, bill_type,
bill_number, version_code)`. Columns `seq`, `action_date` (the summary's "as of" date),
`action_desc` (the stage in words), `text_html` (verbatim, HTML), `text_length`, `update_date`,
and `is_latest`.

`is_latest` marks the most recent version: greatest `action_date`, and where two versions share
one (a bill introduced and reported the same day) the later position in the upstream array
wins. Exactly one row per bill carries it (`assert_bill_summary_one_latest`). The page renders
the latest version and lists the rest as a version history; the site sanitises `text_html`
through an allowlist of formatting tags at build time.

### `mart.bill_cosponsor`

One row per cosponsor of every bill in `mart.bill`, tracked members and everyone else. Natural
key `(congress, bill_type, bill_number, bioguide_id)`. Columns `full_name` (the upstream form
`Rep. Steil, Bryan [R-WI-1]`), `display_name` (the plain `Bryan Steil` the pages show),
`party`, `state`, `district`, `sponsorship_date`, `is_original_cosponsor`, `withdrawn_date`,
`is_withdrawn`, `is_tracked_member`.

Grain is one row per (bill, member). A member who cosponsors, withdraws, and cosponsors the
same bill again appears once, with their most recent stint; `cosponsorships` counts how many
stints there were, and every stint stays in `staging.stg_bill_cosponsors` and in raw. One case
in the 119th Congress so far, S. 1383, and no tracked member is involved (ADR 0007).

`mart.bill_sponsorship` stays the tracked-member view the dashboards count; this is the full
list the bill page shows. Its cosponsor join takes the same latest stint, so a repeat
cosponsorship cannot double-count a member's `bills_cosponsored`
(`assert_bill_sponsorship_key_unique`). Party is the letter the cosponsors endpoint reports
when it was read, not necessarily the party on the day of cosponsorship.

### `mart.bill_sponsorship`

Natural key `(bioguide_id, congress, bill_type, bill_number, role)`; `role` is `sponsor` or
`cosponsor`. `date` is the introduction date for a sponsor and the cosponsorship date (from the
cosponsors endpoint) for a cosponsor. `is_original_cosponsor` and `withdrawn_date` apply to
cosponsors only.

A cosponsor row requires a match in the bill's own cosponsors list, not only the member's
personal list: the two are separate Congress.gov endpoints on separate refresh schedules, so a
very recent cosponsorship can show up on the member's list a run or more before the bill's own
list catches up. Rather than a row with a null `date`, that cosponsorship is simply absent from
`mart.bill_sponsorship` until the bill's list agrees (ADR 0011); this is the same snapshot lag
the count-matching tolerance below already tolerates, surfacing one join earlier.

### `mart.bill_action`

Natural key `(congress, bill_type, bill_number, action_date, action_hash)`. Columns
`action_seq` (position in the Congress.gov list), `action_time`, `action_code`, `action_text`,
`action_type`, `source_system`.

## Count matching tolerance (Phase 1b done-when)

For each tracked member and role, the number of rows in `mart.bill_sponsorship` for the
current Congress must be within **max(2, 2 percent)** of the count Congress.gov shows for that
member, role, and Congress (the Sponsored Legislation and Cosponsored Legislation lists on the
member page, filtered to the Congress), with both read on the same calendar day.

Why a tolerance at all: Congress.gov updates continuously and the nightly job snapshots once a
day, so bills introduced or cosponsored since the last run are missing until the next one;
withdrawn cosponsorships may also be counted differently. Why it is small: the member page and
the API are the same system, so a larger gap indicates a loader defect (pagination, Congress
filtering, or type mapping) and fails the check. Amendments are included on both sides.

### `mart.roll_call`

One row per roll-call vote in either chamber. Natural key `(congress, chamber, session,
roll_number)`.

| Column | Type | Description |
|---|---|---|
| `voted_at`, `vote_date` | timestamptz, date | Vote time (House: Congress.gov `startDate`; Senate: parsed `vote_date`); date in Eastern time |
| `question`, `question_short`, `result` | text | As published; `question_short` is the Senate `question` element without the measure or nomination list (House: same as `question`) |
| `vote_type` | text | House only (`Yea-and-Nay`, `Recorded Vote`, ...) |
| `majority_requirement` | text | Senate only (`1/2`, `3/5`, `2/3`) |
| `bill_type`, `bill_number` | text | Legislation voted on, Congress.gov style; null for nominations and procedural votes |
| `document_type`, `document_number`, `document_count` | text, text, int | Senate document as published (`PN` for nominations); en bloc votes list many documents, in which case the first type is kept, the number is null, and the count says how many |
| `yea_total`, `nay_total`, `present_total`, `not_voting_total`, `other_total`, `member_total` | int | Computed from member positions |

`source` is `congress_gov` (House; `source_url` is the House Clerk XML Congress.gov cites) or
`senate_gov` (Senate; `source_url` is the vote XML).

### `mart.member_vote`

One row per (tracked member, roll call). Natural key `(bioguide_id, congress, chamber,
session, roll_number)`. `position` is `Yea`, `Nay`, `Present`, `Not Voting`, or `Other`;
`position_raw` is the upstream string; `voted` is `position <> 'Not Voting'`.

## Attendance (Phase 1c done-when)

For a tracked member and Congress: `roll_calls` = rows in `mart.roll_call` for the member's
chamber; `positions` = rows in `mart.member_vote` (must equal `roll_calls` for a member who
served the whole Congress); `votes_cast` = positions with `voted`; `not_voting` = the rest;
attendance percent = `100 * votes_cast / positions`. GovTrack reports the complement (missed
votes percent) per quarter on the member page; summing its 2025 and 2026 rows gives the
119th-Congress figure to compare against, within 0.5 points (plan section 10, 1c).

The equality holds because both sources list every seated member on every roll call, Not
Voting included, so a member with fewer positions than roll calls in their term window means
a member list was lost or overwritten. The dbt test `assert_positions_cover_roll_calls`
enforces it for every tracked member with at least one position in the chamber and Congress
(roll calls counted from `term.start_date` up to `term.end_date`). The one known way to break
it is loading the trimmed test fixtures into a live database, which the test suite now refuses
(see `tests/conftest.py`); `docs/verification-notes.md` records the instance that prompted
both. A member seated after the first roll call of a Congress legitimately has fewer positions
than `roll_calls`, and the test allows that by counting from the term start.

The other known way is holding the Speakership: House Rule I excuses the Speaker from voting,
and the Clerk's roll omits his name rather than recording Not Voting on a roll call he does not
join, so his `positions` legitimately falls short of `roll_calls` (ADR 0010). The test exempts
whoever currently holds `leadership_role.title = 'Speaker of the House'`; his `attendance_pct`
is still `votes_cast / positions` as for anyone else, which reads as 100 percent because
`positions` already excludes the roll calls he skipped, so it is not comparable to another
member's attendance figure.

### `mart.key_date`

The `key_dates` seed with `source`, `source_url`, `fetched_at`. `/members/{id}/key-dates`
returns rows scoped to `congress`, the member's chamber, the member's state, or the member.

### `mart.member_vote_stats`

One row per tracked member and Congress.

| Column | Description |
|---|---|
| `roll_calls` | Roll calls in the chamber this Congress |
| `positions`, `votes_cast`, `not_voting` | Member rows in `member_vote`; cast = anything but Not Voting |
| `attendance_pct`, `missed_vote_pct` | 100 x votes_cast / positions and its complement |
| `scoring_party` | The party letter the unity figures are scored against (see below) |
| `party_votes`, `party_agreements`, `party_unity_pct` | Plan definition: of the member's Yea/Nay votes on roll calls where the scoring party had a Yea/Nay majority (ties excluded), the share that matched that majority |
| `cq_party_votes`, `cq_party_agreements`, `party_unity_cq_pct` | Same, restricted to roll calls where the Republican and Democratic majorities opposed each other (the CQ "party unity vote" definition used by most published figures) |

Scoring party (ADR 0005): the party on the vote record (House `voteParty`, Senate `party`),
except that a member whose congress-legislators term carries `caucus` is scored with, and
counted in the majority of, that caucus. That applies to every voter, tracked or not, so the
two Senate Independents both count toward the Democratic majority. Majorities exist only for
`R` and `D`; a member scored under any other letter gets null unity figures instead of a
degenerate 100 percent. Kiley's vote records carry `R` until 2026-03-08 and `I` after; with
`caucus: Republican` he is scored against the Republican majority throughout.

### `mart.member_summary`

One row per tracked member: identity and biography (the `member` columns), seat, latest term
(`term_start_date`, `term_end_date`, `congress`, `term_end_congress`, `caucus`),
`tracked_congress` (the dbt var `current_congress`, the Congress the dashboard covers), the
service record, `leadership_title`, the `member_vote_stats` columns for the current Congress,
`bills_sponsored`, `bills_cosponsored`, `committees`, and `chairmanships`. Days remaining and
age are computed by the API.

Service record, from `term_history`: `term_count` (every term served, both chambers, the
current one included; the header shows it as "Nth term"), `first_term_start_date`,
`serving_since_date` (start of the current unbroken run of terms; a run breaks only when a
term begins more than one Congress after the previous one ended, so Cotton's House term ending
2015-01-03 and Senate term beginning 2015-01-06 are continuous service since 2013),
`chamber_term_count` and `chamber_since_date` (the same within the current chamber; Slotkin
reads "4th term · 1st in the Senate"). `leadership_title` is the currently held
`leadership_role` (latest start when several are open), shown as a chip in the header.

`chairmanships` counts assignments whose `title` starts with `Chair` (so `Chairman` and
`Chairwoman` count, `Vice Chair` does not) on **full committees**: the committee has no
`parent_thomas_id`, so subcommittee chairs are excluded and joint committees are included.
Steil chairs House Administration and the Joint Committee on the Library (both counted) and a
Financial Services subcommittee (not counted), so his figure is 2; the site's Committees stat
note reads "2 full committee chairs" and the committees card labels the subcommittee chair
separately.

The site's Party unity stat shows `member_vote_stats.party_unity_cq_pct`, the CQ-style figure
comparable to published vote studies, under the label "votes with party majority";
`party_unity_pct` (the plan definition) stays in the API.

The `term` block of `GET /members/{id}` exposes `congress` (start), `end_congress`,
`congresses` (the full span, e.g. `[117, 118, 119]`), and `tracked_congress` side by side so a
six-year Senate term is never confused with the Congress being tracked.

### `mart.member_feed`

One row per event per tracked member, current Congress. Natural key `(bioguide_id, event_key)`.

| Column | Description |
|---|---|
| `event_type` | `vote`, `bill_sponsored`, `bill_cosponsored`, `committee_action` (a Committee-type action on a bill the member sponsors); `floor_speech` arrives in Phase 3 |
| `event_at`, `event_date` | Vote time, introduction date, cosponsorship date, or action date (Eastern) |
| `event_key` | `vote:<chamber>:<session>:<roll>`, `bill_sponsor:<congress>:<type>:<number>`, `bill_cosponsor:...`, `action:<congress>:<type>:<number>:<date>:<hash>` |
| `headline`, `detail`, `detail_full` | Votes: `Voted YEA on H.R. 3424: <bill title>`, `Voted YEA on nomination PN12-1`, `Voted YEA on 48 nominations (en bloc)`, or `Voted YEA on roll call 253` when no legislation is attached; `detail` is `<question> · <result> <yea>–<nay>`, and for en bloc votes the question is shortened to `On the Cloture Motion · 48 nominations` with the full nomination list in `detail_full` (null otherwise). Bills: `Introduced H.R. 4735: <title>` with the latest action in `detail`; committee actions: `<bill label>: <action text>` with the title in `detail` |
| `position`, `chamber`, `session`, `roll_number`, `bill_type`, `bill_number`, `url` | References for the panel |
| `policy_area` | Congress.gov's policy area for the bill the event concerns, carried from `mart.bill` so the feed's filter needs no join. Null for a nomination vote, a procedural roll call, an amendment, and any bill the source has not classified. Coverage on 2026-09-13 ranged from 46.0 percent of Cotton's feed to 88.3 percent of Steil's; the filter states how many rows it hides rather than showing a silently shorter list |
| `source_url` | For a vote, the roll call's public record (`mart.roll_call.source_url`: the House Clerk XML or the senate.gov vote XML), not `mart.member_vote.source_url`, which for the House is the Congress.gov API endpoint the positions were read from and needs a key to open. The site links a feed row here when the row has no bill page |
| `congress`, `bill_label` | The Congress the event belongs to, and the human bill form (`H.R. 4735`) when the bill is in `mart.bill`. `bill_label` is null when the roll call names legislation with no page, which is how the site decides whether to link the label to `/bills/{congress}/{type}/{number}` rather than guessing |

### `mart.fec_committee`

One row per FEC committee linked to a tracked member's current-office candidate in a cycle.
Natural key `(committee_id, cycle)`. Columns `bioguide_id`, `candidate_id`, `name`,
`designation` (`P` principal campaign committee, `A` other authorized, `J` joint fundraising,
`D` leadership PAC, ...), `designation_full`, `committee_type`, `is_principal`,
`first_file_date`, `last_file_date`, `cycles`, `fec_url` (the public committee page for the
cycle). Cotton's joint fundraising committee and Kiley's leadership PAC are here with
`is_principal = false`; nothing but the principal committee is summed.

The **current-office candidate** is the member's FEC id whose `office` matches the chamber
of the latest term (`H` house, `S` senate); Cotton's old House id `H2AR04083` stays in
`raw.fec_candidate` and `stg_fec_candidates` but never selects a committee. The **principal
campaign committee** is the one committee with `designation = 'P'` among those the API links
to that candidate in the cycle. The loader stops on two of either (ADR 0006); the dbt test
`assert_member_fundraising_one_candidate` catches the same case in the mart.

### `mart.fec_summary`

One row per principal campaign committee and cycle. Natural key `(committee_id, cycle)`.
Dollar amounts are the FEC's, as `numeric(14,2)`; shares are `round(100 * x / raised, 2)`.

| Column | Description |
|---|---|
| `coverage_start_date`, `coverage_end_date`, `last_report_type`, `last_report_year` | The reports summed in: first day of the cycle through the end of the latest processed report (`JULY QUARTERLY`, `PRE-PRIMARY`, ...) |
| `raised` | Total receipts (`receipts`) |
| `spent` | Total disbursements (`disbursements`) |
| `cash_on_hand`, `debts` | At the end of the latest report (`last_cash_on_hand_end_period`, `last_debts_owed_by_committee`) |
| `individual_small` | Unitemized individual contributions: $200 or less in aggregate per donor (`individual_unitemized_contributions`) |
| `individual_large` | Itemized individual contributions: over $200 in aggregate (`individual_itemized_contributions`) |
| `individual_total` | `individual_contributions` |
| `pac` | `other_political_committee_contributions` |
| `party` | `political_party_committee_contributions` |
| `self_funding` | `candidate_contribution` + `loans_made_by_candidate` |
| `transfers` | `transfers_from_other_authorized_committee` (joint fundraising committees and the like) |
| `other` | `raised` minus the six sources above: offsets to operating expenditures, other receipts, loans from anyone but the candidate. Never negative (dbt test) |
| `small_donor_pct` | `100 * individual_small / raised` (the OpenSecrets convention; the panel shows this one) |
| `small_donor_of_individual_pct` | `100 * individual_small / individual_total` |
| `individual_small_pct`, `individual_large_pct`, `individual_pct`, `pac_pct`, `party_pct`, `self_funding_pct`, `transfers_pct`, `other_pct` | Shares of `raised`; the seven non-overlapping ones sum to 100 within rounding (dbt test `assert_member_fundraising_consistent`) |
| `contributions`, `contribution_refunds`, `operating_expenditures`, `other_receipts`, `offsets_to_operating_expenditures` | Kept for reference; not displayed |

Refunds are disbursements and reduce none of the receipt figures. `source` is `fec`;
`source_url` is the totals API URL; `fec_url` the public committee page.

### `mart.member_fundraising`

One row per tracked member and cycle (the current cycle only), whether or not the FEC has
anything. Natural key `(bioguide_id, cycle)`. `status` says how far the chain got:

| `status` | Meaning | Populated |
|---|---|---|
| `no_candidate` | none of the member's FEC ids is for the current office | identity only |
| `no_committee` | the candidate has no principal campaign committee in the cycle | `candidate_*` |
| `no_filings` | the committee has filed nothing covering the cycle yet | `candidate_*`, `committee_*` |
| `filed` | totals present | everything |

Columns: `candidate_id`, `candidate_name`, `candidate_fec_url` (two-year view of the
candidate page), `committee_id`, `committee_name`, `committee_fec_url`, then every
`fec_summary` figure and share listed above. `GET /members/{id}/fundraising` returns the row
as `totals`, `receipts` (amount and `pct` per source), `coverage`, `candidate`, `committee`,
and `small_donor_pct`; the site formats those and computes nothing.

## Bill pages (done-when)

Every row of `mart.bill` has a page, and the page never shows a blank where the source has
data. The checks: `assert_bill_lists_loaded` (every bill has its actions, cosponsors and, for
bills, summaries row), `assert_bill_summary_one_latest` (one current summary per bill, and the
counts on `mart.bill` equal the rows beside them), `assert_bill_cosponsor_key_unique`, and the
static build emitting one page per bill. Summary coverage is reported as a share of bills
rather than required: the Congressional Research Service writes summaries after introduction
and skips many minor measures, so an absent summary is a fact about the source, not a defect.

## Fundraising verification (Phase 2 done-when)

For each tracked member: `raised`, `spent`, `cash_on_hand`, `debts`, `individual_small`,
`individual_large`, `pac`, `party`, `transfers` and `coverage_end_date` must equal, to the
cent, the figures on the FEC's committee page for that committee and cycle
(`https://www.fec.gov/data/committee/{id}/?cycle=2026`, "Financial summary" and "Total
receipts" breakdown) and on the candidate page in its two-year view
(`.../candidate/{id}/?cycle=2026&election_full=false`), read on the same day as the ingest.
The pages and the API are the same system (the site renders the API), so any gap is a loader
or mapping defect, not a tolerance; the one legitimate difference is timing, when a report is
processed between the ingest and the check.

### `mart.congress_session`

One row per session of a Congress. Natural key `(congress, session)`. The activity feed's
date filter offers "this session" and takes the boundary from here rather than computing one
in the browser.

| Column | Description |
|---|---|
| `session_year` | Calendar year of the session, from its own roll calls |
| `start_date` | January 3, the 20th Amendment's convening date |
| `end_date` | The day before the next session convenes, or the end of the Congress for the last one |
| `first_roll_call_date`, `last_roll_call_date`, `roll_calls` | What `mart.roll_call` holds for the session |
| `is_current` | The highest session number in the Congress |

A session with no recorded roll call does not appear, so the model is empty until the first
vote of a Congress is loaded. `GET /api/v1/meta/sessions` returns it.

### `mart.member_activity_timeline`

Weekly buckets (`week_start`, Monday) per member and `event_type`, built from `member_feed`:
`events`, `first_event_date`, `last_event_date`.

## Congress overview (`/congress`, ADR 0012 and 0013)

`GET /api/v1/congress/overview` returns all of it; the page renders these columns and computes
nothing. Two scopes, in page order: **composition** covers all 535 seats and is
hand-maintained; **legislative activity** and **passed both chambers** cover every bill in
`mart.bill` whoever sponsored it (the tracked members' bills plus any bill a loaded roll call
names, so not every bill in Congress). Nothing on the page counts only the tracked members.

### `mart.chamber_composition`

One row per chamber and party group that holds seats (a group with none, such as Senate vacancies,
has no row). Columns `chamber`, `party_group`, `party_label`, `seats`, `chamber_seats`,
`seat_pct` (share of the chamber, what the stacked bar's width is), `caucus_with`, `sort_order`,
`as_of`, and `source`/`source_url`/`fetched_at` (the Clerk of the House or Senate.gov page, and
the seed's as-of date). Source: `seed.composition_seats`.

### `mart.chamber_majority`

One row per chamber: `chamber_seats`, `seated`, `vacant`, the Congress-wide `congress_seats`,
`congress_seated`, `congress_vacant`, `majority_threshold` (seats to control the chamber, unchanged by
vacancies: chamber seats / 2 + 1 for the House, 218; for the Senate 50 while the Vice President
is in the party ahead, else 51; ADR 0014), `tiebreak_letter` (Senate only: the Vice President's
party letter from the dbt var `senate_vp_party`, `R` on 2026-09-19), `majority_pct` (where that line falls along the bar, threshold / seats),
`republican_caucus` and `democratic_caucus` (independents counted with the party they caucus with,
as in ADR 0005), `majority_party`, `majority_letter` (`R`, `D`, null on a tie) and
`majority_margin`. The page states control in words ("Republicans control the House") from
`majority_party` and the two caucus counts, and draws the majority line at `majority_pct`. Seeded
2026-09-19: House 219 to 214 (218 R + 1 I), Senate 53 to 47 (45 D + 2 I).

### `mart.congress_bill_outcome`

One row per bill (kind `bill`) in `mart.bill`: 3,922 on 2026-09-19, all in the 119th Congress. The
activity stats and the passed-both table read every row. Amendments are excluded.

| Column | Description |
|---|---|
| `congress`, `bill_type`, `bill_number`, `label`, `title`, `origin_chamber`, `congress_gov_url` | The bill |
| `house_status`, `senate_status` | The vote-journey stage status (ADR 0009) |
| `passed_house`, `passed_senate` | A passage roll call read `passed`, or the Library of Congress recorded "Passed/agreed to in House" (action code `8000`) or "... in Senate" (`17000`). The codes cover voice votes and unanimous consent. All 445 passage roll calls carry the matching action (checked 2026-09-19) |
| `passed_a_chamber`, `passed_both_chambers` | Either chamber; both chambers of a two-chamber type (never `hres` or `sres`) |
| `became_law`, `public_law_number` | Journey stage `became_law` is `complete`; the number is parsed from `Became Public Law No: 119-38.` |
| `vetoed`, `veto_overridden` | An E30000 "Vetoed by President" action; vetoed and also became law |
| `outcome` | `law`, `vetoed`, `overridden`, `adopted` (a concurrent resolution that cleared both chambers, no President stage), `pending` (bill or joint resolution that cleared both, not yet law or vetoed); null otherwise |
| `outcome_date` | Law date, veto date, or the date the second chamber passed it |
| `house_yea`, `house_nay`, `senate_yea`, `senate_nay` | The latest passage roll call in the chamber; null when it left none |

Checked 2026-09-19: 84 bills passed both chambers (69 law, 6 adopted, 2 vetoed, 7 not yet law),
and the 69 laws equal the 69 `Became Public Law` actions in `mart.bill_action`. H.R. 1 reads Public
Law 119-21, House 215 to 214, Senate 50 to 50.

### `mart.congress_overview`

One row, every figure over every bill in `mart.congress_bill_outcome`. `congress`,
`congress_start`, `congress_end`; `tracked_members` (from `mart.member_summary`, only so the page
can say whose bills seeded the dataset); `bills_in_dataset` (not "bills introduced": it is not
every bill in Congress), `bills_house`, `bills_senate` (by chamber of origin); `passed_chamber` and
its `_house_origin` / `_senate_origin` split (distinct bills, so the halves sum to the total);
`became_law`, `became_law_pct` (share of `bills_in_dataset`); `vetoed`, `vetoed_overridden`,
`vetoed_not_overridden`; `passed_both`, `passed_both_enacted`, `passed_both_adopted`,
`passed_both_vetoed`. Percentages are rounded to one decimal. Checked 2026-09-19: 3,922 bills
(1,956 House, 1,966 Senate), 665 passed a chamber (425 House bills, 240 Senate bills), 69 law
(1.8%), 2 vetoed (none overridden), 84 passed both. `assert_congress_overview_consistent` checks the
splits against their totals and each figure against the one it is a subset of.
