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
`updateDate` changed, they were never fetched, or `--full-refresh` is passed.

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

## Seeds (`seed` schema, dbt)

| Table | Key | Description |
|---|---|---|
| `seed.fips` | `fips_state` | Census state FIPS reference: `fips_state` (2-char, zero-padded), `state_abbr`, `state_name`, `statens`. Source and retrieval date are dbt vars `fips_source_url` / `fips_fetched_at`. |
| `seed.tracked_members` | `bioguide_id` | Members in scope (the plan calls this `tracked_member`). Columns `bioguide_id`, `note`. |
| `seed.key_dates` | `date`, `label` | Hand-maintained calendar (plan `key_date`): `date`, `label`, `kind` (election, session, deadline, recess), `scope` (congress, chamber, state, member), `scope_value`, `note`, `source_url`. Retrieval date is the dbt var `key_dates_fetched_at`. Recesses not seeded yet. |

## Staging views (`staging` schema, dbt)

`stg_legislators`, `stg_legislator_terms` (one row per term, `chamber` mapped from `rep`/`sen`
to `house`/`senate`), `stg_committees` (committees and subcommittees flattened; subcommittee
`thomas_id` = parent id + suffix), `stg_committee_memberships` (one row per committee member).

Bills: `stg_member_legislation` (list items), `stg_bills` (detail records; amendment titles are
composed from description, purpose, or the amended bill), `stg_bill_actions` (one row per
action with `action_hash` = md5 of date, code, text, source-system code; identical duplicates
collapsed), `stg_bill_cosponsors` (one row per cosponsor).

Votes: `stg_house_roll_calls`, `stg_house_member_votes` (every member), `stg_senate_roll_calls`
(dates parsed from "January 9, 2025, 02:54 PM" Eastern; Senate document types such as `S.` and
`H.R.` mapped to `bill_type`, nominations `PN` kept in `document_type`/`document_number`),
`stg_senate_member_votes` (every senator, `lis_member_id` joined to `stg_legislators.lis_id`
for `bioguide_id`). Positions are normalised by macro `normalize_position` (ADR 0004).

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
| `first_name`, `last_name`, `official_full_name` | text | From congress-legislators `name` |
| `govtrack_id`, `icpsr_id` | int | For later joins (Voteview uses ICPSR) |
| `fec_ids` | jsonb | Array of FEC candidate ids (Phase 2) |
| `photo_url` | text | Congress.gov member image convention; replaced by the API value in Phase 1b |

### `mart.term`

Tracked member-terms overlapping the current Congress. Natural key
`(bioguide_id, congress, chamber, start_date)`.

| Column | Type | Description |
|---|---|---|
| `congress` | int | Congress in session when the term began (macro `congress_number`) |
| `chamber` | text | `house` / `senate` |
| `start_date`, `end_date` | date | From the source term |
| `state_abbr`, `fips_state`, `state_name` | text | Joined to the FIPS seed |
| `district` | int | House only |
| `senate_class`, `state_rank` | int, text | Senate only |
| `party` | text | Party during the term |

### `mart.committee`

All committees and subcommittees. Key `thomas_id`; `parent_thomas_id` NULL for top-level.
Columns `name`, `chamber` (`house`/`senate`/`joint`), `url`, `jurisdiction`.

### `mart.committee_membership`

Assignments of tracked members. Natural key `(bioguide_id, committee_thomas_id, congress)`.
Columns `rank`, `title` (e.g. `Chair`, `Ranking Member`), `party`. `congress` is the dbt var
`current_congress` because the source file is the current snapshot.

### `mart.bill`

One row per bill or amendment a tracked member sponsored or cosponsored. Natural key
`(congress, bill_type, bill_number)`.

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
| `question`, `result` | text | As published |
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
| `party_votes`, `party_agreements`, `party_unity_pct` | Plan definition: of the member's Yea/Nay votes on roll calls where the member's party had a Yea/Nay majority (ties excluded), the share that matched that majority |
| `cq_party_votes`, `cq_party_agreements`, `party_unity_cq_pct` | Same, restricted to roll calls where the Republican and Democratic majorities opposed each other (the CQ "party unity vote" definition used by most published figures) |

Party is taken from the vote record itself (House `voteParty`, Senate `party`), so a member
who switches party is scored against the party they belonged to on each vote.

### `mart.member_summary`

One row per tracked member: identity, seat, latest term (`term_start_date`, `term_end_date`),
the `member_vote_stats` columns for the current Congress, `bills_sponsored`,
`bills_cosponsored`, and `committees`. Days remaining are computed by the API.

### `mart.member_feed`

One row per event per tracked member, current Congress. Natural key `(bioguide_id, event_key)`.

| Column | Description |
|---|---|
| `event_type` | `vote`, `bill_sponsored`, `bill_cosponsored`, `committee_action` (a Committee-type action on a bill the member sponsors); `floor_speech` arrives in Phase 3 |
| `event_at`, `event_date` | Vote time, introduction date, cosponsorship date, or action date (Eastern) |
| `event_key` | `vote:<chamber>:<session>:<roll>`, `bill_sponsor:<congress>:<type>:<number>`, `bill_cosponsor:...`, `action:<congress>:<type>:<number>:<date>:<hash>` |
| `headline`, `detail` | e.g. `Voted YEA on H.R. 3424: On Motion to Suspend the Rules and Pass`; the bill title or result |
| `position`, `chamber`, `session`, `roll_number`, `bill_type`, `bill_number`, `url` | References for the panel |

### `mart.member_activity_timeline`

Weekly buckets (`week_start`, Monday) per member and `event_type`, built from `member_feed`:
`events`, `first_event_date`, `last_event_date`.
