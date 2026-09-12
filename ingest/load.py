"""Upsert helpers and ingest-run bookkeeping shared by all sources.

Every load is an ``INSERT ... ON CONFLICT (natural key) DO UPDATE`` so re-running is safe
(plan section 3, principle 1). Each source runs inside :func:`record_run`, which writes the
``meta.ingest_run`` row that backs ``/api/v1/meta/freshness``.
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

from psycopg import Connection, sql


def upsert(
    conn: Connection,
    schema: str,
    table: str,
    key_columns: Sequence[str],
    rows: Sequence[Mapping[str, Any]],
) -> int:
    """Upsert ``rows`` (all with the same keys) into ``schema.table``. Returns the row count.

    Runs in the current transaction of ``conn``; the caller commits.
    """
    if not rows:
        return 0
    columns = list(rows[0].keys())
    missing = [k for k in key_columns if k not in columns]
    if missing:
        raise ValueError(f"key columns {missing} not present in rows")
    update_columns = [c for c in columns if c not in key_columns]

    statement = sql.SQL(
        "INSERT INTO {schema}.{table} ({columns}) VALUES ({values}) "
        "ON CONFLICT ({keys}) DO UPDATE SET {updates}"
    ).format(
        schema=sql.Identifier(schema),
        table=sql.Identifier(table),
        columns=sql.SQL(", ").join(sql.Identifier(c) for c in columns),
        values=sql.SQL(", ").join(sql.Placeholder(c) for c in columns),
        keys=sql.SQL(", ").join(sql.Identifier(c) for c in key_columns),
        updates=sql.SQL(", ").join(
            sql.SQL("{col} = EXCLUDED.{col}").format(col=sql.Identifier(c)) for c in update_columns
        ),
    )
    with conn.cursor() as cur:
        cur.executemany(statement, list(rows))
    return len(rows)


@dataclass
class IngestRun:
    id: int
    rows_loaded: int = 0


@contextmanager
def record_run(conn: Connection, source: str, source_url: str) -> Iterator[IngestRun]:
    """Record a run in ``meta.ingest_run``.

    A ``running`` row is committed up front. On normal exit the load transaction is committed
    and the row marked ``success`` with ``rows_loaded``; on exception the load is rolled back
    (no partial data) and the row marked ``failed`` with the error, then the exception is
    re-raised.
    """
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO meta.ingest_run (source, source_url, status) "
            "VALUES (%s, %s, 'running') RETURNING id",
            (source, source_url),
        )
        row = cur.fetchone()
        assert row is not None
        run = IngestRun(id=row[0])
    conn.commit()

    try:
        yield run
    except Exception as exc:
        conn.rollback()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE meta.ingest_run SET status = 'failed', finished_at = now(), error = %s "
                "WHERE id = %s",
                (f"{type(exc).__name__}: {exc}"[:4000], run.id),
            )
        conn.commit()
        raise
    else:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE meta.ingest_run SET status = 'success', finished_at = now(), "
                "rows_loaded = %s WHERE id = %s",
                (run.rows_loaded, run.id),
            )
        conn.commit()
