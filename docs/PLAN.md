# Congressional Term Tracker — Build Plan for Claude Code

**Owner:** Zach Nohr (reviews all PRs and code; Claude Code implements)
**Status:** v0.2 — September 12, 2026 (Phases 0–1e merged; frontend and DB host decided)
**Working name:** TBD (candidates: De Facto, Amicus, Polis, Civic Ledger, Sine Die)

---

## 1. What we are building

A public website that gives each member of Congress a **term dashboard** — the same visual density VoteHub applies to a campaign race, applied instead to a sitting member's term in office. Every panel is data-driven, sourced, and refreshed nightly.

**v1 test subjects (119th Congress, Jan 3 2025 – Jan 3 2027):**

| Member | Chamber | Seat | Bioguide ID | Party |
|---|---|---|---|---|
| Bryan Steil | House | WI-1 | S001213 | R |
| Tom Cotton | Senate | Arkansas (Class 2) | C001095 | R |

Both are on the ballot November 3, 2026, which makes the "next election" panel live for both test cases.

**Long-term:** all 535 members, then state legislatures in swing states (Wisconsin first). The schema and ingestion must be written for N members from day one; only the *seed list* is limited to two.

---

## 2. Dashboard modules (VoteHub reference → term tracker)

Phase column indicates when the panel goes live. Claude Code builds the data layer for the phase in progress; the frontend renders panels only when their data exists.

| # | Panel | Contents | Source | Phase |
|---|---|---|---|---|
| 1 | Term at a glance (header) | Photo, party, seat, term dates, days remaining, votes cast, missed-vote %, party-unity %, bills sponsored / cosponsored | Congress.gov, Senate.gov, Voteview | 1 |
| 2 | Next election | Election date, opponent if known, prior result; race rating not available (ADR 0008) | Computed in the mart; hand-maintained nominee seed; MIT Election Lab (Clerk statistics) | 1 (date only) → 2 |
| 3 | Activity counts | Floor votes, bills sponsored, bills cosponsored, committee assignments | Congress.gov | 1 |
| 4 | Legislative timeline (dot chart) | Weekly dots colored by type: vote, sponsored bill, cosponsored bill, committee action, floor speech | Congress.gov | 1 |
| 5 | Activity feed | Chronological list: "Voted YEA on H.R. 1234", "Introduced S. 567", etc. | Congress.gov, Senate.gov | 1 |
| 6 | Key dates | Recesses, session end, election day, sine die, filing deadlines | House/Senate calendars, state SOS | 1 (static seed) |
| 7 | Fundraising | Cycle raised, cash on hand, small-donor %, PAC vs individual share, top industries | FEC API | 2 |
| 8 | Stock trades | Periodic transaction reports, flagged against committee jurisdiction | House Clerk PTRs, Senate eFD | 3 |
| 9 | Public statements | Press releases, floor speeches (Congressional Record) | Official site RSS, GovInfo | 3 |
| 10 | District map | Federal grants/awards to the district or state (USAspending), optionally town-hall events | USAspending API | 3 |
| 11 | Ideology / alignment | DW-NOMINATE score, party-unity trend, comparison to chamber | Voteview | 3 |
| 12 | Election results (locked) | "Unlocks Nov 3, 2026" | AP / state SOS | 4 |

---

## 3. Architecture

```
┌──────────────────┐   nightly    ┌──────────────┐   dbt    ┌──────────────┐
│ Ingestion (Python)│ ───────────▶│ Postgres raw │ ───────▶ │ Postgres mart│
│  congress_gov.py  │             │  schema: raw │          │ schema: mart │
│  senate_votes.py  │             └──────────────┘          └──────┬───────┘
│  legislators.py   │                                              │
└──────────────────┘                                              ▼
                                                          ┌──────────────┐
                                                          │ FastAPI      │
                                                          │ /api/v1/...  │
                                                          └──────┬───────┘
                                                                 ▼
                                                          ┌──────────────┐
                                                          │ Frontend     │
                                                          │ (decision §7)│
                                                          └──────────────┘
```

**Stack (settled in prior planning, carried forward):**

