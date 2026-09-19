"""Response models for /api/v1/congress."""

from __future__ import annotations

import datetime as dt
from datetime import datetime

from pydantic import BaseModel, Field

from api.schemas.members import SourceRef


class PartyGroup(BaseModel):
    party_group: str = Field(description="republican, democratic, independent, or vacant")
    label: str
    seats: int
    seat_pct: float = Field(description="Share of the chamber's seats; the bar segment's width")
    caucus_with: str | None = Field(description="For independents, the party they caucus with")


class ChamberComposition(BaseModel):
    chamber: str = Field(description="house or senate")
    seats: int
    seated: int
    vacant: int
    majority_threshold: int = Field(description="Seats for a majority: chamber seats / 2 + 1")
    majority_pct: float = Field(description="Where the majority line falls along the bar, in %")
    republican_caucus: int
    democratic_caucus: int
    majority_party: str | None
    majority_letter: str | None = Field(description="R or D; null on a tie")
    majority_margin: int
    groups: list[PartyGroup] = Field(description="Republican, Democratic, Independent, Vacant")
    source_url: str


class Composition(BaseModel):
    as_of: dt.date = Field(description="The day the hand-maintained seed was last checked")
    seats: int
    seated: int
    vacant: int
    chambers: list[ChamberComposition] = Field(description="House, then Senate")


class Activity(BaseModel):
    """Every bill in the dataset, whoever sponsored it (ADR 0013)."""

    tracked_members: int
    bills_in_dataset: int = Field(
        description="Bills the counts are drawn from: not every bill in Congress"
    )
    bills_house: int = Field(description="By chamber of origin")
    bills_senate: int
    passed_chamber: int
    passed_chamber_house_origin: int
    passed_chamber_senate_origin: int
    became_law: int
    became_law_pct: float | None
    vetoed: int
    vetoed_overridden: int
    vetoed_not_overridden: int


class PassedBothItem(BaseModel):
    congress: int
    bill_type: str
    bill_number: str
    label: str
    title: str | None
    outcome: str | None = Field(
        description="law, vetoed, overridden, adopted (concurrent resolution), or pending"
    )
    public_law_number: str | None
    outcome_date: dt.date | None
    house_yea: int | None = Field(description="Null when the House left no passage roll call")
    house_nay: int | None
    senate_yea: int | None = Field(description="Null when the Senate left no passage roll call")
    senate_nay: int | None
    congress_gov_url: str


class PassedBoth(BaseModel):
    """The table of measures that cleared both chambers (ADR 0013)."""

    total: int
    enacted: int
    adopted: int = Field(description="Concurrent resolutions, which never go to the President")
    vetoed: int = Field(description="Vetoed and overridden")
    items: list[PassedBothItem] = Field(description="Every measure, newest outcome first")


class OverviewResponse(BaseModel):
    congress: int
    congress_start: dt.date
    congress_end: dt.date
    composition: Composition
    activity: Activity
    passed_both: PassedBoth
    generated_at: datetime
    sources: list[SourceRef]
