# Data dictionary

Every table the pipeline creates, by schema. Updated in the same PR as any migration that adds
or changes a table (docs/PLAN.md, section 11).

## Schemas

| Schema | Written by | Purpose |
|---|---|---|
| `raw` | `ingest/` | Source payloads as JSONB plus extracted natural-key columns. One table per source entity. |
| `staging` | dbt | Typed, renamed views over `raw` (`stg_*`). |
| `mart` | dbt | Tables the API reads. Every mart table carries `source`, `source_url`, `fetched_at`. |
| `seed` | dbt seeds | Hand-maintained inputs: `fips`, `tracked_members`. |
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

The detail record is re-fetched every run; actions and cosponsors only when the detail
`updateDate` changed, they were never fetched, or `--full-refresh` is passed. Bills referenced
by roll calls in `raw.house_vote` (`legislationType`/`legislationNumber`) and `raw.senate_vote`
(`document_type`/`document_number`, bill types only) get a detail record too, no actions or
cosponsors. Run the vote sources before this one (`--source all` does).

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

## Seeds (`seed` schema, dbt)

| Table | Key | Description |
|---|---|---|
| `seed.fips` | `fips_state` | Census state FIPS reference: `fips_state` (2-char, zero-padded), `state_abbr`, `state_name`, `statens`. Source and retrieval date are dbt vars `fips_source_url` / `fips_fetched_at`. |
| `seed.tracked_members` | `bioguide_id` | Members in scope (the plan calls this `tracked_member`). Columns `bioguide_id`, `note`. Six members: Steil, Cotton, Sanders, Slotkin, Kiley, Jeffries. |
| `seed.key_dates` | `date`, `label` | Hand-maintained calendar (plan `key_date`): `date`, `label`, `kind` (election, session, deadline, recess), `scope` (congress, chamber, state, member), `scope_value`, `note`, `source_url`. Retrieval date is the dbt var `key_dates_fetched_at`. State rows exist for WI, AR, VT, MI, CA, NY (2026 primaries and filing deadlines, each with a statute or election-authority URL); a member whose state has no rows still gets the congress-scoped rows. Recesses not seeded yet. |

## Staging views (`staging` schema, dbt)

`stg_legislators` (names, `bio` birthday and gender, external ids), `stg_legislator_terms`
(one row per term, `chamber` mapped from `rep`/`sen` to `house`/`senate`, plus `caucus`,
`party_affiliations`, `how`, `end_type`), `stg_legislator_leadership_roles` (one row per
entry of `leadership_roles`), `stg_committees` (committees and subcommittees flattened;
subcommittee `thomas_id` = parent id + suffix), `stg_committee_memberships` (one row per
committee member).

Bills: `stg_member_legislation` (list items), `stg_bills` (detail records; amendment titles are
composed from description, purpose, or the amended bill), `stg_bill_actions` (one row per
action with `action_hash` = md5 of date, code, text, source-system code; identical duplicates
collapsed), `stg_bill_cosponsors` (one row per cosponsor).

Votes: `stg_house_roll_calls`, `stg_house_member_votes` (every member), `stg_senate_roll_calls`
(dates parsed from "January 9, 2025, 02:54 PM" Eastern; Senate document types such as `S.` and
`H.R.` mapped to `bill_type`, nominations `PN` kept in `document_type`/`document_number`),
`stg_senate_member_votes` (every senator, `lis_member_id` joined to `stg_legislators.lis_id`
for `bioguide_id`). Positions are normalised by macro `normalize_position` (ADR 0004).

FEC: `stg_fec_candidates` (one row per candidate id: `office`, `state`, `district`,
`candidate_status`, `cycles`), `stg_fec_committees` (`designation`, `committee_type`,
`last_file_date`), `stg_fec_committee_totals` (every amount typed as `numeric(14,2)`;
`cash_on_hand` and `debts` from the `last_*` columns).

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
`id.maplight`, `id.house_history`, `id.google_entity_id`, `id.pictorial`, `family`,
`other_names`, and the per-term contact block (`url`, `address`, `office`, `phone`, `fax`,
`contact_form`, `rss_url`).

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

### `mart.bill_sponsorship`

Natural key `(bioguide_id, congress, bill_type, bill_number, role)`; `role` is `sponsor` or
`cosponsor`. `date` is the introduction date for a sponsor and the cosponsorship date (from the
cosponsors endpoint) for a cosponsor. `is_original_cosponsor` and `withdrawn_date` apply to
cosponsors only.

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

### `mart.member_activity_timeline`

Weekly buckets (`week_start`, Monday) per member and `event_type`, built from `member_feed`:
`events`, `first_event_date`, `last_event_date`.
