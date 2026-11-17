# Data dictionary

Every table the pipeline creates, by schema. Updated in the same PR as any migration that adds
or changes a table (docs/PLAN.md, section 11).

## Schemas

| Schema | Written by | Purpose |
|---|---|---|
| `raw` | `ingest/` | Source payloads as JSONB plus extracted natural-key columns. One table per source entity. |
| `staging` | dbt | Typed, renamed views over `raw` (`stg_*`). |
| `mart` | dbt | Tables the API reads. Every mart table carries `source`, `source_url`, `fetched_at`. |
| `seed` | dbt seeds | Hand-maintained inputs: `fips`, `tracked_members`, `key_dates`, `election_dates`, `composition_seats`. |
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
| `error` | text | yes | Error message for failed runs, as `ExceptionName: message`. A message beginning `SourceUnavailable:` means the upstream refused the reader; when that is the newest finished run of a source, the freshness check and the API report the source as unavailable rather than stale (ADR 0020) |

Index: `ix_ingest_run_source_finished_at (source, finished_at)`.

Migration: `migrations/versions/20260912_0001_initial_schemas.py`.

## `meta.ingest_cursor` and `meta.bill_refresh_queue`

State of the incremental bills ingest (ADR 0023, `ingest/sources/congress_gov_queue.py`). Both
are empty while `BILL_INGEST_MODE` is `full`.

`meta.ingest_cursor`: how far a source has asked its upstream what changed. Key `source`,
`congress`, `kind`.

| Column | Type | Null | Description |
|---|---|---|---|
| `source` | text | no | `congress_gov_bills` |
| `congress` | integer | no | The Congress the row is about; a new Congress starts with no row |
| `kind` | text | no | `changed`: the watermark the nightly asks `fromDateTime` from (minus six hours). `resweep`: when the whole list was last compared |
| `changed_through` | timestamptz | no | Start of the run whose listing the row accounts for |
| `updated_at` | timestamptz | no | When the row was last written |

`meta.bill_refresh_queue`: bills and amendments known to need reading. Key `congress`,
`bill_type`, `bill_number`. A row is deleted in the transaction that stores the record, so what
is left after any run, however it ended, is exactly what has not been read.

| Column | Type | Null | Description |
|---|---|---|---|
| `kind` | text | no | `bill` or `amendment` |
| `reason` | text | no | `changed` (listed as updated), `new` (listed, not yet held, or named by a roll call), `resweep` (found by the weekly whole-list comparison), `backfill` (not held on the first incremental run) |
| `priority` | smallint | no | 0 for `changed` and `new`, 1 `resweep`, 2 `backfill`; lowest is read first |
| `enqueued_at` | timestamptz | no | When the record was first queued; the freshness check fails when a priority 0 row is older than 72 hours |
| `attempts` | integer | no | Failed reads; from 3 the record is read last and named in the run summary |
| `last_error` | text | yes | The last failure |

Index: `ix_bill_refresh_queue_order (congress, priority, enqueued_at)`.

Migration: `migrations/versions/20261113_0009_bill_refresh_queue.py`.

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

## Raw tables: OpenFEC (Alembic migrations `0005`, `0010`)

Loaded by `python -m ingest.run --source fec` for every member in `seed.tracked_members`,
current cycle only (`fec_cycle`, derived from `CURRENT_CONGRESS`: 119 -> 2026). All rows share
`payload jsonb`, `source_url text`, `fetched_at timestamptz`. Records are asked for many ids
at a time (`/candidates/`, `/committees/`, `/totals/house-senate/`; ADR 0023): about three
requests a run for twenty members. Totals are read every run. Candidates and committees are
read again when the stored ones are a week old, when a tracked member has none, or with
`--full-refresh`. `source_url` is the per-record address, which returns the same record. See
ADR 0006 for what is and is not loaded.

| Table | Key | One row per |
|---|---|---|
| `raw.fec_candidate` | `candidate_id` | candidate record for every id in the member's congress-legislators `id.fec` list, old offices included; `bioguide_id` links it back |
| `raw.fec_committee` | `committee_id`, `cycle`, `candidate_id` | every committee linked in the cycle to a member's current-office candidate, whatever its designation. A committee that names two tracked candidates (joint fundraising) has a row for each. A link the FEC no longer reports is deleted at the next weekly read |
| `raw.fec_committee_totals` | `committee_id`, `cycle` | totals record of the principal campaign committee (the same record `/committee/{id}/totals/?cycle=` returns) |

Source shapes (verified 2026-09-13): the totals endpoint has no `cash_on_hand_end_period`;
cash on hand and debts are `last_cash_on_hand_end_period` and `last_debts_owed_by_committee`.
House and Senate committees both report transfers as
`transfers_from_other_authorized_committee`. Candidate totals (`/candidate/{id}/totals/`)
equal the committee totals for all six tracked members (no second authorized committee).
The key reports a 60-requests-per-minute limit in `X-RateLimit-Limit` on top of the
documented 1,000 per hour; the client throttles on both.

## Raw table: press pages (Alembic migration `0011`)

Loaded by `python -m ingest.run --source press_pages` for every tracked member with no row in
`seed.statement_sources` and a website in `raw.legislator` (ADR 0023). The probe asks the
office's own site for a short list of known paths, robots.txt honoured, one request a second,
and stores the first that answers with a press listing. Nothing is copied from the site.

| Table | Key | One row per |
|---|---|---|
| `raw.press_page` | `bioguide_id` | latest probe of the member's official website (`source_url`) |

