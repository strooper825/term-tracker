# Term Tracker

A public site that gives each member of Congress a term dashboard: votes, bills, committees,
key dates, fundraising, and more, sourced and refreshed nightly. The full plan, phases, and
working agreements are in [docs/PLAN.md](docs/PLAN.md).

**Status:** Phase 2 (fundraising). Sources `legislators` (unitedstates/congress-legislators),
`congress_gov_bills` (Congress.gov API: bills, amendments, actions, cosponsors),
`congress_gov_house_votes` (Congress.gov `/house-vote`), `senate_votes` (senate.gov LIS
XML), and `fec` (OpenFEC: principal campaign committee totals, current cycle) load into
`raw`; dbt builds the `mart` tables listed in
[docs/data-dictionary.md](docs/data-dictionary.md); the API serves every Phase 1 endpoint
from plan section 6 (`/members`, `/members/{id}`, `/timeline`, `/feed`, `/votes`, `/bills`,
`/committees`, `/key-dates`, `/meta/freshness`) plus `/members/{id}/fundraising`, `/bills`,
`/bills/{congress}/{type}/{number}`, and `/meta/sessions`, documented at `/docs`. Twenty members
are tracked (`dbt/seeds/tracked_members.csv`): Steil, Cotton, Sanders, Slotkin, Kiley, Jeffries,
Crawford, R. Johnson, Baldwin, McConnell, Pocan, Ossoff, Boozman, Murphy, Schiff, Massie, Khanna,
Ocasio-Cortez, M. Johnson, Perry.
`/members/{id}` carries biography (birthday, age, gender, name parts), the full terms
history with "serving since" and term counts, leadership roles, and external ids
(OpenSecrets, Wikipedia, Ballotpedia, C-SPAN, Vote Smart, Wikidata, LIS).

## Stack

| Layer | Tool |
|---|---|
| Database | PostgreSQL 16 locally (Docker) and on Neon (schemas `raw`, `staging`, `mart`, `seed`, `meta`) |
| Ingestion | Python 3.12, `httpx`, `pydantic`, `psycopg` |
| Transformation | dbt-postgres (`raw` -> `staging` -> `mart`) |
| API | FastAPI + SQLAlchemy 2.x, read-only |
| Migrations | Alembic |
| CI | GitHub Actions (ruff, pytest against Postgres 16); nightly ingest workflow |
| Frontend | Next.js + Tailwind under `site/`, statically generated from the API in the nightly job and deployed to Vercel as prebuilt output; design target under `design/` |

## Quick start (Docker)

Prerequisites: Docker Desktop with Compose v2.

```bash
cp .env.example .env
docker compose up --build
```

This starts Postgres, applies the Alembic migrations, and serves the API on port 8000.
Verify:

```bash
curl -i http://localhost:8000/api/v1/meta/freshness
```

Expected: `HTTP/1.1 200 OK` with a body like `{"generated_at": "...", "sources": []}`.
Interactive docs are at <http://localhost:8000/docs>.

Stop with `docker compose down`; add `-v` to also drop the database volume.

## Loading data

The API image only serves; ingestion and dbt run from the host (see local development below
for the venv). With the Compose database up:

```bash
python -m ingest.run --source legislators
```

```bash
python -m ingest.run --source congress_gov_bills
```

```bash
python -m ingest.run --source congress_gov_house_votes
```

```bash
python -m ingest.run --source senate_votes
```

```bash
python -m ingest.run --source fec
```

```bash
python -m ingest.run --source census_geography
```

```bash
python -m ingest.run --source census_acs
```

The last command needs `FEC_API_KEY` in `.env`, the `tracked_members` seed, and the
`legislators` source loaded first (it reads each member's FEC candidate ids from
`raw.legislator`). It makes about four requests per member (68 for the twenty, in a few
seconds) against OpenFEC's limit of 1,000 per hour and 60 per minute, and re-fetches
everything each run. The second command needs `CONGRESS_GOV_API_KEY` in `.env` and the
`tracked_members` seed in the database (run the dbt command below once first). For the
twenty tracked members it makes about 9,385 requests on a first load (4,581 distinct bills
and amendments: member legislation plus the bills every roll call references; about 2 hours
on 2026-09-16, including several long-tenured members whose full sponsorship/cosponsorship
history is paginated before filtering to the current Congress) and considerably less on a
nightly run once everything is unchanged, throttled to 5,000 per hour; add `--full-refresh` to
re-fetch every actions and cosponsors list regardless of Congress.gov `updateDate`.

The two Census sources feed the Constituency tab (ADR 0015) and cover the whole nation, so
their cost does not grow with the tracked members. `census_geography` needs no key: it
downloads three cartographic boundary zips (about 22 MB), builds the SVG maps of every state and
district (about 15 seconds, 4.5 MB of stored path data) and, on every later run, compares the
files' `Last-Modified` and does nothing when they have not changed (`--full-refresh` forces it).
`census_acs` needs `CENSUS_API_KEY` in `.env` and makes four Data API requests in all.

