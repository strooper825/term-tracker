"""Response shapes for /api/v1/states (ADR 0035)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from api.schemas.members import SourceRef


class Governor(BaseModel):
    person_id: str
    name: str
    title: str = Field(description="Governor, or Mayor for the District of Columbia")
    party: str | None = Field(description="R, D or I (independent or another party)")
    party_label: str | None = Field(description="The party as Open States names it")
    image_url: str | None
    website_url: str | None
    start_date: date | None


class PartySeats(BaseModel):
    party: str = Field(description="R, D, I or N (nonpartisan)")
    party_group: str = Field(description="R, D, N, Independent, or the party itself for others")
    seats: int


class Chamber(BaseModel):
    chamber: str = Field(description="upper, lower, or legislature for a one-chamber body")
    name: str = Field(description='"Senate", "House of Delegates", "Nebraska Legislature"')
    title: str = Field(description="What a member is called: Senator, Representative, ...")
    seats: int = Field(description="Voting seats, vacant ones included")
    republican: int
    democratic: int
    other: int = Field(description="Independents and members of other parties")
    nonpartisan: int
    vacant: int
    majority_seats: int = Field(description="More than half of all seats")
    supermajority_seats: int
    supermajority_fraction: str = Field(description='"2/3" or "3/5"')
    supermajority_basis: str | None
    control_party: str | None = Field(description="R, D, I or N; null when no party controls it")
    control_group: str | None = Field(description="The controlling party group, by name for I")
    control_kind: str = Field(
        description="supermajority, majority, coalition, nonpartisan, or none"
    )
    control_note: str | None
    parties: list[PartySeats]


class StateSummary(BaseModel):
    state: str = Field(description="Two-letter postal code")
    name: str
    control: str = Field(description="R, D, I, N (nonpartisan legislature) or split")
    governor: Governor | None
    chambers: list[Chamber]


class StatesResponse(BaseModel):
    as_of: date = Field(description="The day the figures describe")
    states: list[StateSummary]
    generated_at: datetime
    sources: list[SourceRef]


class Legislator(BaseModel):
    person_id: str
    chamber: str
    district: str = Field(description="As Open States names it: 7, 10A, Hillsborough 12, ...")
    shape: str | None = Field(
        description="Census code of the district's shape in /maps/states/{state}.json; null for "
        "a seat with no shape of its own"
    )
    district_seats: int | None = Field(description="Seats the district elects")
    district_note: str | None = Field(description="at-large, floterial or non-voting")
    name: str
    party: str = Field(description="R, D, I or N")
    party_label: str | None
    image_url: str | None
    email: str | None
    website_url: str | None


class District(BaseModel):
    chamber: str
    district: str = Field(description="As Open States names it")
    seats: int = Field(description="Seats the district elects")
    shape: str | None = Field(description="Census code of its shape; null when it has none")
    note: str | None = Field(description="at-large, floterial or non-voting")


class StateDetail(BaseModel):
    as_of: date
    state: StateSummary
    legislature_name: str
    districts: list[District] = Field(description="Every district, held or vacant")
    legislators: list[Legislator]
    generated_at: datetime
    sources: list[SourceRef]
