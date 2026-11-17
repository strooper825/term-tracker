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
    unavailable: bool = Field(
        default=False,
        description=(
            "True when the source refused the newest run, so fetched_at is the last time it "
            "could be read at all"
        ),
    )


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


class CommitteeIndustry(BaseModel):
    sic_from: int = Field(description="First SIC code of the range")
    sic_to: int = Field(description="Last SIC code of the range")
    industry: str
    basis: str = Field(description="The part of the committee's jurisdiction the row rests on")


class CommitteeIndustryScope(BaseModel):
    thomas_id: str
    name: str
    chamber: str = Field(description="house, senate or joint")
    mapped: bool = Field(description="Whether any industry is mapped to the committee")
    reason: str | None = Field(
        description="Why the committee is not mapped, or is mapped only in part"
    )
    industries: list[CommitteeIndustry]


class CommitteeIndustriesResponse(BaseModel):
    """The narrow committee-to-industry mapping behind the trade overlap notes (ADR 0032)."""

    committees: list[CommitteeIndustryScope] = Field(description="Mapped first, then by name")
