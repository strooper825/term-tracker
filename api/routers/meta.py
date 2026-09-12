"""/api/v1/meta: operational metadata such as data freshness."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.db import get_session
from api.schemas.meta import FreshnessResponse, SourceFreshness

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
