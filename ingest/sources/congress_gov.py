"""Source: Congress.gov API, bills and amendments sponsored or cosponsored by tracked members.

Per tracked member and role the list endpoint is paged in full and filtered to the current
Congress (the lists mix every Congress the member served in). For each distinct bill or
amendment the detail record is fetched every run; the actions and cosponsors lists are only
re-fetched when the detail ``updateDate`` changed, they were never fetched, or
``--full-refresh`` is given.

Bills referenced by a roll call in ``raw.house_vote`` or ``raw.senate_vote`` are fetched as
well (detail record only, no actions or cosponsors) so vote headlines can carry the title.
Run the vote sources before this one so the same night picks up new roll calls.

Request budget for two members in the 119th Congress: about 15 list pages, ~470 detail
requests for member legislation plus ~470 for roll-call bills, and up to ~940
actions/cosponsors requests on a full refresh, well under the 5,000 per hour limit enforced
by :class:`ingest.congress_gov.RateLimiter`.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb
from pydantic import ValidationError

from api.config import get_settings
from ingest.congress_gov import (
    BASE_URL,
    CongressGovClient,
    LegislationKey,
    RateLimiter,
    parse_legislation_url,
)
from ingest.db import connect
from ingest.load import record_run, upsert
from ingest.models.congress_gov import (
    Action,
    AmendmentDetail,
    BillDetail,
    Cosponsor,
    MemberLegislationItem,
)

log = logging.getLogger("ingest.congress_gov")

SOURCE = "congress_gov_bills"
ROLE_PATHS = {"sponsor": "sponsored-legislation", "cosponsor": "cosponsored-legislation"}
ROLE_ITEMS_KEY = {"sponsor": "sponsoredLegislation", "cosponsor": "cosponsoredLegislation"}
KEY_COLUMNS = ["congress", "bill_type", "bill_number"]
# senate.gov document types -> Congress.gov bill types (nominations and treaties have none)
SENATE_DOCUMENT_TYPES = {
    "S.": "s",
    "H.R.": "hr",
    "S.Res.": "sres",
    "H.Res.": "hres",
    "S.J.Res.": "sjres",
    "H.J.Res.": "hjres",
    "S.Con.Res.": "sconres",
    "H.Con.Res.": "hconres",
}


class SourceShapeError(RuntimeError):
    """The API response does not have the shape docs/PLAN.md expects. Stop and report."""


def _validate(model: type, item: Any, where: str) -> None:
    try:
        model.model_validate(item)
    except ValidationError as exc:
        raise SourceShapeError(
            f"{where}: shape differs from what docs/PLAN.md expects; not adapting in place. {exc}"
        ) from exc


def _key_row(key: LegislationKey) -> dict[str, Any]:
    return {"congress": key.congress, "bill_type": key.bill_type, "bill_number": key.bill_number}


def fetch_member_legislation(
    client: CongressGovClient, bioguide_id: str, role: str, congress: int
) -> list[tuple[LegislationKey, dict[str, Any]]]:
    """All list items for one member and role, filtered to ``congress``."""
    path = f"member/{bioguide_id}/{ROLE_PATHS[role]}"
    kept: list[tuple[LegislationKey, dict[str, Any]]] = []
    for index, item in enumerate(client.paginate(path, ROLE_ITEMS_KEY[role])):
        _validate(MemberLegislationItem, item, f"{path}[{index}]")
        if item["congress"] != congress:
            continue
        kept.append((parse_legislation_url(item["url"]), item))
    return kept


def fetch_detail(client: CongressGovClient, key: LegislationKey) -> dict[str, Any]:
    data = client.get(key.path)
    payload = data.get(key.kind)
    if not isinstance(payload, dict):
        raise SourceShapeError(f"{key.path}: expected object under {key.kind!r}")
    _validate(BillDetail if key.kind == "bill" else AmendmentDetail, payload, key.path)
    return payload


def fetch_actions(client: CongressGovClient, key: LegislationKey) -> list[dict[str, Any]]:
    items = list(client.paginate(f"{key.path}/actions", "actions"))
    for index, item in enumerate(items):
        _validate(Action, item, f"{key.path}/actions[{index}]")
    return items


def fetch_cosponsors(client: CongressGovClient, key: LegislationKey) -> list[dict[str, Any]]:
    items = list(client.paginate(f"{key.path}/cosponsors", "cosponsors"))
    for index, item in enumerate(items):
        _validate(Cosponsor, item, f"{key.path}/cosponsors[{index}]")
    return items


def roll_call_legislation_keys(conn: Connection, congress: int) -> set[LegislationKey]:
    """Bills referenced by House and Senate roll calls already loaded into raw."""
    keys: set[LegislationKey] = set()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT lower(payload ->> 'legislationType'), payload ->> 'legislationNumber' "
            "FROM raw.house_vote WHERE congress = %s "
            "AND payload ->> 'legislationType' IS NOT NULL "
            "AND payload ->> 'legislationNumber' IS NOT NULL",
            (congress,),
        )
        for bill_type, number in cur.fetchall():
            keys.add(LegislationKey("bill", congress, bill_type, number))
        cur.execute(
            "SELECT DISTINCT payload -> 'document' ->> 'document_type', "
            "payload -> 'document' ->> 'document_number' "
            "FROM raw.senate_vote WHERE congress = %s "
            "AND jsonb_typeof(payload -> 'document') = 'object'",
            (congress,),
        )
        for document_type, number in cur.fetchall():
            bill_type = SENATE_DOCUMENT_TYPES.get(document_type or "")
            if bill_type and number:
                keys.add(LegislationKey("bill", congress, bill_type, number))
    return keys


def _existing_state(conn: Connection) -> dict[tuple[int, str, str], tuple[str | None, bool]]:
    """(congress, type, number) -> (stored updateDate, actions and cosponsors both present)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT b.congress, b.bill_type, b.bill_number, b.payload ->> 'updateDate',
                   (a.congress IS NOT NULL AND c.congress IS NOT NULL)
            FROM raw.bill AS b
            LEFT JOIN raw.bill_actions AS a USING (congress, bill_type, bill_number)
            LEFT JOIN raw.bill_cosponsors AS c USING (congress, bill_type, bill_number)
            """
        )
        return {(r[0], r[1], r[2]): (r[3], r[4]) for r in cur.fetchall()}


def load(
    conn: Connection,
    client: CongressGovClient,
    bioguide_ids: Sequence[str],
    congress: int,
    *,
    full_refresh: bool = False,
    roll_call_bills: bool = True,
) -> int:
    """Load lists, details, actions, and cosponsors for ``bioguide_ids``. Returns rows loaded.

    With ``roll_call_bills`` the detail record of every bill referenced by a loaded roll call
    is fetched too (no actions or cosponsors for those).
    """
    with record_run(conn, SOURCE, BASE_URL) as run:
        fetched_at = datetime.now(UTC)
        total = 0
        # key -> whether actions and cosponsors are wanted (member legislation) or not
        legislation: dict[LegislationKey, bool] = {}

        for bioguide_id in bioguide_ids:
            for role in ROLE_PATHS:
                items = fetch_member_legislation(client, bioguide_id, role, congress)
                rows = [
                    {
                        "bioguide_id": bioguide_id,
                        "role": role,
                        **_key_row(key),
                        "payload": Jsonb(item),
                        "source_url": client.url(f"member/{bioguide_id}/{ROLE_PATHS[role]}"),
                        "fetched_at": fetched_at,
                    }
                    for key, item in items
                ]
                total += upsert(
                    conn, "raw", "member_legislation", ["bioguide_id", "role", *KEY_COLUMNS], rows
                )
                log.info("%s %s: %d items in Congress %d", bioguide_id, role, len(rows), congress)
                for key, _ in items:
                    legislation[key] = True

        member_keys = len(legislation)
        if roll_call_bills:
            for key in roll_call_legislation_keys(conn, congress):
                legislation.setdefault(key, False)
        roll_call_only = len(legislation) - member_keys

        existing = _existing_state(conn)
        refreshed = 0
        for key, wants_actions in legislation.items():
            detail = fetch_detail(client, key)
            total += upsert(
                conn,
                "raw",
                "bill",
                KEY_COLUMNS,
                [
                    {
                        **_key_row(key),
                        "kind": key.kind,
                        "payload": Jsonb(detail),
                        "source_url": client.url(key.path),
                        "fetched_at": fetched_at,
                    }
                ],
            )
            stored_update, complete = existing.get(
                (key.congress, key.bill_type, key.bill_number), (None, False)
            )
            if not wants_actions:
                continue
            if not full_refresh and complete and stored_update == detail.get("updateDate"):
                continue
            refreshed += 1
            for table, fetcher in (
                ("bill_actions", fetch_actions),
                ("bill_cosponsors", fetch_cosponsors),
            ):
                total += upsert(
                    conn,
                    "raw",
                    table,
                    KEY_COLUMNS,
                    [
                        {
                            **_key_row(key),
                            "payload": Jsonb(fetcher(client, key)),
                            "source_url": client.url(f"{key.path}/{table.split('_')[1]}"),
                            "fetched_at": fetched_at,
                        }
                    ],
                )

        log.info(
            "%d distinct bills/amendments (%d from member lists, %d only from roll calls), "
            "%d refreshed actions+cosponsors, %d API requests",
            len(legislation),
            member_keys,
            roll_call_only,
            refreshed,
            client.requests_made,
        )
        run.rows_loaded = total
    return run.rows_loaded


def tracked_member_ids(conn: Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT bioguide_id FROM seed.tracked_members ORDER BY bioguide_id")
        return [row[0] for row in cur.fetchall()]


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
            return load(
                conn,
                client,
                tracked_member_ids(conn),
                settings.current_congress,
                full_refresh=full_refresh,
            )
    finally:
        client.close()
