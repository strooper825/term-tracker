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
    CongressSession,
    FreshnessResponse,
    SessionsResponse,
    SourceFreshness,
)

router = APIRouter(prefix="/meta", tags=["meta"])

# Latest successful run per source. Only successes count as "fresh".
FRESHNESS_SQL = text(
    """
    SELECT DISTINCT ON (source) source, source_url, finished_at, rows_loaded
    FROM meta.ingest_run
    WHERE status = 'success' AND finished_at IS NOT NULL
    ORDER BY source, finished_at DESC
    """
)


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
