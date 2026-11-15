"""Source: OpenFEC, the principal campaign committee of each tracked member, current cycle.

Per tracked member (``seed.tracked_members`` joined to ``raw.legislator`` for the FEC
candidate ids and the chamber of the latest term):

1. Every candidate id in congress-legislators ``id.fec`` is read from ``/candidates/`` and
   stored in ``raw.fec_candidate``. The member's **current-office candidate** is the one
   whose ``office`` letter matches the chamber (``H`` for the House, ``S`` for the Senate; the
   letter is also the first character of the id). Two matches is a shape the plan does not
   anticipate and stops the run; none means the member has no FEC record for this office.
2. ``/committees/?candidate_id=&cycle=`` lists the committees linked to those candidates in
   the cycle; each is stored in ``raw.fec_committee`` once per tracked candidate it names.
   The **principal campaign committee** is the one with ``designation = 'P'``. Leadership PACs
   (``D``), joint fundraising committees (``J``) and committees of prior offices are stored
   but never summed (ADR 0006).
3. ``/totals/house-senate/?committee_id=&cycle=`` gives the principal committees' two-year
   totals, stored in ``raw.fec_committee_totals``; a committee missing from the answer has no
   report covering the cycle yet.

All three are asked for many ids at a time (ADR 0023): about three requests a run for twenty
members and about twenty for 535, where one request per record was 68 and about 1,820. The
batched answers were compared with the per-record endpoints for all twenty tracked members on
2026-11-15 and every field the pipeline declares was equal. ``source_url`` stays the
per-record address, which returns exactly the stored record.

Totals are read every run: they change whenever a report or amendment is processed. The
identity records of steps 1 and 2 decide which committee counts and change rarely, so they are
read again only when the stored ones are a week old, when a tracked member has none, or with
``--full-refresh``; in between, the stored records choose the committees.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple

from psycopg import Connection
from psycopg.types.json import Jsonb

from api.config import get_settings
from ingest.congress_gov import RateLimiter
from ingest.db import connect
from ingest.fec import BASE_URL, FecClient
from ingest.load import record_run, upsert
from ingest.models.fec import Candidate, CandidateCommittee, CommitteeTotals
from ingest.shape import SourceShapeError, validate
from ingest.sources.congress_gov import tracked_member_ids

log = logging.getLogger("ingest.fec")

SOURCE = "fec"
OFFICE_FOR_CHAMBER = {"house": "H", "senate": "S"}
PRINCIPAL = "P"
# Ids to a request. A page holds 100 results: one per candidate or committee asked for, so 100
# of those fit a page. A candidate can have several committees, so fewer candidates go into a
# committees request; the client follows the pages when there are more than 100 all the same.
CANDIDATES_PER_REQUEST = 100
COMMITTEES_PER_REQUEST = 100
COMMITTEE_CANDIDATES_PER_REQUEST = 50
# Stored candidate and committee records older than this are read again (see the module text).
# Half a day short of a week, so a weekly refresh is not pushed to the next day by a run that
# starts a little earlier than the one a week before.
IDENTITY_MAX_AGE = timedelta(days=6, hours=12)


class TrackedCandidate(NamedTuple):
    bioguide_id: str
    chamber: str  # house / senate
    fec_ids: list[str]


def _batches(ids: Sequence[str], size: int) -> Iterator[list[str]]:
    for start in range(0, len(ids), size):
        yield list(ids[start : start + size])


def fetch_candidates(client: FecClient, candidate_ids: Sequence[str]) -> dict[str, dict[str, Any]]:
    """The candidate records by id. An id the API does not know is absent from the result."""
    path = "candidates"
    found: dict[str, dict[str, Any]] = {}
    for batch in _batches(sorted(set(candidate_ids)), CANDIDATES_PER_REQUEST):
        for index, item in enumerate(client.results(path, candidate_id=batch)):
            validate(Candidate, item, f"{path}[{index}]")
            candidate_id = item["candidate_id"]
            if candidate_id not in batch or candidate_id in found:
                raise SourceShapeError(f"{path}: {candidate_id} was not asked for, or came twice")
            found[candidate_id] = item
    return found


def fetch_committees(
    client: FecClient, candidate_ids: Sequence[str], cycle: int
) -> list[dict[str, Any]]:
    """Every committee linked in ``cycle`` to any of ``candidate_ids``, each once."""
    path = "committees"
    found: dict[str, dict[str, Any]] = {}
    for batch in _batches(sorted(set(candidate_ids)), COMMITTEE_CANDIDATES_PER_REQUEST):
        for index, item in enumerate(client.results(path, candidate_id=batch, cycle=cycle)):
            validate(CandidateCommittee, item, f"{path}[{index}]")
            if not set(item["candidate_ids"]) & set(batch):
                raise SourceShapeError(
                    f"{path}: {item['committee_id']} names none of the candidates asked for"
                )
            found[item["committee_id"]] = item
    return list(found.values())


def fetch_totals(
    client: FecClient, committee_ids: Sequence[str], cycle: int
) -> dict[str, dict[str, Any]]:
    """Totals for ``cycle`` by committee id. A committee with no report yet is absent."""
    path = "totals/house-senate"
    found: dict[str, dict[str, Any]] = {}
    for batch in _batches(sorted(set(committee_ids)), COMMITTEES_PER_REQUEST):
        for index, item in enumerate(client.results(path, committee_id=batch, cycle=cycle)):
            validate(CommitteeTotals, item, f"{path}[{index}]")
            committee_id = item["committee_id"]
            if item["cycle"] != cycle or committee_id not in batch:
                raise SourceShapeError(f"{path}: result is for another committee or cycle")
            if committee_id in found:
                raise SourceShapeError(f"{path}: two totals records for {committee_id}")
            found[committee_id] = item
    return found


def select_candidate(chamber: str, candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The candidate record for the member's current office (by ``office`` letter)."""
    office = OFFICE_FOR_CHAMBER[chamber]
    matching = [c for c in candidates if c["office"] == office]
    if len(matching) > 1:
        ids = ", ".join(c["candidate_id"] for c in matching)
        raise SourceShapeError(
            f"{len(matching)} FEC candidate ids with office {office} ({ids}); "
            "the plan expects one per current office. Not choosing; report and decide."
        )
    return matching[0] if matching else None


