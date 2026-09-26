"""Source: unitedstates/congress-legislators (members, terms, committees, memberships).

Three YAML snapshots are fetched whole and upserted into ``raw`` keyed on their natural keys.
Scope (which members reach the mart) is applied downstream by the ``tracked_members`` seed;
see docs/adr/0002-bulk-snapshots-load-whole.md.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import yaml
from psycopg import Connection
from psycopg.types.json import Jsonb

from ingest.db import connect
from ingest.http import fetch_text
from ingest.load import record_run, upsert
from ingest.models.legislators import Committee, Legislator, MembershipEntry
from ingest.shape import shape_error, validate

log = logging.getLogger("ingest.legislators")

SOURCE = "legislators"
BASE_URL = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/"
LEGISLATORS_FILE = "legislators-current.yaml"
COMMITTEES_FILE = "committees-current.yaml"
MEMBERSHIP_FILE = "committee-membership-current.yaml"

Fetch = Callable[[str], str]


def _jsonb(value: Any) -> Jsonb:
    # Upstream quotes its dates today; if that changes, unquoted YAML dates become date
    # objects and are stored as ISO strings rather than failing.
    return Jsonb(value, dumps=lambda obj: json.dumps(obj, default=str))


def parse_legislators(text: str) -> list[dict[str, Any]]:
    data = yaml.safe_load(text)
    if not isinstance(data, list):
        raise shape_error(LEGISLATORS_FILE, f"expected a list, got {type(data).__name__}")
    for index, item in enumerate(data):
        validate(Legislator, item, f"{LEGISLATORS_FILE}[{index}]")
    return data


def parse_committees(text: str) -> list[dict[str, Any]]:
    data = yaml.safe_load(text)
    if not isinstance(data, list):
        raise shape_error(COMMITTEES_FILE, f"expected a list, got {type(data).__name__}")
    for index, item in enumerate(data):
        validate(Committee, item, f"{COMMITTEES_FILE}[{index}]")
    return data


def parse_memberships(text: str) -> dict[str, list[dict[str, Any]]]:
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise shape_error(MEMBERSHIP_FILE, f"expected a mapping, got {type(data).__name__}")
    for committee_id, members in data.items():
        if not isinstance(members, list):
            raise shape_error(MEMBERSHIP_FILE, f"{committee_id}: expected a list of members")
        for index, item in enumerate(members):
            validate(MembershipEntry, item, f"{MEMBERSHIP_FILE}:{committee_id}[{index}]")
    return data


def load(conn: Connection, fetch: Fetch = fetch_text) -> int:
    """Fetch the three files and upsert them into raw. Returns rows loaded."""
    with record_run(conn, SOURCE, BASE_URL) as run:
        fetched_at = datetime.now(UTC)

        url = BASE_URL + LEGISLATORS_FILE
        legislators = parse_legislators(fetch(url))
        n_legislators = upsert(
            conn,
            "raw",
            "legislator",
            ["bioguide_id"],
            [
                {
                    "bioguide_id": item["id"]["bioguide"],
                    "payload": _jsonb(item),
                    "source_url": url,
                    "fetched_at": fetched_at,
                }
                for item in legislators
            ],
        )
        log.info("raw.legislator: %d rows", n_legislators)

        url = BASE_URL + COMMITTEES_FILE
        committees = parse_committees(fetch(url))
        n_committees = upsert(
            conn,
            "raw",
            "committee",
            ["thomas_id"],
            [
                {
                    "thomas_id": item["thomas_id"],
                    "payload": _jsonb(item),
                    "source_url": url,
                    "fetched_at": fetched_at,
                }
                for item in committees
            ],
        )
        log.info("raw.committee: %d rows", n_committees)

        url = BASE_URL + MEMBERSHIP_FILE
        memberships = parse_memberships(fetch(url))
        n_memberships = upsert(
            conn,
            "raw",
            "committee_membership",
            ["committee_id"],
            [
                {
                    "committee_id": committee_id,
                    "payload": _jsonb(members),
                    "source_url": url,
                    "fetched_at": fetched_at,
                }
                for committee_id, members in memberships.items()
            ],
        )
        log.info("raw.committee_membership: %d rows", n_memberships)

        run.rows_loaded = n_legislators + n_committees + n_memberships
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:  # noqa: ARG001 - whole-file source
    with connect() as conn:
        return load(conn)
