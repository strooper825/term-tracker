"""Source: the industry of each company the tracked members' trades name (ADR 0032).

The tickers come from the PTR staging views (``staging.stg_house_ptr_transactions`` and
``staging.stg_senate_ptr_transactions``), which read the raw tables the PTR sources filled
earlier the same night, so the ticker parsing stays in one place. On a database dbt has not built
yet the views are missing and there is nothing to look up.

Each run reads the SEC's ticker list once. A ticker the SEC lists and this site has not stored
yet gets one submissions request, and its company's CIK, name and SIC code go to
``raw.sec_company``. A stored ticker is not asked again: a company's industry code rarely
changes, and ``--full-refresh`` re-reads them all. A ticker the SEC does not list is logged and
left out; ``dbt test`` lists it as a warning (``assert_trade_tickers_matched``).

``SEC_CONTACT_EMAIL`` must be set: the SEC asks automated clients to declare a contact address
(:mod:`ingest.sec`).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from psycopg import Connection
from psycopg.types.json import Jsonb

from api.config import get_settings
from ingest.db import connect
from ingest.load import record_run, upsert
from ingest.sec import (
    SUBMISSIONS_URL,
    TICKERS_URL,
    SecClient,
    normalise_ticker,
    parse_submissions,
    parse_tickers,
)

log = logging.getLogger("ingest.sec_industry")

SOURCE = "sec_industry"
TRADE_VIEWS = ("staging.stg_house_ptr_transactions", "staging.stg_senate_ptr_transactions")


def traded_tickers(conn: Connection) -> set[str]:
    """Every ticker a tracked member's PTR names, normalised. Views dbt has not built yet are
    skipped (checked with ``to_regclass``: a failed statement would abort the transaction)."""
    tickers: set[str] = set()
    with conn.cursor() as cur:
        for view in TRADE_VIEWS:
            cur.execute("SELECT to_regclass(%s)", (view,))
            if cur.fetchone()[0] is None:
                log.warning("%s does not exist yet; its tickers are looked up after dbt runs", view)
                continue
            cur.execute(f"SELECT DISTINCT ticker FROM {view} WHERE ticker IS NOT NULL")  # noqa: S608
            tickers.update(normalise_ticker(row[0]) for row in cur.fetchall() if row[0].strip())
    return tickers


def stored_tickers(conn: Connection) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT ticker FROM raw.sec_company")
        return {row[0] for row in cur.fetchall()}


def load(
    conn: Connection,
    client: SecClient,
    *,
    tickers: set[str] | None = None,
    full_refresh: bool = False,
) -> int:
    """Look up ``tickers`` (normalised), or every ticker the trades name when none are given."""
    with record_run(conn, SOURCE, TICKERS_URL) as run:
        fetched_at = datetime.now(UTC)
        wanted = traded_tickers(conn) if tickers is None else tickers
        todo = wanted if full_refresh else wanted - stored_tickers(conn)
        rows = []
        unlisted: list[str] = []
        if todo:
            listed = parse_tickers(client.get_json(TICKERS_URL))
            for ticker in sorted(todo):
                if ticker not in listed:
                    unlisted.append(ticker)
                    continue
                cik, _ = listed[ticker]
                company = parse_submissions(client.get_json(SUBMISSIONS_URL.format(cik=cik)), cik)
                rows.append(
                    {
                        "ticker": ticker,
                        "cik": f"{cik:010d}",
                        "company": company.name,
                        "sic": company.sic,
                        "sic_description": company.sic_description,
                        "payload": Jsonb(
                            {
                                "cik": cik,
                                "name": company.name,
                                "sic": company.sic,
                                "sicDescription": company.sic_description,
                                "tickers": list(company.tickers),
                            }
                        ),
                        "source_url": SUBMISSIONS_URL.format(cik=cik),
                        "fetched_at": fetched_at,
                    }
                )
        run.rows_loaded = upsert(conn, "raw", "sec_company", ["ticker"], rows)
        log.info(
            "%d tickers traded, %d looked up, %d stored, %d not listed by the SEC%s; %d requests",
            len(wanted),
            len(todo),
            len(rows),
            len(unlisted),
            f" ({', '.join(unlisted[:20])})" if unlisted else "",
            client.requests_made,
        )
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:
    settings = get_settings()
    if not settings.sec_contact_email:
        raise RuntimeError("SEC_CONTACT_EMAIL is not set (see .env.example and ADR 0032)")
    client = SecClient(settings.sec_contact_email)
    try:
        with connect() as conn:
            return load(conn, client, full_refresh=full_refresh)
    finally:
        client.close()