def select_principal_committee(committees: list[dict[str, Any]]) -> dict[str, Any] | None:
    principal = [c for c in committees if c["designation"] == PRINCIPAL]
    if len(principal) > 1:
        ids = ", ".join(c["committee_id"] for c in principal)
        raise SourceShapeError(
            f"{len(principal)} principal campaign committees in the cycle ({ids}); "
            "the plan expects one. Not choosing; report and decide."
        )
    return principal[0] if principal else None


def tracked_candidates(conn: Connection, bioguide_ids: Sequence[str]) -> list[TrackedCandidate]:
    """The members' FEC ids and the chamber of their latest term, from raw.legislator."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT l.bioguide_id,
                   CASE l.payload -> 'terms' -> -1 ->> 'type'
                       WHEN 'rep' THEN 'house' ELSE 'senate' END,
                   COALESCE(l.payload -> 'id' -> 'fec', '[]'::jsonb)
            FROM raw.legislator AS l
            WHERE l.bioguide_id = ANY(%s)
            ORDER BY l.bioguide_id
            """,
            (list(bioguide_ids),),
        )
        found = [TrackedCandidate(r[0], r[1], list(r[2])) for r in cur.fetchall()]
    missing = sorted(set(bioguide_ids) - {m.bioguide_id for m in found})
    if missing:
        raise RuntimeError(
            f"tracked members not in raw.legislator: {missing}; run the legislators source first"
        )
    return found


def identity_is_fresh(conn: Connection, members: Sequence[TrackedCandidate], now: datetime) -> bool:
    """True when every member with FEC ids has a stored candidate and none is a week old."""
    with_ids = [m.bioguide_id for m in members if m.fec_ids]
    if not with_ids:
        return True
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(DISTINCT bioguide_id), min(fetched_at) FROM raw.fec_candidate "
            "WHERE bioguide_id = ANY(%s)",
            (with_ids,),
        )
        row = cur.fetchone()
    assert row is not None
    members_stored, oldest = row
    return members_stored == len(with_ids) and now - oldest < IDENTITY_MAX_AGE