- **Database:** PostgreSQL 16
- **Ingestion:** Python 3.12, `httpx`, `pydantic` models per source, `psycopg` for loads
- **Transformation:** dbt-postgres (`raw` → `staging` → `mart`)
- **API:** FastAPI + SQLAlchemy 2.x (read-only; serves the `mart` schema). In v1 it is the data contract the static site build reads from; public deployment is deferred.
- **Frontend:** Next.js + Tailwind, statically generated once per night after dbt runs; deployed to Vercel from the workflow (prebuilt output, no Git integration). No runtime API server in v1. See §7.
- **Managed database:** Neon (free tier, Postgres 16) for the nightly job and site build. Local dev stays on Docker Postgres; the two never share a connection string.
- **Scheduling:** GitHub Actions cron (nightly, 06:00 UTC) in `ingest.yml`: migrate → seed → ingest → dbt build → freshness check, then `deploy.yml` (site build → static check → Vercel deploy) called in the same run. `deploy.yml` is also dispatchable alone, so a frontend change ships without an ingest. Migrate to a host-side scheduler if runtime exceeds ~30 min
- **Analysis (later):** R against `mart` for the ideology/alignment work
- **Secrets:** `CONGRESS_GOV_API_KEY` and `FEC_API_KEY` — in `.env` locally, GitHub Actions repository secrets in CI. Never committed. `.env.example` lists both names with blank values.

**Principles Claude Code must follow:**

1. Ingestion is **idempotent** — every load is an upsert keyed on the source's natural key. Re-running a night is safe.
2. Raw tables store the source payload (JSONB) plus extracted key columns. Transformation happens in dbt, not in Python.
3. Every mart table carries `source`, `source_url`, and `fetched_at` so the frontend can show provenance on every number.
4. Rate limits are respected in code (Congress.gov: 5,000 req/hour per key). Backoff on 429.
5. Member scope is driven by a `tracked_members` seed table, not hard-coded IDs.

---

## 4. Data model (Phase 1)

`constituency` remains the hub table from the earlier schema design. Phase 1 tables:

| Table | Grain | Natural key | Notes |
|---|---|---|---|
| `constituency` | one state or district | `fips_state`, `district` (0 for at-large / Senate) | Seeded from Census FIPS; Senate seats reference state with district = NULL |
| `member` | one person | `bioguide_id` | From `congress-legislators` YAML; includes `fec_ids[]`, `govtrack_id`, `icpsr_id` for later joins |
| `term` | one member-term | `bioguide_id`, `congress`, `chamber`, `start_date` | Ties member → constituency; 119th Congress only in v1 |
| `tracked_member` | seed | `bioguide_id` | Controls ingestion scope; starts with S001213, C001095 |
| `committee` | one committee/subcommittee | `thomas_id` | From `congress-legislators` committees YAML |
| `committee_membership` | member × committee × congress | composite | Rank, title (chair/ranking) |
| `bill` | one bill | `congress`, `bill_type`, `bill_number` | Title, policy area, introduced date, latest action, status |
| `bill_sponsorship` | bill × member | composite + `role` (sponsor/cosponsor) | `date` for cosponsor join date |
| `bill_action` | one action on a bill | `bill_id`, `action_date`, `action_code`/text hash | Feeds timeline |
| `roll_call` | one roll-call vote | `congress`, `chamber`, `session`, `roll_number` | Question, result, bill link, date, totals |
| `member_vote` | roll_call × member | composite | Position: Yea/Nay/Present/Not Voting |
| `key_date` | one calendar event | `date`, `label`, `scope` (chamber/state/member) | Seeded manually in v1 |