```bash
PGPORT=5433 dbt build --project-dir dbt --profiles-dir dbt
```

Then `curl http://localhost:8000/api/v1/members`. dbt reads `PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD`, `PGDATABASE` (defaults match the Compose database except the port). dbt is an
optional extra: `pip install -e ".[dev,dbt]"`.

## Local development (host Python)

Prerequisites: Python 3.12 or newer and a running Postgres (the Compose `db` service works:
`docker compose up db`, which listens on host port 5433).

```bash
python -m venv .venv
. .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev,dbt]"
cp .env.example .env          # DATABASE_URL points at the Compose db on localhost:5433
alembic upgrade head
uvicorn api.main:app --reload
```

Checks, the same ones CI runs:

```bash
ruff check . && ruff format --check .
pytest -q
```

Integration tests (marked `integration`) need the database, and the end-to-end members test
(also marked `dbt`) needs the dbt CLI on PATH. Both are skipped locally when unavailable and
fail in CI, where `CI=true` is set. Ingestion tests use recorded fixtures under
`tests/fixtures/`; nothing in the test suite calls a live API.

## Configuration

All settings come from environment variables, optionally loaded from `.env` (git-ignored).
`.env.example` lists every name.

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API, Alembic, tests | SQLAlchemy URL, `postgresql+psycopg://...` |
| `CONGRESS_GOV_API_KEY` | Ingestion (Phase 1) | Issued via api.data.gov |
| `FEC_API_KEY` | Ingestion (Phase 2) | Issued via api.data.gov |
| `CENSUS_API_KEY` | Ingestion (Constituency tab) | Issued by the Census Bureau, free; the Data API refuses a request without one |

GitHub Actions repository secrets use the same names: `CONGRESS_GOV_API_KEY`, `FEC_API_KEY` and
`CENSUS_API_KEY`. How the nightly job reaches the managed Postgres is decided in Phase 1e.

## Repository layout

```
api/            FastAPI app: main.py, routers/, schemas/, config.py, db.py
ingest/         Ingestion CLI (python -m ingest.run --source all), sources/, models/, load.py
dbt/            dbt project: models/staging, models/mart, seeds (fips, tracked_members), macros, tests
migrations/     Alembic environment and versions/
tests/          api/, ingest/, fixtures/ (recorded payloads; CI never calls live APIs)
docs/           PLAN.md, data-dictionary.md, verification-notes.md, adr/
.github/        ci.yml (lint + tests), ingest.yml (ingest -> dbt -> freshness -> deploy), deploy.yml (dbt build -> site build -> Vercel)
```

## Nightly job and deploys

Two workflows, both against the managed Neon database named by the `DATABASE_URL` repository
secret (never in `.env`; local development keeps its own URL):

- `.github/workflows/ingest.yml` runs at 06:00 UTC: migrations, `dbt seed` (so
  `seed.tracked_members` exists on a fresh database), `python -m ingest.run --source all`
  (votes before bills), `dbt build`, then `python -m ingest.freshness`, which fails the run
  when any source has no success in the last 26 hours and writes a freshness table plus the
  database size against the 0.5 GB free tier to the step summary. On success it calls
  `deploy.yml` in the same run. A failure in either job opens an issue labelled
  `nightly-failure` (or comments on the open one); the next fully successful run closes it.
  Run it by hand from the Actions tab (`workflow_dispatch`), optionally with `full_refresh`,
  `max_age_hours`, or `deploy: false`.
- `.github/workflows/deploy.yml` migrates and runs `dbt build` to re-derive the mart from
  this commit's models, starts the API in the runner against the managed database, builds the
  static site, checks that the output makes no API calls, and deploys the prebuilt output with
  the Vercel CLI. It never ingests, so the rebuild only re-derives the mart from the raw data
  already there (about 23 s against Neon). That step exists because the API it serves is the
  branch's code: without it a branch that adds a mart column renders against whatever the last
  nightly built and every request selecting the new column answers 500. Dispatch it on its own
  to publish a frontend change without an ingest; `deploy_target` is `auto` (production from
  `main`, preview from any other branch), `preview`, or `production`. When a page fails to
  render, the run prints the API's log so the reason is in the run rather than only the status.


## Site

`site/` is the Next.js frontend (see `site/README.md`). It is built by `deploy.yml` (nightly
after `dbt build`, or on demand) from an API started in the runner against the managed
database, and deployed with the Vercel CLI as prebuilt output (`VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secrets). No runtime server; the built pages make no API calls. To build
locally: start the API (`uvicorn api.main:app`), then in `site/` run
`API_BASE_URL=http://127.0.0.1:8000 npm run build`.

## Working agreements

See [docs/PLAN.md, section 11](docs/PLAN.md). In short: one milestone step per PR, fixtures not
live APIs in tests, an ADR for any deviation from the plan, no secrets in code or fixtures, and
every "done when" check reported with numbers in the PR description.