`payload.outcome` is `found` (`payload.press_url` answered with a press listing), `not_found`,
`disallowed` (robots.txt forbids every path) or `unreachable` (the site refused or did not
answer; `press_url` is then the one found before, if any). A settled outcome is asked again
after 30 days; `unreachable` and a member with no row on the next run. Tried on 70 office sites
from a home connection on 2026-11-15, the rule found a page on 66, found none on 3 and was
disallowed by 1 (McConnell). Of the twenty sites a person had checked it found the same page on
14 and another news or press page of the same office on 4. Two of the 66 are a general media
page that mentions press releases, not a listing of them.

## Raw tables: press-release feeds (Alembic migration `0007`)

Loaded by `python -m ingest.run --source statements` for every `seed.statement_sources` row with
`mode = 'feed'` (ADR 0015). All rows share `payload jsonb`, `source_url text` (the feed URL),
`fetched_at timestamptz`.

| Table | Key | One row per |
|---|---|---|
| `raw.statement` | `bioguide_id`, `guid` | item of the member's own RSS 2.0 press feed |

`guid` is the feed's item id, not always a public URL (speaker.gov and jeffries.house.gov use
admin-host `?p=` ids); the public link is `payload.link`. The payload is the parsed item:
`title`, `link`, `guid`, `pub_date` (the feed's RFC 822 string), `creator`, `categories[]`,
`description` (the feed's excerpt) and `content_html` (`content:encoded`, the full release, or null
when the feed has none). Only what the feed gave since the tracked Congress began (2025-01-03 for
the 119th) is stored; rows are only upserted, never deleted.

Paging (verified 2026-09-19 against the six feeds): the feeds are WordPress, ten items a page
(Sanders six), and accept `?paged=N`; a page past the end answers 404. The first load read every
page back to 2025-01-03: 241 requests and 2,216 statements for six feeds (Jeffries 700, Ossoff 524,
Speaker 381, Slotkin 269, Sanders 225, R. Johnson 117), 9.8 MB in `raw.statement`. A normal night
reads page 1 of each feed (6 requests) and stops at the first page that holds a stored item. One
item in Jeffries's history (2025-05-23) has an empty title and is skipped with a warning.

## Raw tables: House Periodic Transaction Reports (Alembic migration `0012`, ADR 0018)

Loaded by `python -m ingest.run --source house_ptr` for every tracked member whose latest term is
in the House. Two files are read from `disclosures-clerk.house.gov/public_disc`, both public and
keyless: `financial-pdfs/{year}FD.zip` (the filing index, one per calendar year of the tracked
Congress) and `ptr-pdfs/{year}/{DocID}.pdf` (the report). The index has a name and a
state-district but no bioguide id, so a `P` (Periodic Transaction Report) row is matched to a member
when state, district and normalised last name all equal those of the member's current House term.

| Table | Key | One row per |
|---|---|---|
| `raw.house_ptr_filing` | `doc_id` | PTR of a tracked member; columns `bioguide_id`, `year`, `status` (`parsed`, `scanned`, `failed`), `error`, `payload` (`index`: the index row as the Clerk prints it; `pdf`: `pages`, `text_chars`, `filer_name`, `state_district`), `source_url` (the PDF), `fetched_at` |
| `raw.house_ptr_transaction` | `doc_id`, `row_number` | transaction row of a `parsed` filing; `payload` holds every cell as printed (`owner`, `asset`, `type`, `trade_date`, `notification_date`, `amount`, `page`, and `detail`: `filing_status`, `subholding_of`, `description`, `location`, `comments`), `source_url` is the PDF with `#page=N` |

`status`: `parsed` is a PDF with a text layer whose table read back as whole rows; `scanned` is a paper
form photographed to an image (CCITT, no text, so nothing can be read without OCR; ADR 0018 declines
OCR); `failed` is text with no whole table, or a PDF header that disagrees with the index, and `error`
says why. A filing whose reading fails on any row stores no rows at all, so a partial list never looks
complete. `parsed` and `scanned` filings are fetched once; `failed` ones are retried every night; a
`--full-refresh` reads all again and replaces each filing's rows. A PDF that cannot be fetched is not
stored and is retried the next night.

Source shape (verified 2026-09-20 on every 2025 and 2026 PTR, 910 filings, all House filers): the index
(4,599 rows for the two years) is tab separated with header `Prefix Last First Suffix FilingType
StateDst Year FilingDate DocID`, and names can hold bare quotation marks (`Eric A. "Rick"`), so it is
read with quoting off. Electronic filings have DocIDs starting `2`; paper ones start `8` or `9`. Of the
910, 798 have text (10,936 transaction rows) and 112 are scans. Every table row is on one line with the
owner, asset, type and dates, and the asset name and amount may wrap onto further lines, including
across a page break; the detail lines beneath use a smaller font. Some PDFs print the detail labels
("Filing Status:") with unmapped glyphs, so a label is identified by its first letter. Amounts: 10,911 bands, 10 "Spouse/DC Over $1,000,000", 15 exact figures. Codes seen: types
`P` 5,493, `S` 3,645, `S (partial)` 1,733, `E` 65; owners self 5,800, `SP` 2,912, `JT` 1,631, `DC` 593;
asset types `ST`, `GS`, `OT`, `CS`, `HN`, `OI`, `OP`, `CT`, `PS`, `VA`, `OL`, `AB`, `ET`, `RS`.

Tracked members with PTRs, 2025-01-03 to 2026-09-20: only Ro Khanna (`K000389`), 20 filings, 590 pages,
all scanned. The other nine House members filed annual reports and extensions but no PTR. First
ingest: 4,599 index rows, 20 filings fetched, 22 requests, 17.5 MB, 21 seconds at one request a second;
a normal night is 2 requests.

## Raw tables: Senate Periodic Transaction Reports (Alembic migration `0013`, ADR 0026)

Loaded by `python -m ingest.run --source senate_ptr` for every tracked member whose latest term is
in the Senate. eFD (`efdsearch.senate.gov`) is read after agreeing to its statement on use
(5 U.S.C. 13107), which the owner approved for every run: one search for report type 11 submitted
since the tracked Congress began, 100 rows a page, then `/search/view/ptr/{uuid}/` (an HTML table)
or `/search/view/paper/{uuid}/` (page images) for each report of a tracked senator. A search row
has a name and an office but no bioguide id; it is matched when the office is a sitting senator's
and the last name (before any ", Jr.") agrees, with a first, middle or nickname also required when
two tracked senators share a last name.

| Table | Key | One row per |
|---|---|---|
| `raw.senate_ptr_report` | `report_id` | PTR of a tracked senator; columns `bioguide_id`, `status` (`parsed`, `paper`, `failed`), `error`, `supersedes` (the report an amendment replaces), `supersedes_note` (how that was decided, or why not), `payload` (`search`: `first`, `last`, `office`, `title`, `filed`, `report_for`, `amendment`, `kind`; `report`: `title`, `filer`, `filed_at`, `stated_total`, or `pages` for a paper report), `source_url` (the eFD page), `fetched_at` |
| `raw.senate_ptr_transaction` | `report_id`, `row_number` | transaction row of a `parsed` report; `payload` holds every cell as printed (`transaction_date`, `owner`, `ticker` (null for `--`), `asset_name`, `asset_detail` (eFD's labelled lines under a bond or option, e.g. `Rate/Coupon`, `Matures`), `asset_type`, `type`, `amount`, `comment` (null for `--`)) |

`status`: `parsed` is an electronic report whose rows read back as the count it states and whose
heading names the matched senator; `paper` is a report filed as page images; `failed` is anything
else, with `error`, and stores no rows. `parsed` and `paper` reports are fetched once (eFD reports
cannot be edited); `failed` ones are retried nightly. An amendment (`amendment` > 0, "(Amendment)"
with no number counts as 1) is matched to the same filer's earlier report for the same date that
shares the most rows, if it shares at least half the amendment's rows and strictly more than any
other; otherwise `supersedes` stays null and `supersedes_note` starts `not resolved`.

Source shape (verified 2026-11-16 on all 308 PTRs submitted since 2025-01-03, every filer): search
rows are `[first, last, office, link, filed]`; titles are `Periodic Transaction Report for
mm/dd/yyyy`, with ` (Amendment N)` or ` (Amendment)`; offices end `(Senator)`, `(Former Senator)`,
or are `Senator` on paper rows; 278 electronic, 30 paper (one filer); 27 amendments. Of tracked
senators: 84 reports, all electronic, 479 rows. Values seen: types `Purchase` 258,
`Sale (Partial)` 156, `Sale (Full)` 65; owners `Joint` 411, `Child` 53, `Spouse` 15; asset types
`Stock` 433, `Corporate Bond` 42, `Municipal Security` 4.

## Raw table: annual financial disclosures (Alembic migration `0014`, ADR 0027)

Loaded by `python -m ingest.run --source house_annual` and `--source senate_annual`. Listed and
linked; no report is opened.

| Table | Key | One row per |
|---|---|---|
| `raw.annual_disclosure` | `source`, `doc_id` | annual report, amendment, new member report, termination report or due-date extension a tracked member filed since the tracked Congress began; `source` is `house_clerk` (the Clerk's index; `doc_id` the DocID) or `senate_efd` (the eFD search; `doc_id` the report UUID); columns `bioguide_id`, `kind` (`annual`, `amendment`, `new_filer`, `termination`, `extension`), `covers_year` (the year covered: the index file's year for the House, the year in the eFD title, null when the title has none), `filing_date`, `payload` (`index`: the index row, or `search`: `first`, `last`, `office`, `title`, `view`, `kind`, `covers_year`, `amendment`, `filed`), `source_url` (the House PDF `financial-pdfs/{year}/{DocID}.pdf` or the eFD page), `fetched_at` |

House: index types `O` annual, `H` new member, `A` amendment, `T` termination, `X` extension are kept;
`P` (trades), `C` (candidate) and `D`, `W`, `E`, `G`, `B` are not. A row is matched by seat and name
(`ingest.sources.house_ptr.SeatIndex`): the seat must be a tracked member's and the member's last name
the row's last name or a word of its name ("Arenholz, Ashley Hinson" is Hinson). The index for the year
before the Congress began is read too: its annual reports are filed during the Congress. Senate: eFD
report types 7 and 10, filer type senator; candidate reports, blind trusts and new-filer extensions are
left out. Verified 2026-11-16: House 171 rows for all 50 tracked House members (97 annual, 3 new member,
11 amendments, 60 extensions); Senate 47 for all 16 tracked senators (32 annual, 3 amendments,
12 extensions).

## Raw tables: inside annual reports (Alembic migration `0015`, ADR 0028)

Loaded by `python -m ingest.run --source senate_annual` and `--source house_annual`, which after
listing open each annual, amended, new member or termination report not read yet (a filed report never
changes): eFD pages for the Senate (ADR 0028), Clerk PDFs for the House (ADR 0029).

| Table | Key | One row per |
|---|---|---|
| `raw.annual_report_page` | `source`, `doc_id` | report opened; `bioguide_id`, `status` (`parsed`, `paper` (not opened), `failed`), `error`, `payload` (`title`, `filer`, `filed_at`, `covers_year`, and `parts`: per part key its `title`, `columns`, row count and, for a part without a table, the filer's `answer`), `source_url`, `fetched_at` |
| `raw.annual_report_row` | `source`, `doc_id`, `part`, `row_index` | table row of a parsed report. Senate: `part` is the report's own number (`1` to `10`, `4a`, `4b`) or `comments`; `payload.cells` is each cell as `{text, notes}`, the notes being the blocks eFD nests in the cell. House: `part` is `A` (assets) or `D` (liabilities); `payload` is `page`, `cells` by column name (A: `asset`, `owner`, `value`, `income_type`, `income`, and `tx_over_1000` or, on a new member's report, `income_preceding`; D: `owner`, `creditor`, `date_incurred`, `type`, `amount`) and `detail` (`description`, `location`, `comments`) |

Parts 3 (Assets: blank/#, Asset, Asset Type, Owner, Value, Income Type, Income) and 7 (Liabilities:
blank, #, Incurred, Debtor, Type, Points, Rate (Term), Amount, Creditor, Comments) must have exactly
those headings; a report without Part 3, or with a row whose cell count differs from its part's
headings, or whose heading names someone else, is `failed` and stores no rows. Verified 2026-11-16 on
all 35 annual reports and amendments of the 16 tracked senators for 2024 and 2025: all parsed;
1,661 asset lines (values: bands, 189 "None (or less than $1,001)", 127 "--" accounts, 8
"Unascertainable"), 48 liabilities.

House (ADR 0029): a PDF with no text is `paper`; one whose own state-district or filing year differs
from the index row, or whose Schedule A or D does not read back whole (an asset without its `[XX]`
code, a row without a value), is `failed`. The page payload holds `pages`, `text_chars`, `filer_name`,
`state_district`, `filing_type`, `filing_year` and per schedule its row count and whether it reads
"None disclosed.". Verified 2026-11-16 on the 111 reports of the 50 tracked House members: 101
parsed, 10 paper, 0 failed; 3,423 asset lines and 245 liabilities; every report's asset count equals
an independent count of its `[XX]` codes.

## Raw tables: Census boundaries and ACS (Alembic migration `0008`, ADR 0016)

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
(shoreline-clipped; TIGERweb's polygons are not, ADR 0016). On 2026-09-20: 56 states, 441
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
| `seed.election_dates` | `cycle`, `state`, `office`, `districts`, `event`, `date` | The states' congressional election calendars (ADR 0023). `office` is blank when the date is the same for the House and the Senate, else `house` or `senate`; `districts` (space-separated) only when a House date applies to some districts; `event` is `filing_deadline`, `primary`, `primary_runoff` or `general_runoff`; `qualifier` is a short tag for the label (noon, incumbents, if needed); `basis` is `official`, `statutory` or `projected`; `rule` is the statute or the reason where a person wrote one down; `checked_on`. Holds 2026 for all 50 states (119 rows), from the FEC's "2026 Congressional Primary Dates and Candidate Filing Deadlines for Ballot Access" (data as of 2026-05-18); its primary and runoff dates agree with NCSL's table of 2026-05-27. Arkansas's filing deadline (2025-11-12) is the state's; the FEC lists November 11. Changes after May 2026 were not checked. |
| `seed.statement_sources` | `bioguide_id` | The members whose statements source a person checked; a tracked member with no row links out by default (ADR 0023). How the Public statements tab treats each of them (ADR 0015): `mode` (`feed` or `link`), `label` (the host shown, e.g. `sanders.senate.gov`), `press_url` (the office's own press-release listing, checked to load), `feed_url` (set for `feed` rows only), `note` (what was checked and when). A member is `feed` only when a person verified that the feed is press-scoped, carries full text in `content:encoded`, and has as its newest item the listing's newest. Seeded 2026-09-19: `feed` for Sanders, Slotkin, Jeffries, R. Johnson, Ossoff and the Speaker (via speaker.gov); `link` for the other fourteen. Retrieval date is the dbt var `statement_sources_checked_at`. |
| `seed.ptr_transaction_types` | `code` | Transaction-type codes on a House PTR (ADR 0018): `code` (`P`, `S`, `S (partial)`, `E`), `label` (Purchase, Sale, Partial sale, Exchange), `direction` (`purchase`, `sale`, `exchange`; the mart groups by it). |
| `seed.ptr_owner_codes` | `code` | Owner codes: `SELF` (a blank owner cell), `SP` spouse, `DC` dependent child, `JT` joint. |
| `seed.ptr_asset_types` | `code` | All 48 asset-type codes the Clerk lists (https://fd.house.gov/reference/asset-type-codes.aspx, copied 2026-09-20), whether or not a tracked member used one. A code that is not here keeps its row and is flagged (`has_unmapped_code`). |
| `seed.efd_asset_types` | `code` | Asset types as the Senate's eFD prints them (`Stock`, `Corporate Bond`, `Municipal Security`, the three seen on 2026-11-16), with the label the site shows (ADR 0026). A value not here keeps its row and is flagged (`has_unmapped_code`), and the ingest log lists every value seen. |
| `seed.composition_seats` | `chamber`, `party_group` | Hand-maintained party split of the 435 House and 100 Senate seats (ADR 0012): `chamber` (`house`/`senate`), `party_group` (`republican`, `democratic`, `independent`, `vacant`), `seats`, `caucus_with` (independents only). Typed from the Clerk of the House and Senate.gov; provenance is the dbt vars `composition_as_of`, `composition_house_source_url`, `composition_senate_source_url`. The warning test `assert_composition_matches_legislators` compares it with `raw.legislator`. Seeded 2026-09-19: House 218 R, 214 D, 1 I (caucus R), 2 vacant; Senate 53 R, 45 D, 2 I (caucus D). |

## Staging views (`staging` schema, dbt)

`stg_legislators` (names, `bio` birthday and gender, external ids), `stg_legislator_terms`
(one row per term, `chamber` mapped from `rep`/`sen` to `house`/`senate`, plus `caucus`,
`party_affiliations`, `how`, `end_type`), `stg_legislator_leadership_roles` (one row per
entry of `leadership_roles`), `stg_committees` (committees and subcommittees flattened;
subcommittee `thomas_id` = parent id + suffix), `stg_committee_memberships` (one row per
committee member).

Bills: `stg_bill_scope` (a table, not a view: the keys of the bills the mart keeps, that is
those a tracked member sponsored or cosponsored, read from the bill's own sponsor and cosponsors
list, and those a roll call names; `raw.bill` may hold the whole Congress, and `stg_bills`,
`stg_bill_actions` and `stg_bill_summaries` join this, ADR 0023), `stg_member_legislation` (the
members' own list items; nothing in the mart reads it since ADR 0023, and only the `full` ingest
mode refreshes it), `stg_bills` (detail records; amendment titles are
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

Statements: `stg_statements` (one row per feed item: `title`, `url`, `published_at` cast from the
feed's RFC 822 date, `author`, `categories` as `text[]`, `description`, `content_html`, `feed_url`).

House PTRs: `stg_house_ptr_filings` (typed `raw.house_ptr_filing`: `filing_date` cast from the
index's m/d/yyyy, `pages`, `status`, `error`, `pdf_url`) and `stg_house_ptr_transactions` (the strings
of `raw.house_ptr_transaction` read out: `owner_code` with a blank as `SELF`, `asset_type_code` the
bracketed two-character code that ends the asset cell, `ticker` the last parenthetical when it looks
like one (a CUSIP such as `91282CGH8` does not, so a bond keeps it in `asset_name`), `asset_name` the
cell without the code or ticker, `trade_date` and `notification_date` cast, and `amount_kind`
(`band`, `top_band`, `exact`) with `amount_low` and `amount_high` as `numeric(14,2)`; `amount_high` is null
for a top band). A date or amount Postgres cannot read fails the build rather than becoming a null.

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
what joins a row to a member's term (ADR 0016). Every estimate has a margin of error `_moe` at 90
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
links the public ACS page instead). Not loaded: urban/rural (no ACS table; ADR 0016), and
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

Verification (ADR 0016): the maps were checked by eye against real districts (WI-1, NY-14) and
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

### `mart.seat`

Every seat someone holds today, House (with the six delegates) and Senate, **whether or not the
member is tracked** (ADR 0022). Built from the newest congress-legislators snapshot only, so a
member who has left office drops out; a vacant seat has no row. "Today" is clamped into the
current Congress. Key `seat_key`; one row per `bioguide_id`.

| Column | Type | Description |
|---|---|---|
| `seat_key` | text | `house-WI-1`, `house-DC-0`, `senate-AR-2` |
| `chamber` | text | `house` / `senate` |
| `state_abbr`, `state_name`, `fips_state` | text | Joined to the FIPS seed |
| `district` | int | House only; 0 for an at-large seat and for a delegate |
| `senate_class`, `state_rank` | int, text | Senate only |
| `bioguide_id`, `official_full_name`, `last_name` | text | The holder |
| `party`, `caucus` | text | As the source writes them (`Democrat`, `Republican`, `Independent`) |
| `website_url` | text | Official website from the current term, or null |
| `is_tracked` | bool | True when the member is in `seed.tracked_members` (has a dashboard) |
| `photo_url` | text | Congress.gov member image URL |

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
office; it is not verified against the member's own site. `rss_url` here is congress-legislators'
value and is not used for statements: it was stale or wrong for most tracked members when checked
(ADR 0015).

### `mart.statement_source`

One row per tracked member with somewhere to send a reader: how the Public statements tab
treats them (ADR 0015, ADR 0023). A member in `seed.statement_sources` is as the seed says. Any
other tracked member is `link`: to the press page the probe found (`raw.press_page`), else to
the official website; a member with neither has no row. Key `bioguide_id`. Columns `mode`
(`feed` or `link`), `link_kind` (`press_page`, or `official_website` when `press_url` is only
the office's home page), `label` (the host), `press_url`, `feed_url` (null for
`link`), `statements` (rows in `mart.statement`, 0 for `link`), `oldest_published_at`,
`newest_published_at`, `fetched_at` (latest fetch of the feed; for a `link` member the dbt var
`statement_sources_checked_at`, the day a person checked the press URL, or the day of the
probe), `source` (`press_feed`, `press_page` or `official_website`) and `source_url` (the page a
reader can open to check the tab against).
`GET /members/{id}/statements` returns `mode` `feed`, `link`, or `none` (nowhere to link), the
statements newest first when `feed`, and `total`. A feed member with nothing loaded yet is shown as
a link by the site. The warning test `assert_statement_feeds_fresh` names any `feed` member whose
newest statement is over 45 days old or that has none, which is how a feed that has gone stale or
empty shows up.

### `mart.statement`

One row per press release of a `feed` member's own feed since the tracked Congress began. Natural
key `(bioguide_id, guid)`. Columns `title`, `published_at`, `published_date` (Eastern), `url` (the
release on the office's site), `author`, `categories` (`text[]`), `description` (the feed's excerpt),
`content_html` (the full text as published, verbatim), `feed_url`, `source` (`press_feed`),
`source_url` (= `url`, the release itself) and `fetched_at`. The site turns `content_html` into
plain text at build time (tags dropped, entities decoded, cut at 3,000 characters), embeds it in the
member page, and searches it in the browser. The cap matters for size: Jeffries (700 releases) is
3.1 MB of text uncapped, and his built page is 2.3 MB (547 KB gzipped), the largest of the six feed
members; a link-out member's page is about 0.5 MB (measured on the 2026-09-19 build). The releases
are the members' offices' words, reproduced from their own feeds; the tab links each one back.

### `mart.member_stock_trades`

One row per tracked member: what the Stock trades tab says (ADR 0018, ADR 0026). Key `bioguide_id`.

| Column | Description |
|---|---|
| `chamber` | `house` / `senate`, from the latest term |
| `status` | `senate_unavailable` (a senator while eFD has never been read successfully: no Senate record to show), `no_filings` (the Clerk index or the eFD search lists no PTR for the member since the Congress began), `filed` (at least one PTR) |
| `filings`, `filings_parsed`, `filings_scanned`, `filings_failed` | Reports by what reading them gave (a Senate paper report counts as scanned); the last three sum to `filings`. A Senate report an amendment replaced still counts as a filing |
| `latest_filing_date` | Newest report's filing date |
| `trades`, `purchases`, `sales`, `exchanges` | Rows in `mart.stock_trade` by `direction`; a trade with an unmapped type code is `other` and counts only in `trades` |
| `purchases_low`, `purchases_high`, `sales_low`, `sales_high` | Sums of the low and high ends of the disclosed bands. They bracket the true total; a trade's real value lies inside its band |
| `purchases_high_is_open`, `sales_high_is_open` | A top-band trade ("Over $50,000,000") has no high end, so the high sum is a floor, not a ceiling, and the site reads "$X or more" |
| `first_trade_date`, `last_trade_date` | Range of trade dates listed |
| `covers_from` | The first day of the tracked Congress (macro `congress_start_date()`): what "no reports" is measured from |
| `lookup_url`, `source`, `source_url` | The official search a person can check against: the Clerk's for House members (`house_clerk_ptr`), the Senate's for senators (`senate_efd`) |
| `checked_at`, `fetched_at` | Last successful run of the member's chamber's source, `house_ptr` or `senate_ptr` (`meta.ingest_run`), and the latest fetch of a member's filings (else the same) |

Verified against the ingest 2026-09-20: Khanna `filed`, 20 filings all scanned, 0 trades; the other nine
House members `no_filings`; the ten senators `senate_unavailable`. Against the local run of 2026-11-16
(56 members): 11 House members and 5 senators `filed` (Boozman 345 trades, Fetterman 51, McConnell 10,
Collins 4, Schiff 1), the rest `no_filings`. `assert_stock_trade_counts_consistent` checks every count
against the rows beside it and that no `senate_unavailable` senator has a PTR row.

`GET /api/v1/members/{id}/stock-trades` returns the row as `status`, `chamber`, `covers_from`,
`lookup_url`, `checked_at` and `summary` (the counts and totals above), with `filings` (every
report, newest first) and `items` (every trade, newest first). The site formats those and computes
nothing: the tab shows the empty-record message for `no_filings`, a "not available for the Senate"
message for `senate_unavailable`, and for `filed` the summary, a notice for scanned and unreadable
reports, the trade list and the report list.

### `mart.annual_disclosure`

One row per annual-disclosure report a tracked member filed since the tracked Congress began, both
chambers (ADR 0027), plus one row per report due after an extension and not filed yet (`kind`
`extension`, linking the extension). Columns `bioguide_id`, `doc_id`, `source` (`house_clerk`,
`senate_efd`), `kind`, `covers_year`, `filing_date`, `amendment` (eFD's number; null for the House),
`extended_on` (the latest extension for the same year filed on or before an annual or new member report;
a House extension counts only when filed in the year after the one it is listed under), `label` (as the
site shows it: "Annual report for 2025", "New member report for 2024", "Amended report for 2024" (House),
"Amended annual report for 2024" (Senate), "Termination report", "Report for 2026: not filed yet"),
`source_url`, `fetched_at`.

### `mart.annual_report_version`, `mart.annual_asset`, `mart.annual_liability`, `mart.annual_net_worth`

ADR 0028, ADR 0029; both chambers. `annual_report_version`: one row per (member, source, year) with a
parsed annual, new member or amended report, the one that stands for the year (highest amendment
number, then latest filed), with `sections_read` (ADR 0031: its income, positions, agreements, gifts
and travel were read; every Senate report, a House report read by reader 2 or later). `annual_asset`:
each Part 3 line of that report in order, with `row_label` ("1", "1.1"), `parent_label`, `is_account`
(a line holding other lines; counts in no total), `asset_name`, `asset_notes`, `asset_category`,
`asset_subtype`, `asset_code` (House), `held_in` (the account or plan holding the line: the House text
before ⇒, or the Senate parent line), `owner_code`/`owner_label`, `value_raw`, `value_kind` (`band`,
`none` (Senate 0 to 1,000; House 0, its scale having a $1 - $1,000 band), `exact` (a figure a House
filer entered), `top_band` (no upper end), `not_valued` ("--"), `unascertainable` (Senate
"Unascertainable", House "Undetermined")), `value_low`, `value_high`,
`counts_in_total`, `income_type`, `income_raw`. `annual_liability`: each Part 7 line, with `incurred`,
`owner_code`/`owner_label`, `liability_type`, `rate`, `amount_raw`, `amount_kind`, `amount_low`,
`amount_high`, `creditor`, `comments`. `annual_net_worth`: per report, `holdings` (valued lines,
accounts excluded), `unascertainable`, `assets_low`/`assets_high`/`assets_high_is_open`, `liabilities`,
`liabilities_low`/`liabilities_high`/`liabilities_high_is_open`, `net_low` (assets low minus liabilities
high; null when a debt has no upper end) and `net_high` (assets high minus liabilities low; null when an
asset has no upper end). Reported net worth only: a home that earns no income need not be reported.
`GET /api/v1/members/{id}/annual-disclosures` returns every read year as `years`, newest first (ADR 0033),
and the newest again as `latest`, each with its
`assets` and `liabilities_list`.

### `mart.annual_income`, `mart.annual_position`, `mart.annual_agreement`, `mart.annual_gift`, `mart.annual_travel`

ADR 0030, ADR 0031; both chambers (Senate Parts 2, 8, 9, 5 and 6; House Schedules C, E, F, G and H).
Fields the House does not print are null: an income or gift owner, a position's dates and `is_current`,
an agreement's type, a gift's date, travelers, locations other than a gift giver's. Each has one row per line of
the report that stands for the year (`annual_report_version`), with `bioguide_id`, `covers_year`,
`doc_id`, `row_index` (the report's order), `source` and `source_url`. eFD's "Other (X)" is kept as X.
`annual_income`: `owner_code`/`owner_label` (who was paid), `income_type`, `income_detail` (the filer's
description, e.g. "Book advance"), `payer`, `payer_location`, `amount_raw`, `amount_kind` (`exact`, to
the cent; `over`, Senate "> $1,000", how a spouse's income is reported; `not_stated`, House "N/A", a source
listed without its amount), `amount_low`, `amount_high` (null unless `exact`), `amount_period` (House new
member reports: "Current year to filing" or "Preceding year", whichever amount was stated), `comments`. Never summed. `annual_position`: `position_dates` ("Mar 2008 to present"),
`is_current`, `position_held`, `entity`, `entity_location`, `entity_type`, `comments`.
`annual_agreement`: `agreement_date` ("Aug 2020"), `parties`, `parties_location`, `agreement_type`,
`terms`, `comments`. `annual_gift`: `gift_date`, `owner_code`/`owner_label` (recipient), `gift`,
`value_raw`, `value`, `giver`, `giver_location`, `comments`. `annual_travel`: `departed`, `returned`,
`travelers`, `travel_type`, `itinerary`, `reimbursed_for`, `sponsor` (who paid), `sponsor_location`,
`days_at_own_expense` (House only), `comments`. `GET /api/v1/members/{id}/annual-disclosures` adds them to `latest` as `income`,
`positions`, `agreements`, `gifts` and `travel`: null unless `annual_report_version.sections_read` (every
Senate report; a House report read by reader 2 or later), an empty list when the filer listed none.

### `mart.member_annual_disclosures`

One row per tracked member: `status` (`unavailable` while the chamber's listing has never been read,
`no_filings`, `filed`), `reports`, `pending` (reports due after an extension and not filed yet),
`latest_year`, `latest_filing_date`, `covers_from`, `lookup_url`, `source`, `source_url`, `checked_at`
(last successful `house_annual` or `senate_annual` run), `fetched_at`. `GET
/api/v1/members/{id}/annual-disclosures` returns it with the member's rows from `mart.annual_disclosure`
as `items`, newest first.

### `mart.stock_trade_filing`

One row per PTR a tracked member has filed since the tracked Congress began, whatever reading it gave:
House reports from the Clerk, Senate reports from eFD. Key `doc_id` (the Clerk's DocID or eFD's report
UUID). Columns `bioguide_id`, `year`, `filing_date`, `status` (`parsed`, `scanned` (a House scan or a
Senate paper report), `failed`), `error`, `pages`, `amendment` (Senate: 0 for an original, else the
amendment number; House: null), `superseded_by` (the Senate amendment that replaced the report),
`trades` (rows in `mart.stock_trade`; 0 unless `parsed` and not replaced), `source` (`house_clerk_ptr`,
`senate_efd`), `source_url` (the PDF or the eFD page), `fetched_at`. The warning
`assert_senate_amendments_resolved` names a Senate amendment that could not be matched to the report it
restates. The dbt warning `assert_ptr_filings_parsed`
names each `failed` filing with its reason. `scanned` filings are expected and not warned.

### `mart.trade_committee_overlap`

ADR 0032. One row per trade and committee where the traded company's SIC code falls in a range the
`committee_industries` seed maps to a committee the member sat on in the Congress of the trade date (seats
carry no dates within a Congress). Columns `bioguide_id`, `doc_id`, `row_number` (the trade's key in
`stock_trade`), `trade_date`, `ticker`, `company`, `sic`, `committee_thomas_id`, `committee_name`,
`industry` (the seed's industry name) and `basis`. A note of overlap, not a finding. `GET
/api/v1/members/{id}/stock-trades` attaches them to each item as `overlaps`; `GET
/api/v1/meta/committee-industries` publishes the seeds `committee_industries` (committee, SIC range,
industry, basis) and `committee_industry_scope` (every committee, mapped or not, with the reason) whole.
Raw source: `raw.sec_company` (ticker, CIK, company, SIC code, from `sec_industry`).

### `mart.stock_trade`

One row per transaction on a tracked member's PTR, the trade list, both chambers; a Senate report an
amendment replaced contributes no rows. Senate owners and types are written as the House codes for the
same categories (Joint `JT`, Child `DC`, Sale (Partial) `S (partial)`); Senate asset types are eFD's
words, labelled by the `efd_asset_types` seed; `notification_date`, `filing_status`, `subholding_of`
and `location` are null for the Senate, and `description` holds eFD's bond or option details. Natural key `(doc_id,
row_number)` (`assert_stock_trade_key_unique`). Columns `bioguide_id`, `filing_date`, `trade_date`,
`notification_date`, `days_to_file` (filing date minus trade date), `owner_code`/`owner_label`,
`asset_name`, `ticker`, `asset_type_code`/`asset_type_label`, `transaction_type_code`/
`transaction_type_label`, `direction` (`purchase`, `sale`, `exchange`, `other`), `amount_raw` (as printed),
`amount_kind`, `amount_low`, `amount_high`, the detail lines `filing_status`, `subholding_of`,
`description`, `location`, `comments`, `has_unmapped_code`, `company`, `sic` and `industry` (the SEC's
company, SIC code and its description for the ticker, ADR 0032; null without a ticker the SEC lists; the
warning `assert_trade_tickers_matched` lists unmatched tickers), `source` (`house_clerk_ptr`, `senate_efd`),
`source_url` (the PDF with `#page=N`, or the eFD page) and `fetched_at`. An unmapped code keeps its row, is labelled by its raw code and
sets `has_unmapped_code`; the warning `assert_stock_trade_codes_mapped` counts each. The disclosed amount
is a band, not a figure: a filer may instead enter one exact amount (`amount_kind` `exact`, low equal to
high).

Checked across the sweep of every 2025 and 2026 House PTR (798 parsed filings, none from a tracked member,
so 0 rows in this table today): 10,936 rows, every type, owner and asset code mapped, and the row count of
every filing equal to an independent count of its adjacent trade-date and notification-date pairs made with
a different PDF library. The warning `assert_stock_trade_dates_sane` names a trade dated after its filing
or notified before it was made; these are typos in the filing as the Clerk publishes it and are shown as
printed (46 of the 10,936 sweep rows, one filing printing a notification date of 03/28/1935).

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

### `mart.bill_index`

Every bill and amendment of the Congress that raw holds, with or without a detail page: the list
the `/bills` browse page filters (ADR 0025). `mart.bill` is the detail pages and is limited to the
tracked members' bills; this is everything, kept narrow. Served by `GET /api/v1/bills/index`.

| Column | Meaning |
|---|---|
| `stage` | How far it got, from the Library of Congress action codes on its own action list: 1 introduced; 2 reported by a committee (`5000`, `14000`); 3 passed one chamber (`8000` House, `17000` Senate); 4 passed both, or presented to the President (`28000`, `E20000`); 5 became law (`36000`, `E40000`, or an action typed `BecameLaw`). It does not need a roll call, because most measures pass by voice vote or unanimous consent. |
| `has_floor_vote` | A recorded roll call on it in either chamber (`mart.roll_call`). |
| `is_minor` | What the browse page hides until asked: an amendment, a simple or concurrent resolution, or a bill whose title begins "To designate the facility of the United States Postal Service". |
| `has_page` | Whether the bill is in `stg_bill_scope` and so has a page at `/bills/{congress}/{type}/{number}`. |
| `cosponsor_count` and the party counts | Current cosponsors; withdrawn ones are left out. |

This is a different thing from `mart.bill_journey_stage`, which is the vote journey on a bill's own
page and reads passage roll calls (ADR 0009).

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

Both roles are read from the bill's own records (ADR 0023): the sponsor on its detail record,
the cosponsors from its cosponsors list; `source_url` is that record's URL. Until then the rows
came from each member's sponsored and cosponsored lists, and a cosponsor row waited for the
bill's own list to agree (ADR 0011). With one endpoint there is nothing to wait for. On the
twenty-member database of 2026-11-13 both ways give the same 6,373 rows. A cosponsorship still
appears a run after Congress.gov records it, because the bill's lists are re-read only once its
`updateDate` moves.

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

The `key_dates` seed, and the current cycle's rows of the `election_dates` seed as `state`
rows, with `source` (`key_dates_seed` or `election_dates_seed`), `source_url`, `fetched_at`.
An election-calendar row's `label` is built from the state, the office when the date is for
one chamber, the event, the districts when it is for some, and the qualifier: "Wisconsin
primary", "Louisiana Senate primary", "Alabama House primary, districts 1, 2, 6, 7", "Georgia
primary runoff (if needed)". `office` and `districts` are null unless the row is narrowed.
`/members/{id}/key-dates` returns rows scoped to `congress`, the member's chamber, the member,
or the member's state where `office` and `districts` are null or match the member's seat.

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
