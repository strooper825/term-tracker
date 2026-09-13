"""Print dbt connection variables derived from DATABASE_URL, one KEY=value per line.

Usage in a workflow: ``python -m ingest.dbt_env >> "$GITHUB_ENV"``. The password is masked in
the job log first (``::add-mask::``) so it never appears in output. dbt/profiles.yml reads the
PG* variables; SSL mode comes from the URL (Neon requires ``sslmode=require``).
"""

from __future__ import annotations

import sys

from sqlalchemy.engine import make_url

from api.config import get_settings


def dbt_env(database_url: str) -> dict[str, str]:
    url = make_url(database_url)
    return {
        "PGHOST": url.host or "localhost",
        "PGPORT": str(url.port or 5432),
        "PGUSER": url.username or "",
        "PGPASSWORD": url.password or "",
        "PGDATABASE": url.database or "",
        "PGSSLMODE": url.query.get("sslmode", "prefer"),
    }


def main() -> int:
    env = dbt_env(get_settings().database_url)
    if env["PGPASSWORD"]:
        print(f"::add-mask::{env['PGPASSWORD']}", file=sys.stderr)
    for key, value in env.items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