def stored_identity(
    conn: Connection, members: Sequence[TrackedCandidate], cycle: int
) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    """Candidates by id, and committees by candidate id, as the last identity read left them."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT candidate_id, payload FROM raw.fec_candidate WHERE bioguide_id = ANY(%s)",
            ([m.bioguide_id for m in members],),
        )
        candidates = {row[0]: row[1] for row in cur.fetchall()}
        cur.execute(
            "SELECT candidate_id, payload FROM raw.fec_committee "
            "WHERE cycle = %s AND candidate_id = ANY(%s)",
            (cycle, list(candidates)),
        )
        committees: dict[str, list[dict[str, Any]]] = {}
        for candidate_id, payload in cur.fetchall():
            committees.setdefault(candidate_id, []).append(payload)
    return candidates, committees


def refresh_identity(
    conn: Connection,
    client: FecClient,
    members: Sequence[TrackedCandidate],
    cycle: int,
    fetched_at: datetime,
) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]], int]:
    """Read and store candidates and committees. Returns them and the rows stored."""
    candidates = fetch_candidates(client, [i for m in members for i in m.fec_ids])
    owner = {i: m.bioguide_id for m in members for i in m.fec_ids}
    for candidate_id in sorted(set(owner) - set(candidates)):
        log.warning("%s: FEC knows no candidate %s", owner[candidate_id], candidate_id)
    rows = upsert(
        conn,
        "raw",
        "fec_candidate",
        ["candidate_id"],
        [
            {
                "candidate_id": candidate_id,
                "bioguide_id": owner[candidate_id],
                "payload": Jsonb(record),
                "source_url": client.url(f"candidate/{candidate_id}"),
                "fetched_at": fetched_at,
            }
            for candidate_id, record in candidates.items()
        ],
    )
    current = current_office_candidates(members, candidates)
    wanted = set(current.values())
    committees: dict[str, list[dict[str, Any]]] = {}
    for item in fetch_committees(client, sorted(wanted), cycle):
        # A joint fundraising committee can name two tracked members: one row for each.
        for candidate_id in sorted(wanted & set(item["candidate_ids"])):
            committees.setdefault(candidate_id, []).append(item)
    # The stored links choose the committee between identity reads and the mart lists them
    # all, so a link the FEC no longer reports must not outlive this read.
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM raw.fec_committee WHERE cycle = %s AND fetched_at < %s",
            (cycle, fetched_at),
        )
    rows += upsert(
        conn,
        "raw",
        "fec_committee",
        ["committee_id", "cycle", "candidate_id"],
        [
            {
                "committee_id": item["committee_id"],
                "cycle": cycle,
                "candidate_id": candidate_id,
                "payload": Jsonb(item),
                "source_url": client.url(f"candidate/{candidate_id}/committees", cycle=cycle),
                "fetched_at": fetched_at,
            }
            for candidate_id, items in committees.items()
            for item in items
        ],
    )
    return candidates, committees, rows


def current_office_candidates(
    members: Sequence[TrackedCandidate], candidates: dict[str, dict[str, Any]]
) -> dict[str, str]:
    """bioguide id -> the candidate id for the member's current office, where there is one."""
    current = {}
    for member in members:
        known = [candidates[i] for i in member.fec_ids if i in candidates]
        candidate = select_candidate(member.chamber, known)
        if candidate is None:
            log.warning(
                "%s: no FEC candidate id for the %s among %s",
                member.bioguide_id,
                member.chamber,
                member.fec_ids or "no ids",
            )
            continue
        current[member.bioguide_id] = candidate["candidate_id"]
    return current


def load(
    conn: Connection,
    client: FecClient,
    bioguide_ids: Sequence[str],
    cycle: int,
    *,
    full_refresh: bool = False,
    now: datetime | None = None,
) -> int:
    """Load candidates, committees, and totals for ``bioguide_ids``. Returns rows loaded."""
    with record_run(conn, SOURCE, BASE_URL) as run:
        fetched_at = now or datetime.now(UTC)
        total = 0
        members = tracked_candidates(conn, bioguide_ids)
        if full_refresh or not identity_is_fresh(conn, members, fetched_at):
            candidates, committees, total = refresh_identity(
                conn, client, members, cycle, fetched_at
            )
            current = current_office_candidates(members, candidates)
        else:
            log.info("candidates and committees are under a week old: reading totals only")
            candidates, committees = stored_identity(conn, members, cycle)
            current = current_office_candidates(members, candidates)

        principal: dict[str, dict[str, Any]] = {}
        for bioguide_id, candidate_id in current.items():
            linked = committees.get(candidate_id, [])
            committee = select_principal_committee(linked)
            if committee is None:
                log.warning(
                    "%s: %s has no principal campaign committee in cycle %d (%d committees)",
                    bioguide_id,
                    candidate_id,
                    cycle,
                    len(linked),
                )
                continue
            principal[bioguide_id] = committee

        totals = fetch_totals(client, [c["committee_id"] for c in principal.values()], cycle)
        total += upsert(
            conn,
            "raw",
            "fec_committee_totals",
            ["committee_id", "cycle"],
            [
                {
                    "committee_id": committee_id,
                    "cycle": cycle,
                    "payload": Jsonb(record),
                    "source_url": client.url(f"committee/{committee_id}/totals", cycle=cycle),
                    "fetched_at": fetched_at,
                }
                for committee_id, record in totals.items()
            ],
        )
        for bioguide_id, committee in principal.items():
            committee_id = committee["committee_id"]
            record = totals.get(committee_id)
            if record is None:
                log.warning(
                    "%s: %s has no totals for cycle %d yet", bioguide_id, committee_id, cycle
                )
                continue
            log.info(
                "%s: %s -> %s (%s), receipts %.2f through %s",
                bioguide_id,
                current[bioguide_id],
                committee_id,
                committee["name"],
                record.get("receipts") or 0.0,
                record.get("coverage_end_date"),
            )

        log.info(
            "%d tracked members, %d with cycle %d totals, %d API requests",
            len(members),
            sum(1 for c in principal.values() if c["committee_id"] in totals),
            cycle,
            client.requests_made,
        )
        run.rows_loaded = total
    return run.rows_loaded


def run(*, full_refresh: bool = False) -> int:
    settings = get_settings()
    if not settings.fec_api_key:
        raise RuntimeError("FEC_API_KEY is not set (see .env.example)")
    client = FecClient(
        settings.fec_api_key,
        hourly=RateLimiter(settings.fec_requests_per_hour),
        per_minute=RateLimiter(settings.fec_requests_per_minute, 60.0),
    )
    try:
        with connect() as conn:
            return load(
                conn,
                client,
                tracked_member_ids(conn),
                settings.fec_cycle,
                full_refresh=full_refresh,
            )
    finally:
        client.close()
