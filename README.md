# Term Tracker

A public site that gives each member of Congress a term dashboard: votes, bills, committees,
key dates, fundraising, and more, sourced and refreshed nightly. The full plan, phases, and
working agreements are in [docs/PLAN.md](docs/PLAN.md).

**Status:** Phase 1e. Sources `legislators` (unitedstates/congress-legislators),
`congress_gov_bills` (Congress.gov API: bills, amendments, actions, cosponsors),
`congress_gov_house_votes` (Congress.gov `/house-vote`), and `senate_votes` (senate.gov LIS
XML) load into `raw`; dbt builds the `mart` tables listed in
[docs/data-dictionary.md](docs/data-dictionary.md); the API serves every Phase 1 endpoint
from plan section 6 (`/members`, `/members/{id}`, `/timeline`, `/feed`, `/votes`, `/bills`,
`/committees`, `/key-dates`, `/meta/freshness`), documented at `/docs`.

## Stack

| Layer | Tool |
|---|---|
| Database | PostgreSQL 16 locally (Docker) and on Neon (schemas `raw`, `staging`, `mart`, `seed`, `meta`) |
| Ingestion | Python 3.12, `httpx`, `pydantic`, `psycopg` |
| Transformation | dbt-postgres (`raw` -> `staging` -> `mart`) |
| API | FastAPI + SQLAlchemy 2.x, read-only |
| Migrations | Alembic |
| CI | GitHub Actions (ruff, pytest against Postgres 16); nightly ingest workflow |

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

The second command needs `CONGRESS_GOV_API_KEY` in `.env` and the `tracked_members` seed in the
database (run the dbt command below once first). It makes roughly 1,000 to 1,900 requests for two
members (member legislation plus the bills every roll call references), throttled to 5,000 per
hour; add `--full-refresh` to re-fetch every actions and
cosponsors list regardless of Congress.gov `updateDate`.

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

GitHub Actions repository secrets use the same two names: `CONGRESS_GOV_API_KEY` and
`FEC_API_KEY`. How the nightly job reaches the managed Postgres is decided in Phase 1e.

## Repository layout

```
api/            FastAPI app: main.py, routers/, schemas/, config.py, db.py
ingest/         Ingestion CLI (python -m ingest.run --source all), sources/, models/, load.py
dbt/            dbt project: models/staging, models/mart, seeds (fips, tracked_members), macros, tests
migrations/     Alembic environment and versions/
tests/          api/, ingest/, fixtures/ (recorded payloads; CI never calls live APIs)
docs/           PLAN.md, data-dictionary.md, adr/
.github/        ci.yml (lint + tests), nightly.yml (ingest -> dbt -> freshness)
```

## Nightly job

`.github/workflows/nightly.yml` runs at 06:00 UTC against the managed Neon database named by
the `DATABASE_URL` repository secret (never in `.env`; local development keeps its own URL):
migrations, `python -m ingest.run --source all` (votes before bills), `dbt build`, then
`python -m ingest.freshness`, which fails the run when any source has no success in the last
26 hours and writes a freshness table plus the database size against the 0.5 GB free tier to
the step summary. A failure opens an issue labelled `nightly-failure` (or comments on the open
one); the next success closes it. Run it by hand from the Actions tab (`workflow_dispatch`),
optionally with `full_refresh`.


## Working agreements

See [docs/PLAN.md, section 11](docs/PLAN.md). In short: one milestone step per PR, fixtures not
live APIs in tests, an ADR for any deviation from the plan, no secrets in code or fixtures, and
every "done when" check reported with numbers in the PR description.
