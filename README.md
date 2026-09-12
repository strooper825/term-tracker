# Term Tracker

A public site that gives each member of Congress a term dashboard: votes, bills, committees,
key dates, fundraising, and more, sourced and refreshed nightly. The full plan, phases, and
working agreements are in [docs/PLAN.md](docs/PLAN.md).

**Status:** Phase 0 (scaffold). The database is empty, the API serves only
`/api/v1/meta/freshness`, and no ingestion sources are registered yet.

## Stack

| Layer | Tool |
|---|---|
| Database | PostgreSQL 16 (schemas `raw`, `staging`, `mart`, `meta`) |
| Ingestion | Python 3.12, `httpx`, `pydantic`, `psycopg` |
| Transformation | dbt-postgres (`raw` -> `staging` -> `mart`) |
| API | FastAPI + SQLAlchemy 2.x, read-only |
| Migrations | Alembic |
| CI | GitHub Actions (ruff, pytest against Postgres 16) |

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

## Local development (host Python)

Prerequisites: Python 3.12 or newer and a running Postgres (the Compose `db` service works:
`docker compose up db`, which listens on host port 5433).

```bash
python -m venv .venv
. .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env          # DATABASE_URL points at the Compose db on localhost:5433
alembic upgrade head
uvicorn api.main:app --reload
```

Checks, the same ones CI runs:

```bash
ruff check . && ruff format --check .
pytest -q
```

Integration tests (marked `integration`) need the database. They are skipped locally when it
is unreachable and fail in CI, where `CI=true` is set.

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
dbt/            dbt project: models/staging, models/mart, seeds, macros
migrations/     Alembic environment and versions/
tests/          api/, ingest/, fixtures/ (recorded payloads; CI never calls live APIs)
docs/           PLAN.md, data-dictionary.md, adr/
.github/        ci.yml (lint + tests), nightly.yml (ingest -> dbt -> freshness)
```

## Working agreements

See [docs/PLAN.md, section 11](docs/PLAN.md). In short: one milestone step per PR, fixtures not
live APIs in tests, an ADR for any deviation from the plan, no secrets in code or fixtures, and
every "done when" check reported with numbers in the PR description.
