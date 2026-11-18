"""Response shapes for /api/v1/states (ADR 0035)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from api.schemas.members import SourceRef


class Office(BaseModel):
    address: str | None
    phone: str | None


class Social(BaseModel):
    twitter: str | None
    facebook: str | None
    instagram: str | None
    youtube: str | None


class PriorRole(BaseModel):
    chamber: str
    chamber_name: str | None
    start_date: date | None
    end_date: date | None


class Governor(BaseModel):
    person_id: str
    name: str
    title: str = Field(description="Governor, or Mayor for the District of Columbia")
    party: str | None = Field(description="R, D or I (independent or another party)")
    party_label: str | None = Field(description="The party as Open States names it")
    image_url: str | None
    website_url: str | None
    start_date: date | None = Field(description="Start of the role held on the day")
    since: date | None = Field(description="Start of the governor's unbroken time in office")
    term_end: date | None = Field(description="End of the current term as Open States records it")
    email: str | None
    office: Office | None
    contact_form_url: str | None
    social: Social
    prior_service: list[PriorRole] = Field(
        description="Legislative service on record before taking office, one row per chamber"
    )


class PartySeats(BaseModel):
    party: str = Field(description="R, D, I or N (nonpartisan)")
    party_group: str = Field(description="R, D, N, Independent, or the party itself for others")
    seats: int


class Chamber(BaseModel):
    chamber: str = Field(description="upper, lower, or legislature for a one-chamber body")
    name: str = Field(description='"Senate", "House of Delegates", "Nebraska Legislature"')
    slug: str = Field(
        description="The chamber's roster page, /states/{state}/{slug}: senate, house, assembly, "
        "legislature (Nebraska) or council (DC)"
    )
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
    by_registration: bool = Field(
        description="Parties are members' voter registration in an officially nonpartisan "
        "legislature (Nebraska)"
    )
    parties: list[PartySeats]


class StateSummary(BaseModel):
    state: str = Field(description="Two-letter postal code")
    name: str
    control: str = Field(description="R, D, I, N (nonpartisan legislature) or split")
    by_registration: bool = Field(
        description="Control is read from members' party registration (Nebraska)"
    )
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


class Term(BaseModel):
    chamber: str
    chamber_name: str | None
    district: str | None
    start_date: date | None = Field(description="Null when the source has no start date")
    end_date: date | None = Field(description="Null while the span runs")


class CommitteeSeat(BaseModel):
    name: str
    chamber: str = Field(description="upper, lower, or legislature (joint)")
    role: str | None = Field(description='"Chair", "vice chair", ...; null for a plain member')


class LegislatorProfile(BaseModel):
    person_id: str
    district: str
    district_note: str | None = Field(description="at-large, floterial or non-voting")
    name: str
    family_name: str | None
    party: str = Field(description="R, D, I or N")
    party_group: str
    party_label: str | None
    party_basis: str = Field(description="party, or registration (Nebraska)")
    image_url: str | None
    email: str | None
    website_url: str | None
    capitol_office: Office | None
    district_office: Office | None
    social: Social
    terms: list[Term] = Field(description="Service on record, newest first; often incomplete")
    committees: list[CommitteeSeat] = Field(description="Leaders first; empty in an archived build")


class RosterChamber(BaseModel):
    chamber: str
    slug: str
    name: str
    title: str
    seats: int
    vacant: int
    legislators: list[LegislatorProfile] = Field(description="Seated members, by district")


class StateRoster(BaseModel):
    as_of: date
    state: str
    name: str
    legislature_name: str
    chambers: list[RosterChamber]
    generated_at: datetime
    sources: list[SourceRef]


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
