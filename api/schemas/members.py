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
    middle: str | None = None
    last: str
    nickname: str | None = None
    suffix: str | None = None
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
    """External identifiers from congress-legislators (all optional upstream except bioguide)."""

    govtrack: int | None
    icpsr: int | None
    fec: list[str]
    lis: str | None = Field(default=None, description="Senate LIS id, e.g. S374")
    opensecrets: str | None = Field(default=None, description="OpenSecrets candidate id")
    wikipedia: str | None = Field(default=None, description="Wikipedia article title")
    ballotpedia: str | None = Field(default=None, description="Ballotpedia page title")
    cspan: int | None = Field(default=None, description="C-SPAN person id")
    votesmart: int | None = Field(default=None, description="Vote Smart id")
    wikidata: str | None = Field(default=None, description="Wikidata item, e.g. Q3090307")


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
    caucus: str | None = Field(
        default=None, description="For Independents, the party they caucus with"
    )
    seat: Seat
    term: TermInfo
    photo_url: str | None
    ids: MemberIds
    committees: list[CommitteeAssignment]


class MembersResponse(BaseModel):
    members: list[MemberSummary]
    sources: list[SourceRef] = Field(description="Distinct provenance of everything above")
