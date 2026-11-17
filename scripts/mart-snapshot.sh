#!/usr/bin/env bash
# Dump or load the schemas the API reads (mart, seed, meta) as one custom-format file (ADR 0034).
#
#   scripts/mart-snapshot.sh dump    <database url> <file>
#   scripts/mart-snapshot.sh restore <database url> <file>
#
# The ingest run dumps Neon once after its dbt build; the deploy loads that file into a Postgres
# inside the runner and builds the site from it, so the build's ~1,560 API connections never
# reach Neon. The client tools come from the postgres:17 image: pg_dump must be at least the
# server's major version and the runner's own client may be older.
set -euo pipefail

action="${1:?dump or restore}"
url="${2:?database url}"
file="${3:?file}"

# SQLAlchemy URLs (postgresql+psycopg://) are not libpq URLs.
url=$(printf '%s' "$url" | sed -E 's#^postgres(ql)?(\+psycopg)?://#postgresql://#')
dir=$(cd "$(dirname "$file")" && pwd)
name=$(basename "$file")

run() {
  docker run --rm --network host -e PGURL="$url" -v "$dir:/w" -w /w postgres:17 "$@"
}

case "$action" in
  dump)
    run sh -c 'pg_dump "$PGURL" --format=custom --no-owner --no-privileges \
      --schema=mart --schema=seed --schema=meta --file="$0"' "$name"
    echo "mart snapshot: $(du -h "$file" | cut -f1) compressed"
    ;;
  restore)
    run sh -c 'pg_restore --dbname="$PGURL" --no-owner --no-privileges --exit-on-error "$0"' "$name"
    run psql "$url" -Atc "SELECT 'loaded ' || count(*) || ' tables' FROM information_schema.tables WHERE table_schema IN ('mart', 'seed', 'meta')"
    ;;
  *)
    echo "usage: $0 dump|restore <database url> <file>" >&2
    exit 2
    ;;
esac
