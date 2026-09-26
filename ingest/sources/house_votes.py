"""Source: House roll-call votes from the Congress.gov ``/house-vote`` endpoints (beta).

Per session of the current Congress (sessions are walked from 1 until the list comes back
empty) the roll-call list is paged in full and upserted into ``raw.house_vote``. For every
roll call whose ``updateDate`` is new or changed (or on ``--full-refresh``) the members
endpoint is fetched once and stored whole in ``raw.house_vote_members``; all 435 positions
are kept because party-unity statistics need every member, not just the tracked ones.

Request budget for the 119th Congress: about 6 list pages plus one request per roll call
(roughly 660 so far), well under the 5,000 per hour limit.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb

from api.config import get_settings
from ingest.congress_gov import BASE_URL, CongressGovClient, RateLimiter
from ingest.db import connect
from ingest.load import record_run, upsert
from ingest.models.votes import HouseVoteListItem, HouseVoteMembers
from ingest.shape import SourceShapeError, validate

log = logging.getLogger("ingest.house_votes")

SOURCE = "congress_gov_house_votes"
KEY_COLUMNS = ["congress", "session", "roll_number"]


def fetch_session_votes(
    client: CongressGovClient, congress: int, session: int
) -> list[dict[str, Any]]:
    path = f"house-vote/{congress}/{session}"
    items = list(client.paginate(path, "houseRollCallVotes"))
    for index, item in enumerate(items):
        validate(HouseVoteListItem, item, f"{path}[{index}]")
        if item["congress"] != congress or item["sessionNumber"] != session:
            raise SourceShapeError(f"{path}[{index}]: item belongs to another congress/session")
    return items


def fetch_members(
    client: CongressGovClient, congress: int, session: int, roll_number: int
) -> dict[str, Any]:
    path = f"house-vote/{congress}/{session}/{roll_number}/members"
    payload = client.get(path).get("houseRollCallVoteMemberVotes")
    if not isinstance(payload, dict):
        raise SourceShapeError(f"{path}: expected object under houseRollCallVoteMemberVotes")
    validate(HouseVoteMembers, payload, path)
    return payload


def _existing_update_dates(conn: Connection, congress: int) -> dict[tuple[int, int], str | None]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT session, roll_number, payload ->> 'updateDate' FROM raw.house_vote_members "
            "WHERE congress = %s",
            (congress,),
        )
        return {(r[0], r[1]): r[2] for r in cur.fetchall()}


def load(
    conn: Connection, client: CongressGovClient, congress: int, *, full_refresh: bool = False
) -> int:
    with record_run(conn, SOURCE, f"{BASE_URL}/house-vote/{congress}") as run:
        fetched_at = datetime.now(UTC)
        existing = _existing_update_dates(conn, congress)
        total = 0
        session = 0
        while True:
            session += 1
            items = fetch_session_votes(client, congress, session)
            if not items:
                break
            total += upsert(
                conn,
                "raw",
                "house_vote",
                KEY_COLUMNS,
                [
                    {
                        "congress": congress,
                        "session": session,
                        "roll_number": item["rollCallNumber"],
                        "payload": Jsonb(item),
                        "source_url": client.url(f"house-vote/{congress}/{session}"),
                        "fetched_at": fetched_at,
                    }
                    for item in items
                ],
            )
            refreshed = 0
            for item in items:
                roll_number = item["rollCallNumber"]
                stored = existing.get((session, roll_number), "<missing>")
                if not full_refresh and stored == item.get("updateDate"):
                    continue
                members = fetch_members(client, congress, session, roll_number)
                total += upsert(
                    conn,
                    "raw",
                    "house_vote_members",
                    KEY_COLUMNS,
                    [
                        {
                            "congress": congress,
                            "session": session,
                            "roll_number": roll_number,
                            "payload": Jsonb(members),
                            "source_url": client.url(
                                f"house-vote/{congress}/{session}/{roll_number}/members"
                            ),
                            "fetched_at": fetched_at,
                        }
                    ],
                )
                refreshed += 1
            log.info(
                "House %d session %d: %d roll calls, %d member lists fetched",
                congress,
                session,
                len(items),
                refreshed,
            )
        log.info("%d API requests", client.requests_made)
        run.rows_loaded = total
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:
    settings = get_settings()
    if not settings.congress_gov_api_key:
        raise RuntimeError("CONGRESS_GOV_API_KEY is not set (see .env.example)")
    client = CongressGovClient(
        settings.congress_gov_api_key,
        limiter=RateLimiter(settings.congress_gov_requests_per_hour),
    )
    try:
        with connect() as conn:
            return load(conn, client, settings.current_congress, full_refresh=full_refresh)
    finally:
        client.close()
