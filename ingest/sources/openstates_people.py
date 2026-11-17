"""Source: openstates/people, every state legislator and governor (ADR 0035).

The repository (github.com/openstates/people, public domain) keeps one YAML file per person:
``data/{state}/legislature/`` for sitting legislators, ``executive/`` for governors and
lieutenant governors, ``retired/`` for people who have left. Each run asks GitHub for the newest
commit of ``main`` and, when it differs from the commit last loaded, downloads that commit as one
tarball (about 5 MB) and reads it in memory. Nothing else on GitHub is touched and no API key is
needed.

Kept: everyone in the 50 states, DC and Puerto Rico with a legislative or governor role that
was held on or after :data:`KEEP_SINCE`, which covers the archived build's date as well as the
live one. ``raw.state_person`` is replaced whole each time it loads, so a file that moves or
disappears upstream does not linger. Who held a seat on a given day is worked out in dbt from
the roles' dates (``stg_state_roles``).
"""

from __future__ import annotations

import io
import json
import logging
import re
import tarfile
from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime
from typing import Any

import yaml
from psycopg import Connection
from psycopg.types.json import Jsonb

from ingest.db import connect
from ingest.http import fetch_response
from ingest.load import record_run, upsert
from ingest.models.openstates_people import Person
from ingest.shape import shape_error, validate

log = logging.getLogger("ingest.openstates_people")

SOURCE = "openstates_people"
COMMIT_URL = "https://api.github.com/repos/openstates/people/commits/main"
TARBALL_URL = "https://codeload.github.com/openstates/people/tar.gz/{sha}"
# Roles that ended before this day are of no use to the live site or the archived one
# (ADR 0035 archives the states as of 2026-11-02).
KEEP_SINCE = date(2025, 1, 1)
# The 52 legislatures alone seat about 7,480; far fewer means a broken download or a layout
# change, and replacing the table with it would blank the section.
MIN_PEOPLE = 7000
ROLE_TYPES = frozenset({"upper", "lower", "legislature", "governor"})
STATES = frozenset(
    "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj "
    "nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc pr".split()
)
FOLDERS = ("legislature", "executive", "retired")
# people-<sha>/data/<state>/<folder>/<file>.yml
MEMBER = re.compile(r"^[^/]+/data/([a-z]{2})/(legislature|executive|retired)/[^/]+\.ya?ml$")
Loader = getattr(yaml, "CSafeLoader", yaml.SafeLoader)

Fetch = Callable[[str], bytes]
LatestCommit = Callable[[], str]


def _fetch_bytes(url: str) -> bytes:
    return fetch_response(url, timeout=120.0).content


def latest_commit(fetch: Fetch = _fetch_bytes) -> str:
    """The sha of the newest commit on ``main``, from the GitHub commits API."""
    body = json.loads(fetch(COMMIT_URL))
    sha = body.get("sha") if isinstance(body, dict) else None
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise shape_error(COMMIT_URL, f"no commit sha in the response: {str(body)[:200]}")
    return sha


def _role_kept(role: dict[str, Any]) -> bool:
    if role.get("type") not in ROLE_TYPES:
        return False
    end = role.get("end_date")
    return end is None or str(end) >= KEEP_SINCE.isoformat()


def read_people(tarball: bytes) -> Iterator[tuple[str, str, dict[str, Any]]]:
    """(state, folder, person) for every kept person file in the tarball."""
    with tarfile.open(fileobj=io.BytesIO(tarball), mode="r:gz") as archive:
        for member in archive:
            match = MEMBER.match(member.name)
            if not match or not member.isfile():
                continue
            state, folder = match.groups()
            if state not in STATES:
                continue
            handle = archive.extractfile(member)
            if handle is None:
                continue
            person = yaml.load(handle.read().decode("utf-8"), Loader=Loader)  # noqa: S506 - safe loader
            if not isinstance(person, dict) or not any(
                _role_kept(r) for r in person.get("roles") or [] if isinstance(r, dict)
            ):
                continue
            validate(Person, person, member.name.split("/", 1)[-1])
            yield state, folder, person


def _jsonb(value: Any) -> Jsonb:
    # Unquoted YAML dates (birth_date) arrive as date objects; store them as ISO strings.
    return Jsonb(value, dumps=lambda obj: json.dumps(obj, default=str))


def last_loaded_commit(conn: Connection) -> str | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT source_url FROM meta.ingest_run WHERE source = %s AND status = 'success' "
            "ORDER BY id DESC LIMIT 1",
            (SOURCE,),
        )
        row = cur.fetchone()
    if not row or not row[0]:
        return None
    match = re.search(r"/tar\.gz/([0-9a-f]{40})$", row[0])
    return match.group(1) if match else None


def load(
    conn: Connection,
    *,
    fetch: Fetch = _fetch_bytes,
    commit: LatestCommit | None = None,
    full_refresh: bool = False,
    minimum: int = MIN_PEOPLE,
) -> int:
    """Load the newest commit's people into ``raw.state_person``. Returns rows loaded (0 when
    the commit was already loaded)."""
    sha = (commit or (lambda: latest_commit(fetch)))()
    url = TARBALL_URL.format(sha=sha)
    if not full_refresh and last_loaded_commit(conn) == sha:
        log.info("openstates/people is still at %s; nothing to load", sha[:7])
        with record_run(conn, SOURCE, url) as run:
            run.rows_loaded = 0
        return 0

    with record_run(conn, SOURCE, url) as run:
        fetched_at = datetime.now(UTC)
        rows = {}
        for state, folder, person in read_people(fetch(url)):
            if person["id"] in rows:
                raise shape_error(url, f"{person['id']} appears twice")
            rows[person["id"]] = {
                "person_id": person["id"],
                "state": state.upper(),
                "folder": folder,
                "payload": _jsonb(person),
                "source_url": url,
                "fetched_at": fetched_at,
            }
        if len(rows) < minimum:
            raise shape_error(url, f"only {len(rows)} people kept; expected at least {minimum}")
        with conn.cursor() as cur:
            cur.execute("DELETE FROM raw.state_person")
        run.rows_loaded = upsert(conn, "raw", "state_person", ["person_id"], list(rows.values()))
        log.info("raw.state_person: %d people from %s", run.rows_loaded, sha[:7])
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:
    with connect() as conn:
        return load(conn, full_refresh=full_refresh)
