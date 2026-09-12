"""Response models for /api/v1/members."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class SourceRef(BaseModel):
    source: str = Field(description="Source name, e.g. legislators")
    source_url: str
    fetched_at: datetime


class MemberName(BaseModel):
    first: str
    last: str
    official_full: str


class Seat(BaseModel):
    chamber: str = Field(description="house or senate")
    state: str = Field(description="Two-letter state abbreviation")
    state_name: str | None
    fips_state: str | None
    district: int | None = Field(description="House only; 0 means at-large")
    senate_class: int | None = Field(description="Senate only")
    state_rank: str | None = Field(description="Senate only: junior or senior")
    label: str = Field(description='e.g. "WI-1" or "Arkansas (Class 2)"')


class TermInfo(BaseModel):
    congress: int = Field(description="Congress in session when the term began")
    start_date: date
    end_date: date
    party: str | None


class MemberIds(BaseModel):
    govtrack: int | None
    icpsr: int | None
    fec: list[str]


class CommitteeAssignment(BaseModel):
    thomas_id: str
    name: str
    chamber: str
    parent_thomas_id: str | None
    parent_name: str | None
    rank: int | None
    title: str | None


class MemberSummary(BaseModel):
    bioguide_id: str
    name: MemberName
    party: str | None
    seat: Seat
    term: TermInfo
    photo_url: str | None
    ids: MemberIds
    committees: list[CommitteeAssignment]


class MembersResponse(BaseModel):
    members: list[MemberSummary]
    sources: list[SourceRef] = Field(description="Distinct provenance of everything above")
