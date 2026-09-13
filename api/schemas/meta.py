"""Response models for /api/v1/meta."""

from __future__ import annotations

import datetime as dt
from datetime import datetime

from pydantic import BaseModel, Field

from api.schemas.members import SourceRef


class SourceFreshness(BaseModel):
    source: str = Field(description="Ingestion source name, e.g. congress_gov")
    source_url: str | None = Field(description="Base URL the run fetched from")
    fetched_at: datetime = Field(description="When the last successful run finished (UTC)")
    rows_loaded: int | None = Field(description="Rows upserted by that run, if recorded")


class FreshnessResponse(BaseModel):
    generated_at: datetime = Field(description="When this response was built (UTC)")
    sources: list[SourceFreshness] = Field(
        description="One entry per source that has at least one successful run"
    )


class CongressSession(BaseModel):
    congress: int
    session: int = Field(description="1 or 2 within a Congress")
    year: int
    start_date: dt.date = Field(description="January 3, the 20th Amendment convening date")
    end_date: dt.date = Field(description="Through the day before the next session convenes")
    first_roll_call_date: dt.date
    last_roll_call_date: dt.date
    roll_calls: int
    is_current: bool


class SessionsResponse(BaseModel):
    sessions: list[CongressSession] = Field(description="Oldest first")
    sources: list[SourceRef]
