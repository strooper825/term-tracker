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
    scoring_party: str | None = Field(
        default=None,
        description="Party letter the unity figures are scored against: the vote-record party, "
        "or the caucus for an Independent who caucuses with a party (ADR 0005)",
    )
    party_unity_pct: float | None = Field(
        description="Share of Yea/Nay votes matching the majority of the scoring party"
    )
    party_unity_cq_pct: float | None = Field(
        description="Same, on roll calls where Republican and Democratic majorities opposed"
    )


class MemberBio(BaseModel):
    birthday: dt.date | None
    age: int | None = Field(description="Whole years from birthday to today (UTC)")
    gender: str | None = Field(description="M or F as congress-legislators records it")


class TermHistoryItem(BaseModel):
    term_index: int = Field(description="1-based position in the source terms list")
    chamber: str
    congress: int
    end_congress: int
    start_date: dt.date
    end_date: dt.date
    state: str
    district: int | None
    senate_class: int | None
    party: str | None
    caucus: str | None
    how: str | None = Field(description="appointment or special-election when not a regular one")
    end_type: str | None = Field(description="Why the term ended early, when it did")


class ServiceRecord(BaseModel):
    first_term_start: dt.date = Field(description="Start of the first term ever served")
    serving_since: dt.date = Field(
        description="Start of the current unbroken run of terms (consecutive Congresses)"
    )
    term_number: int = Field(description="Terms served so far, this one included, both chambers")
    chamber_since: dt.date = Field(description="Start of the current unbroken run in this chamber")
    chamber_term_number: int = Field(description="Terms served in the current chamber")
    terms: list[TermHistoryItem]


class LeadershipRole(BaseModel):
    title: str
    chamber: str
    start_date: dt.date
    end_date: dt.date | None
    is_current: bool


class ActivityCounts(BaseModel):
    bills_sponsored: int
    bills_cosponsored: int
    committees: int
    chairmanships: int = Field(
        description="Chairs of full committees, joint included; subcommittees excluded"
    )


class MemberDetail(BaseModel):
    bioguide_id: str
    name: MemberName
    party: str | None
    caucus: str | None = Field(
        default=None, description="For Independents, the party they caucus with"
    )
    seat: Seat
    term: TermSpan
    bio: MemberBio
    service: ServiceRecord
    leadership: list[LeadershipRole] = Field(description="Every recorded role, newest first")
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
    congress: int
    event_at: dt.datetime
    event_date: dt.date
    headline: str
    detail: str | None
    detail_full: str | None = Field(
        default=None, description="Uncapped text when detail is summarised (en bloc votes)"
    )
    position: str | None
    chamber: str | None
    session: int | None
    roll_number: int | None
    bill_type: str | None
    bill_number: str | None
    bill_label: str | None = Field(
        default=None,
        description="Human bill form when the bill has a detail page on this site, else null",
    )
    policy_area: str | None = Field(
        default=None,
        description="Congress.gov policy area of the bill this event concerns. Null for a "
        "nomination vote, a procedural roll call, an amendment, and any bill the source has "
        "not assigned one",
    )
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


class ContactResponse(BaseModel):
    bioguide_id: str
    website_url: str | None = Field(description="Official website")
    contact_form_url: str | None
    phone: str | None = Field(description="Washington office")
    fax: str | None
    office: str | None = Field(description="Building and room number")
    address: str | None = Field(description="Washington mailing address")
    rss_url: str | None
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


FundraisingStatus = Literal["filed", "no_filings", "no_committee", "no_candidate"]


class FecCandidateRef(BaseModel):
    candidate_id: str
    name: str | None
    fec_url: str = Field(description="Public candidate page, two-year totals for the cycle")


class FecCommitteeRef(BaseModel):
    committee_id: str
    name: str | None
    fec_url: str = Field(description="Public committee page for the cycle")


class FundraisingCoverage(BaseModel):
    start_date: dt.date
    end_date: dt.date = Field(description="Through date of the latest report summed in")
    last_report_type: str | None = Field(description="e.g. JULY QUARTERLY, PRE-PRIMARY")
    last_report_year: int | None


class FundraisingTotals(BaseModel):
    raised: float = Field(description="Total receipts for the cycle")
    spent: float = Field(description="Total disbursements for the cycle")
    cash_on_hand: float = Field(description="At the end of the latest report")
    debts: float = Field(description="Debts owed by the committee at the end of the latest report")


class ReceiptSource(BaseModel):
    amount: float
    pct: float | None = Field(description="Share of total receipts, from the mart")


class ReceiptBreakdown(BaseModel):
    individual_small: ReceiptSource = Field(description="Individuals, $200 or less (unitemized)")
    individual_large: ReceiptSource = Field(description="Individuals, over $200 (itemized)")
    individual: ReceiptSource = Field(description="All individual contributions")
    pac: ReceiptSource = Field(description="Other political committees")
    party: ReceiptSource = Field(description="Party committees")
    self_funding: ReceiptSource = Field(description="Candidate contributions plus candidate loans")
    transfers: ReceiptSource = Field(description="Transfers from other authorized committees")
    other: ReceiptSource = Field(description="Offsets, other receipts, other loans (residual)")


class FundraisingResponse(BaseModel):
    bioguide_id: str
    cycle: int = Field(description="Two-year election cycle, e.g. 2026 for 2025-2026")
    status: FundraisingStatus = Field(
        description="filed, or how far the chain candidate -> principal committee -> totals got"
    )
    candidate: FecCandidateRef | None
    committee: FecCommitteeRef | None = Field(description="Principal campaign committee")
    coverage: FundraisingCoverage | None
    totals: FundraisingTotals | None
    receipts: ReceiptBreakdown | None
    small_donor_pct: float | None = Field(
        description="Individual contributions of $200 or less as a share of total receipts"
    )
    small_donor_of_individual_pct: float | None = Field(
        description="Same, as a share of individual contributions only"
    )
    sources: list[SourceRef]