**Mart views/tables (dbt):** `mart.member_summary`, `mart.member_activity_timeline`, `mart.member_feed`, `mart.member_vote_stats` (attendance, party unity computed against majority of member's party on each roll call).

Phase 2 adds `fec_committee`, `fec_summary`, `fec_contribution_agg`. Phase 3 adds `stock_trade`, `statement`, `award` (USAspending).

---

## 5. Data sources and access

| Source | What it provides | Auth | Notes |
|---|---|---|---|
| `unitedstates/congress-legislators` (GitHub YAML) | Members, terms, IDs, committees, memberships | None | Load first; everything joins to it |
| Congress.gov API (`api.congress.gov/v3`) | Bills, sponsors/cosponsors, actions, members, committees, **House roll-call votes** (`/house-vote`) | `CONGRESS_GOV_API_KEY` | 5,000 req/hr |
| Senate.gov vote XML (`senate.gov/legislative/LIS/roll_call_votes/`) | Senate roll-call votes and member positions | None | Menu XML per session, then one XML per vote |
| Voteview (`voteview.com/data`) | Ideology scores, historical votes | None | CSV bulk; Phase 3 |
| Census (FIPS, ACS) | Constituency geography and demographics | key optional | FIPS seed in Phase 1; ACS in Phase 3 |
| OpenFEC API (`api.open.fec.gov/v1`) | Committees, totals, contributions | `FEC_API_KEY` | Phase 2 |
| MIT Election Data and Science Lab (Harvard Dataverse) | House and Senate constituency returns 1976–2024, compiled from the Clerk of the House statistics | None; House file behind a Dataverse guestbook | Committed snapshots in `data/mit_election_lab/`, refreshed by hand each cycle (ADR 0008) |
| House Clerk / Senate eFD | Financial disclosures, PTRs | None (scrape/PDF) | Phase 3; hardest source |
| USAspending API | Awards by district/state | None | Phase 3 |

**Zach's setup tasks before Phase 1 starts:**

1. API keys obtained: Congress.gov and OpenFEC (both issued through api.data.gov).
2. Repo created: `strooper825/term-tracker`. Actions secrets added: `CONGRESS_GOV_API_KEY` (Congress.gov) and `FEC_API_KEY` (OpenFEC).
3. Provision a Postgres instance (local Docker for dev; a small managed instance — Neon, Supabase, or Railway — for the nightly job to write to).

---

## 6. API surface (Phase 1)

All endpoints read-only, JSON, versioned under `/api/v1`.

| Endpoint | Returns | Feeds panel |
|---|---|---|
| `GET /members` | Tracked members with seat and photo | Nav |
| `GET /members/{bioguide}` | Header summary (term dates, counts, attendance, party unity) | 1, 3 |
| `GET /members/{bioguide}/timeline?from=&to=` | Weekly buckets of typed events | 4 |
| `GET /members/{bioguide}/feed?cursor=&limit=` | Paginated chronological feed | 5 |
| `GET /members/{bioguide}/votes?limit=` | Recent roll calls with position | 5 |
| `GET /members/{bioguide}/bills?role=sponsor\|cosponsor` | Bill list | 3, 5 |
| `GET /members/{bioguide}/committees` | Assignments | 1 |
| `GET /members/{bioguide}/key-dates` | Calendar events | 6 |
| `GET /meta/freshness` | Last successful ingest per source | Footer provenance |

OpenAPI docs auto-generated at `/docs`. Every response includes `sources[]` with URLs and `fetched_at`.

---

## 7. Frontend — decided (v0.2): Option A, thin

**Decision.** Next.js + Tailwind. The site is statically generated at build time from the Phase 1d API and deployed as prebuilt output; there is no runtime API server and no client-side data fetching. The frontend renders what the API returns and computes nothing about members itself: every number on a page is a mart column (via the API), and only formatting, filtering, sorting, and layout happen in the browser. Claude Design output under `design/` is the visual target.

The original comparison is kept below for the record.

Two viable paths. Both consume the same FastAPI layer, so the backend build is not blocked by this choice.

| | Option A: Next.js + Tailwind | Option B: Django templates + HTMX |
|---|---|---|
| Fit with Claude Design output | Strong — Design exports React/Tailwind components directly | Weak — HTML/CSS must be re-templated |
| Language surface for review | Adds TypeScript to Python/SQL | Stays in Python |
| Interactivity (dot timeline, hover, filters) | Native | Doable, more manual |
| Hosting | Vercel free tier | Same host as API |
| Recommendation | **Default** unless review burden of TypeScript is a blocker | Choose if single-language codebase matters more than design fidelity |

Recommendation: **Option A.** The VoteHub reference is interaction-heavy (hover states on the timeline, filters on the trail, tabbed panels), and Claude Design's export path lands in React. Charts via Recharts or D3.

---

## 8. Claude Design deliverables

Produced in Claude Design, exported, and handed to Claude Code as visual targets. Iterate in critique rounds (prior experience: three rounds minimum to reach a usable layout).

1. **Full-page term dashboard mockup** — desktop and mobile, populated with real Steil data so proportions are honest. All twelve panels laid out; Phases 2–4 panels shown in a "locked / coming" state like VoteHub's early-voting card.
2. **Design tokens** — color scale (party colors, event-type colors for the timeline), type scale, spacing, card style. Exported as a Tailwind config.
3. **Custom graphics:**
   - Event-type icon set (vote, bill introduced, cosponsored, committee, speech, fundraiser, trade, statement) — SVG, single-color, 16/24 px
   - Chamber and party badges
   - "Locked panel" illustration
   - Empty-state illustration for members with no activity in a window
   - Site logo/wordmark once the name is chosen
4. **Chart specs** — the weekly dot timeline and the attendance/party-unity gauges, specified with dimensions, legend, and hover behavior so Claude Code can implement them faithfully.

---

## 9. Repository layout

```
term-tracker/
├── README.md
├── .env.example
├── docker-compose.yml          # postgres + api for local dev
├── pyproject.toml
├── ingest/
│   ├── sources/
│   │   ├── legislators.py
│   │   ├── congress_gov.py
│   │   └── senate_votes.py
│   ├── models/                 # pydantic schemas per source
│   ├── load.py                 # upsert helpers
│   └── run.py                  # CLI: python -m ingest.run --source all
├── dbt/
│   ├── models/staging/
│   ├── models/mart/
│   └── seeds/                  # tracked_members.csv, key_dates.csv, fips.csv
├── api/
│   ├── main.py
│   ├── routers/
│   └── schemas/
├── migrations/                 # alembic
├── tests/
│   ├── ingest/                 # fixture-based, no live API calls
│   └── api/
├── .github/workflows/
│   ├── ci.yml                  # lint, test, dbt compile
│   ├── ingest.yml              # nightly: ingest → dbt run → freshness check → deploy.yml
│   └── deploy.yml              # site build → static check → Vercel (also on demand)
└── docs/
    ├── data-dictionary.md
    └── adr/                    # architecture decision records
```

---

## 10. Phased milestones

### Phase 0 — Scaffold (1 PR)
- Repo layout above, Docker Compose with Postgres, Alembic initial migration, CI running lint + tests, README with setup steps.
- **Done when:** `docker compose up` gives a working empty DB and `/api/v1/meta/freshness` returns 200.

### Phase 1 — Votes + bills for Steil and Cotton
1. **1a Legislators + constituency** — load FIPS seed and `congress-legislators`; `tracked_member` seeded. *Done when* `/members` returns both members with correct seats and committee assignments.
2. **1b Bills** — Congress.gov sponsored/cosponsored bills, actions. *Done when* counts match Congress.gov member pages within tolerance (document the tolerance).
3. **1c Votes** — House votes via Congress.gov `/house-vote`; Senate votes via senate.gov XML. *Done when* `member_vote` row counts equal the chamber's roll-call count for the 119th, and attendance % matches GovTrack's published figure within 0.5 pts.
4. **1d Mart + API** — dbt models, all Phase 1 endpoints, freshness endpoint. *Done when* every endpoint has a test and OpenAPI docs render.
5. **1e Nightly job** — GitHub Actions cron running ingest → dbt → freshness check with failure alerting. *Done when* three consecutive nights succeed unattended.
6. **1f Frontend v1** (after §7 decision) — panels 1, 3, 4, 5, 6 live; others locked.

### Phase 2 — Fundraising
- OpenFEC committee lookup via `fec_ids`, cycle totals, small-donor %, contribution aggregates by industry (requires a classification source — decide between OpenSecrets bulk data and self-built employer/occupation mapping).
- Panel 7 live.

### Phase 3 — Everything else
- Stock trades (PTR parsing), statements (RSS + Congressional Record), USAspending district awards + map, Voteview ideology.
- Panels 8–11 live.

### Phase 4 — Expand
- All 535 members (ingestion is already N-member; this is a seed change plus a runtime check).
- Election results panel. Comparison view (member vs member).
- Begin Wisconsin state-legislature sourcing.

---

## 11. Working agreements for Claude Code

- **PR size:** one milestone step (1a, 1b …) per PR. Each PR includes migration, code, tests, and a `docs/data-dictionary.md` update for any new table.
- **Tests:** ingestion tests run against recorded fixtures under `tests/fixtures/` — never live APIs in CI.
- **ADRs:** any deviation from this plan gets a short ADR in `docs/adr/` explaining why, before the code.
- **No silent assumptions:** if a source's shape differs from what this plan expects, stop and report rather than adapt in place.
- **Validation:** every "done when" above is a check Claude Code runs and reports numbers for in the PR description, so Zach can review against the external source.
- **Secrets and PII:** none in code, none in fixtures. Contributor data in Phase 2 is aggregated, never stored at individual level in the mart.

---

## 12. Open decisions

| Decision | Options | Needed by |
|---|---|---|
| Frontend stack | Decided: A, Next.js + Tailwind, static (§7) | Done |
| Site name | De Facto, Amicus, Polis, Civic Ledger, Sine Die | Before logo work |
| Managed Postgres host | Decided: Neon free tier, Postgres 16 (§3) | Done |
| Industry classification for donations | OpenSecrets bulk / self-built | Still open. Phase 2 v1 shipped the Fundraising panel without contributor categories (ADR 0006); `fec_contribution_agg` and "top industries" wait on this |
| Map content | USAspending awards (recommended) / events / none | Before Phase 3 |
| Race rating source | Cook (paywalled) / Sabato / Inside Elections / omit | Decided: omit for now; paywalled editorial content, the card shows "Not yet available" (ADR 0008) |

### Open items

Work that is wanted but not scheduled. Recorded here so the roadmap lives in the repo.

| Item | What it means |
|---|---|
| Bill search across all legislation | Today only bills a tracked member sponsored or cosponsored, plus bills a recorded roll call names, reach `mart.bill` and get a page; searching the whole Congress needs the full bill list ingested and an index. **Deployment becomes the binding constraint before ingestion does.** The 1,874 bill pages built on 2026-09-13 are 178 MB across 9,435 files: Next writes one HTML page plus four prefetch payloads per route. Vercel's free tier refused that deploy outright ("more than 5000, code: api-upload-free") until `deploy.yml` began uploading a single archive with `--archive=tgz`. A full Congress of roughly 19,000 bills extrapolates to about 1.8 GB and 95,000 files, which will exceed free-tier deployment limits whatever the upload format, so bill search needs a hosting or output decision (fewer prefetch payloads, a runtime-rendered search, or a paid tier) before it needs more ingestion. |
| Bill full text | The text of each bill version (Congress.gov `/text`), which is far larger than the CRS summaries and needs a storage decision before it is loaded. |
| Itemised FEC contributions | Individual contributions with donor name, employer, occupation, city and state, and the industry categories the Phase 2 panel omits; hundreds of thousands of rows per cycle, so it needs a storage and retention decision (Neon free tier is 0.5 GB) and a contributor-classification source. |
| FEC independent expenditures | Money spent for or against a member by committees the member does not control; a separate OpenFEC endpoint and a separate panel line. |
| FEC disbursements | Where the campaign spent its money (vendors, payroll, advertising), the counterpart to the receipt breakdown already shown. |
| Leadership PAC and joint fundraising figures | Show the committees ADR 0006 excludes beside the principal campaign committee, labelled so the money is not double counted. |
| Chamber-wide fundraising percentile | Rank a member's small-donor share against every incumbent in their chamber. Needs totals for ~535 principal committees (one OpenFEC request each, or the candidate-totals list endpoint with an incumbent filter), a new raw table, and an ADR; the six-member rank the mart could compute today is too small a denominator to mean anything. |
| Expanding tracked members in batches | `seed.tracked_members` drives scope, so growth is a seed change, but each batch multiplies Congress.gov requests and mart size; needs a batching plan and a runtime budget before the 535-member step in Phase 4. |
| Historical legislators YAML | `legislators-historical.yaml` for members who have left office, so a departed member's dashboard and their cosponsorships still resolve to a name. |
