"""/api/v1/meta: operational metadata such as data freshness."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.db import get_session
from api.schemas.members import SourceRef
from api.schemas.meta import (
    CommitteeIndustriesResponse,
    CommitteeIndustry,
    CommitteeIndustryScope,
    CongressSession,
    FreshnessResponse,
    SessionsResponse,
    SourceFreshness,
)
from ingest.http import UNAVAILABLE_ERROR_PREFIX

router = APIRouter(prefix="/meta", tags=["meta"])

# Latest successful run per source. Only successes count as "fresh". `unavailable` is true
# when the newest finished run of the source was refused by its upstream (ADR 0020): the rows
# are then older than the other sources' through no fault of the pipeline, and the site says so.
FRESHNESS_SQL = text(
    """
    SELECT DISTINCT ON (s.source) s.source, s.source_url, s.finished_at, s.rows_loaded,
           coalesce(
               (
                   SELECT l.status = 'failed' AND l.error LIKE :unavailable_prefix
                   FROM meta.ingest_run AS l
                   WHERE l.source = s.source AND l.finished_at IS NOT NULL
                   ORDER BY l.finished_at DESC
                   LIMIT 1
               ),
               false
           ) AS unavailable
    FROM meta.ingest_run AS s
    WHERE s.status = 'success' AND s.finished_at IS NOT NULL
    ORDER BY s.source, s.finished_at DESC
    """
).bindparams(unavailable_prefix=UNAVAILABLE_ERROR_PREFIX + "%")


@router.get(
    "/freshness",
    response_model=FreshnessResponse,
    summary="Last successful ingest per source",
)
def freshness(session: Annotated[Session, Depends(get_session)]) -> FreshnessResponse:
    rows = session.execute(FRESHNESS_SQL).mappings().all()
    return FreshnessResponse(
        generated_at=datetime.now(UTC),
        sources=[
            SourceFreshness(
                source=row["source"],
                source_url=row["source_url"],
                fetched_at=row["finished_at"],
                rows_loaded=row["rows_loaded"],
                unavailable=row["unavailable"],
            )
            for row in rows
        ],
    )


SESSIONS_SQL = text(
    """
    SELECT congress, session, session_year, start_date, end_date, first_roll_call_date,
           last_roll_call_date, roll_calls, is_current, source, source_url, fetched_at
    FROM mart.congress_session
    ORDER BY congress, session
    """
)


@router.get(
    "/sessions",
    response_model=SessionsResponse,
    summary="Sessions of the tracked Congress and the dates that bound them",
)
def sessions(session: Annotated[Session, Depends(get_session)]) -> SessionsResponse:
    rows = session.execute(SESSIONS_SQL).mappings().all()
    return SessionsResponse(
        sessions=[
            CongressSession(
                congress=row["congress"],
                session=row["session"],
                year=row["session_year"],
                start_date=row["start_date"],
                end_date=row["end_date"],
                first_roll_call_date=row["first_roll_call_date"],
                last_roll_call_date=row["last_roll_call_date"],
                roll_calls=row["roll_calls"],
                is_current=row["is_current"],
            )
            for row in rows
        ],
        sources=[
            SourceRef(
                source=row["source"], source_url=row["source_url"], fetched_at=row["fetched_at"]
            )
            for row in rows[:1]
        ],
    )


# ADR 0032: the mapping is published whole, mapped committees and unmapped ones alike, so a
# reader can see exactly what the overlap notes rest on. Only committees in the tracked Congress
# (mart.committee) are listed.
COMMITTEE_SCOPE_SQL = text(
    """
    SELECT c.thomas_id, c.name, c.chamber, s.mapped, s.reason
    FROM seed.committee_industry_scope AS s
    JOIN mart.committee AS c ON c.thomas_id = s.committee_thomas_id
    ORDER BY s.mapped DESC, c.name
    """
)
COMMITTEE_INDUSTRIES_SQL = text(
    """
    SELECT committee_thomas_id, sic_from, sic_to, industry, basis
    FROM seed.committee_industries
    ORDER BY committee_thomas_id, sic_from
    """
)


@router.get(
    "/committee-industries",
    response_model=CommitteeIndustriesResponse,
    summary="Which industries each committee is taken to oversee, for the trade overlap notes",
)
def committee_industries(
    session: Annotated[Session, Depends(get_session)],
) -> CommitteeIndustriesResponse:
    industries: dict[str, list[CommitteeIndustry]] = {}
    for row in session.execute(COMMITTEE_INDUSTRIES_SQL).mappings().all():
        industries.setdefault(row["committee_thomas_id"], []).append(
            CommitteeIndustry(**{k: row[k] for k in CommitteeIndustry.model_fields})
        )
    return CommitteeIndustriesResponse(
        committees=[
            CommitteeIndustryScope(
                thomas_id=row["thomas_id"],
                name=row["name"],
                chamber=row["chamber"],
                mapped=row["mapped"],
                reason=row["reason"],
                industries=industries.get(row["thomas_id"], []),
            )
            for row in session.execute(COMMITTEE_SCOPE_SQL).mappings().all()
        ]
    )
