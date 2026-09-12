"""Response models for /api/v1/meta."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


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
