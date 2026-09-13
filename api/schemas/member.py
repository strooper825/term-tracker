"""Response models for the per-member endpoints under /api/v1/members/{bioguide}."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

from api.schemas.members import CommitteeAssignment, MemberIds, MemberName, Seat, SourceRef

EventType = Literal["vote", "bill_sponsored", "bill_cosponsored", "committee_action"]
Role = Literal["sponsor", "cosponsor"]


class TermSpan(BaseModel):
    congress: int = Field(description="Congress in session when the term began")
    end_congress: int = Field(description="Congress in session on the day before the term ends")
    congresses: list[int] = Field(description="Every Congress the term spans, e.g. [117, 118, 119]")
    tracked_congress: int = Field(description="The Congress this dashboard covers (plan section 1)")
    start_date: dt.date
    end_date: dt.date
    days_remaining: int = Field(description="Whole days from today to end_date; 0 once past")
    days_elapsed: int


class VoteStats(BaseModel):
    roll_calls: int | None = Field(description="Roll calls in the chamber this Congress")
    positions: int
    votes_cast: int
    not_voting: int
    attendance_pct: float | None
    missed_vote_pct: float | None
    party_unity_pct: float | None = Field(
        description="Share of Yea/Nay votes matching the majority of the member's party"
    )
    party_unity_cq_pct: float | None = Field(
        description="Same, on roll calls where Republican and Democratic majorities opposed"
    )


class ActivityCounts(BaseModel):
    bills_sponsored: int
    bills_cosponsored: int
    committees: int
    chairmanships: int = Field(description="Chairs of full committees in the member's own chamber")


class MemberDetail(BaseModel):
    bioguide_id: str
    name: MemberName
    party: str | None
    seat: Seat
    term: TermSpan
    photo_url: str | None
    ids: MemberIds
    votes: VoteStats
    activity: ActivityCounts
    sources: list[SourceRef]


class WeekBucket(BaseModel):
    week_start: dt.date
    vote: int = 0
    bill_sponsored: int = 0
    bill_cosponsored: int = 0
    committee_action: int = 0
    total: int = 0


class TimelineResponse(BaseModel):
    bioguide_id: str
    from_date: dt.date = Field(alias="from")
    to_date: dt.date = Field(alias="to")
    weeks: list[WeekBucket]
    sources: list[SourceRef]

    model_config = {"populate_by_name": True}


class FeedItem(BaseModel):
    event_key: str
    event_type: EventType
    event_at: dt.datetime
    event_date: dt.date
    headline: str
    detail: str | None
    position: str | None
    chamber: str | None
    session: int | None
    roll_number: int | None
    bill_type: str | None
    bill_number: str | None
    url: str | None
    source_url: str


class FeedResponse(BaseModel):
    bioguide_id: str
    items: list[FeedItem]
    next_cursor: str | None = Field(description="Pass back as ?cursor= for the next page")
    sources: list[SourceRef]


class VoteItem(BaseModel):
    chamber: str
    session: int
    roll_number: int
    voted_at: dt.datetime | None
    vote_date: dt.date
    question: str | None
    result: str | None
    bill_type: str | None
    bill_number: str | None
    bill_title: str | None
    position: str
    position_raw: str
    yea_total: int
    nay_total: int
    not_voting_total: int
    source_url: str


class VotesResponse(BaseModel):
    bioguide_id: str
    items: list[VoteItem]
    sources: list[SourceRef]


class BillItem(BaseModel):
    congress: int
    bill_type: str
    bill_number: str
    kind: str
    title: str
    policy_area: str | None
    introduced_date: dt.date
    latest_action_date: dt.date | None
    latest_action_text: str | None
    congress_gov_url: str
    role: Role
    date: dt.date | None = Field(description="Introduction date for a sponsor, join date otherwise")
    is_original_cosponsor: bool | None
    withdrawn_date: dt.date | None


class BillsResponse(BaseModel):
    bioguide_id: str
    role: Role | None
    items: list[BillItem]
    sources: list[SourceRef]


class CommitteesResponse(BaseModel):
    bioguide_id: str
    items: list[CommitteeAssignment]
    sources: list[SourceRef]


class KeyDate(BaseModel):
    date: dt.date
    label: str
    kind: str
    scope: str
    scope_value: str | None
    note: str | None
    source_url: str


class KeyDatesResponse(BaseModel):
    bioguide_id: str
    items: list[KeyDate]
    sources: list[SourceRef]
