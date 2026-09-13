"""Source: OpenFEC, the principal campaign committee of each tracked member, current cycle.

Per tracked member (``seed.tracked_members`` joined to ``raw.legislator`` for the FEC
candidate ids and the chamber of the latest term):

1. Every candidate id in congress-legislators ``id.fec`` is fetched from ``/candidate/{id}/``
   and stored in ``raw.fec_candidate``. The member's **current-office candidate** is the one
   whose ``office`` letter matches the chamber (``H`` for the House, ``S`` for the Senate; the
   letter is also the first character of the id). Two matches is a shape the plan does not
   anticipate and stops the run; none means the member has no FEC record for this office.
2. ``/candidate/{id}/committees/?cycle=`` lists the committees linked to that candidate in the
   cycle; all of them are stored in ``raw.fec_committee``. The **principal campaign committee**
   is the one with ``designation = 'P'``. Leadership PACs (``D``), joint fundraising
   committees (``J``) and committees of prior offices are stored but never summed (ADR 0006).
3. ``/committee/{id}/totals/?cycle=`` gives the committee's two-year totals, stored in
   ``raw.fec_committee_totals``; an empty result means no report covers the cycle yet.

Every record is re-fetched each run (four requests per member plus one per extra candidate
id, about 35 a night for six members): the identity records are what decide which committee
counts, and totals change whenever a report or amendment is processed, so nothing is worth
skipping. ``--full-refresh`` therefore changes nothing for this source.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any, NamedTuple

from psycopg import Connection
from psycopg.types.json import Jsonb
from pydantic import ValidationError

from api.config import get_settings
from ingest.congress_gov import RateLimiter
from ingest.db import connect
from ingest.fec import BASE_URL, FecClient
from ingest.load import record_run, upsert
from ingest.models.fec import Candidate, CandidateCommittee, CommitteeTotals
from ingest.sources.congress_gov import tracked_member_ids

log = logging.getLogger("ingest.fec")

SOURCE = "fec"
OFFICE_FOR_CHAMBER = {"house": "H", "senate": "S"}
PRINCIPAL = "P"


class SourceShapeError(RuntimeError):
    """The API response does not have the shape docs/PLAN.md expects. Stop and report."""


class TrackedCandidate(NamedTuple):
    bioguide_id: str
    chamber: str  # house / senate
    fec_ids: list[str]


def _validate(model: type, item: Any, where: str) -> None:
    try:
        model.model_validate(item)
    except ValidationError as exc:
        raise SourceShapeError(
            f"{where}: shape differs from what docs/PLAN.md expects; not adapting in place. {exc}"
        ) from exc


def fetch_candidate(client: FecClient, candidate_id: str) -> dict[str, Any] | None:
    """The candidate record, or None when the API knows no such id."""
    path = f"candidate/{candidate_id}"
    results = client.get(path)["results"]
    if not results:
        return None
    if len(results) != 1:
        raise SourceShapeError(f"{path}: expected one result, got {len(results)}")
    _validate(Candidate, results[0], path)
    if results[0]["candidate_id"] != candidate_id:
        raise SourceShapeError(f"{path}: result is for {results[0]['candidate_id']}")
    return results[0]


def fetch_candidate_committees(
    client: FecClient, candidate_id: str, cycle: int
) -> list[dict[str, Any]]:
    path = f"candidate/{candidate_id}/committees"
    items = client.results(path, cycle=cycle)
    for index, item in enumerate(items):
        _validate(CandidateCommittee, item, f"{path}[{index}]")
    return items


def fetch_committee_totals(
    client: FecClient, committee_id: str, cycle: int
) -> dict[str, Any] | None:
    """The committee's totals for ``cycle``, or None when no report covers the cycle."""
    path = f"committee/{committee_id}/totals"
    items = client.results(path, cycle=cycle)
    if not items:
        return None
    if len(items) != 1:
        raise SourceShapeError(f"{path}?cycle={cycle}: expected one result, got {len(items)}")
    _validate(CommitteeTotals, items[0], path)
    if items[0]["cycle"] != cycle or items[0]["committee_id"] != committee_id:
        raise SourceShapeError(f"{path}: result is for another committee or cycle")
    return items[0]


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


def load(
    conn: Connection,
    client: FecClient,
    bioguide_ids: Sequence[str],
    cycle: int,
    *,
    full_refresh: bool = False,  # noqa: ARG001 - every record is re-fetched each run
) -> int:
    """Load candidates, committees, and totals for ``bioguide_ids``. Returns rows loaded."""
    with record_run(conn, SOURCE, BASE_URL) as run:
        fetched_at = datetime.now(UTC)
        total = 0
        members = tracked_candidates(conn, bioguide_ids)
        filed = 0
        for member in members:
            candidates = []
            for candidate_id in member.fec_ids:
                record = fetch_candidate(client, candidate_id)
                if record is None:
                    log.warning("%s: FEC knows no candidate %s", member.bioguide_id, candidate_id)
                    continue
                candidates.append(record)
                total += upsert(
                    conn,
                    "raw",
                    "fec_candidate",
                    ["candidate_id"],
                    [
                        {
                            "candidate_id": candidate_id,
                            "bioguide_id": member.bioguide_id,
                            "payload": Jsonb(record),
                            "source_url": client.url(f"candidate/{candidate_id}"),
                            "fetched_at": fetched_at,
                        }
                    ],
                )
            candidate = select_candidate(member.chamber, candidates)
            if candidate is None:
                log.warning(
                    "%s: no FEC candidate id for the %s among %s",
                    member.bioguide_id,
                    member.chamber,
                    member.fec_ids or "no ids",
                )
                continue
            candidate_id = candidate["candidate_id"]

            committees = fetch_candidate_committees(client, candidate_id, cycle)
            total += upsert(
                conn,
                "raw",
                "fec_committee",
                ["committee_id", "cycle"],
                [
                    {
                        "committee_id": item["committee_id"],
                        "cycle": cycle,
                        "candidate_id": candidate_id,
                        "payload": Jsonb(item),
                        "source_url": client.url(
                            f"candidate/{candidate_id}/committees", cycle=cycle
                        ),
                        "fetched_at": fetched_at,
                    }
                    for item in committees
                ],
            )
            principal = select_principal_committee(committees)
            if principal is None:
                log.warning(
                    "%s: %s has no principal campaign committee in cycle %d (%d committees)",
                    member.bioguide_id,
                    candidate_id,
                    cycle,
                    len(committees),
                )
                continue
            committee_id = principal["committee_id"]

            totals = fetch_committee_totals(client, committee_id, cycle)
            if totals is None:
                log.warning(
                    "%s: %s has no totals for cycle %d yet", member.bioguide_id, committee_id, cycle
                )
                continue
            total += upsert(
                conn,
                "raw",
                "fec_committee_totals",
                ["committee_id", "cycle"],
                [
                    {
                        "committee_id": committee_id,
                        "cycle": cycle,
                        "payload": Jsonb(totals),
                        "source_url": client.url(f"committee/{committee_id}/totals", cycle=cycle),
                        "fetched_at": fetched_at,
                    }
                ],
            )
            filed += 1
            log.info(
                "%s: %s -> %s (%s), receipts %.2f through %s",
                member.bioguide_id,
                candidate_id,
                committee_id,
                principal["name"],
                totals.get("receipts") or 0.0,
                totals.get("coverage_end_date"),
            )

        log.info(
            "%d tracked members, %d with cycle %d totals, %d API requests",
            len(members),
            filed,
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
