"""Source: Senate roll-call votes from senate.gov LIS XML.

Per session of the current Congress (walked from 1 until the menu is missing) the menu
``vote_menu_{c}_{s}.xml`` is fetched and stored whole; then every roll call listed that is
not yet in ``raw.senate_vote`` (or all of them on ``--full-refresh``) is fetched from
``vote_{c}_{s}_{n}.xml`` and stored as JSON, every senator position included. The XML is
converted with xmltodict, with ``vote`` and ``member`` forced to lists; nothing else changes.

senate.gov publishes no update timestamp on the menu, so already-fetched roll calls are not
re-read unless ``--full-refresh`` is given. Requests are throttled to about 4 per second.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import httpx
import xmltodict
from psycopg import Connection
from psycopg.types.json import Jsonb
from pydantic import ValidationError

from api.config import get_settings
from ingest.congress_gov import RateLimiter
from ingest.db import connect
from ingest.http import USER_AGENT, fetch_text
from ingest.load import record_run, upsert

log = logging.getLogger("ingest.senate_votes")

SOURCE = "senate_votes"
BASE_URL = "https://www.senate.gov/legislative/LIS/"
KEY_COLUMNS = ["congress", "session", "vote_number"]

Fetch = Callable[[str], str]


class SourceShapeError(RuntimeError):
    """The XML does not have the shape docs/PLAN.md expects. Stop and report."""


class SenateGovClient:
    def __init__(self, *, fetch: Fetch | None = None, limiter: RateLimiter | None = None) -> None:
        self._http = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60.0)
        self._fetch: Fetch = fetch or (lambda url: fetch_text(url, client=self._http))
        self.limiter = limiter or RateLimiter(240, period_seconds=60.0)
        self.requests_made = 0

    def get_text(self, path: str) -> str:
        self.limiter.acquire()
        self.requests_made += 1
        return self._fetch(BASE_URL + path)

    def close(self) -> None:
        self._http.close()


def menu_path(congress: int, session: int) -> str:
    return f"roll_call_lists/vote_menu_{congress}_{session}.xml"


def vote_path(congress: int, session: int, vote_number: int) -> str:
    return (
        f"roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{vote_number:05d}.xml"
    )


def parse_xml(text: str, root: str, where: str) -> dict[str, Any]:
    try:
        data = xmltodict.parse(text, force_list=("vote", "member"))
    except Exception as exc:  # xmltodict raises ExpatError subclasses
        raise SourceShapeError(f"{where}: not well-formed XML: {exc}") from exc
    payload = data.get(root)
    if not isinstance(payload, dict):
        raise SourceShapeError(f"{where}: expected root element <{root}>, got {list(data)}")
    return payload


def _validate(model: type, item: Any, where: str) -> None:
    try:
        model.model_validate(item)
    except ValidationError as exc:
        raise SourceShapeError(
            f"{where}: shape differs from what docs/PLAN.md expects; not adapting in place. {exc}"
        ) from exc


def fetch_menu(client: SenateGovClient, congress: int, session: int) -> dict[str, Any] | None:
    """The session menu as a dict, or None when senate.gov has no such session.

    senate.gov answers a missing file with a 302 redirect to a "file not found" page (seen
    2026-09-12 for session 3 of the 119th); a plain 404 is treated the same way.
    """
    from ingest.models.votes import SenateMenu

    path = menu_path(congress, session)
    try:
        text = client.get_text(path)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404 or exc.response.is_redirect:
            return None
        raise
    menu = parse_xml(text, "vote_summary", path)
    _validate(SenateMenu, menu, path)
    if int(menu["congress"]) != congress or int(menu["session"]) != session:
        raise SourceShapeError(f"{path}: menu is for another congress/session")
    return menu


def fetch_vote(
    client: SenateGovClient, congress: int, session: int, vote_number: int
) -> dict[str, Any]:
    from ingest.models.votes import SenateVote

    path = vote_path(congress, session, vote_number)
    vote = parse_xml(client.get_text(path), "roll_call_vote", path)
    _validate(SenateVote, vote, path)
    if int(vote["vote_number"]) != vote_number:
        raise SourceShapeError(f"{path}: vote_number {vote['vote_number']} != {vote_number}")
    return vote


def _existing_vote_numbers(conn: Connection, congress: int) -> set[tuple[int, int]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT session, vote_number FROM raw.senate_vote WHERE congress = %s", (congress,)
        )
        return {(r[0], r[1]) for r in cur.fetchall()}


def load(
    conn: Connection, client: SenateGovClient, congress: int, *, full_refresh: bool = False
) -> int:
    with record_run(conn, SOURCE, BASE_URL) as run:
        fetched_at = datetime.now(UTC)
        existing = _existing_vote_numbers(conn, congress)
        total = 0
        session = 0
        while True:
            session += 1
            menu = fetch_menu(client, congress, session)
            if menu is None:
                break
            total += upsert(
                conn,
                "raw",
                "senate_vote_menu",
                ["congress", "session"],
                [
                    {
                        "congress": congress,
                        "session": session,
                        "payload": Jsonb(menu),
                        "source_url": BASE_URL + menu_path(congress, session),
                        "fetched_at": fetched_at,
                    }
                ],
            )
            listed = [int(v["vote_number"]) for v in (menu.get("votes") or {}).get("vote", [])]
            fetched = 0
            for vote_number in sorted(listed):
                if not full_refresh and (session, vote_number) in existing:
                    continue
                vote = fetch_vote(client, congress, session, vote_number)
                total += upsert(
                    conn,
                    "raw",
                    "senate_vote",
                    KEY_COLUMNS,
                    [
                        {
                            "congress": congress,
                            "session": session,
                            "vote_number": vote_number,
                            "payload": Jsonb(vote),
                            "source_url": BASE_URL + vote_path(congress, session, vote_number),
                            "fetched_at": fetched_at,
                        }
                    ],
                )
                fetched += 1
            log.info(
                "Senate %d session %d: %d roll calls listed, %d fetched",
                congress,
                session,
                len(listed),
                fetched,
            )
        log.info("%d requests", client.requests_made)
        run.rows_loaded = total
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:
    client = SenateGovClient()
    try:
        with connect() as conn:
            return load(conn, client, get_settings().current_congress, full_refresh=full_refresh)
    finally:
        client.close()
