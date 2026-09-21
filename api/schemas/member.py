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


StatementsMode = Literal["feed", "link", "none"]


class StatementItem(BaseModel):
    guid: str = Field(description="The feed's own item id; not always a public URL")
    title: str
    published_at: dt.datetime
    published_date: dt.date = Field(description="Date in Eastern time")
    url: str = Field(description="The release on the office's own site")
    author: str | None
    categories: list[str]
    description: str | None = Field(description="The feed's excerpt, as published (may hold HTML)")
    content_html: str | None = Field(
        description="Full text as published (HTML), when the feed has it"
    )


class StatementsResponse(BaseModel):
    bioguide_id: str
    mode: StatementsMode = Field(
        description="feed: the office's own feed is ingested; link: only the press page is "
        "linked; none: the member is not in seed.statement_sources (ADR 0015)"
    )
    label: str | None = Field(description="Host the statements come from, e.g. sanders.senate.gov")
    press_url: str | None = Field(description="The office's press-release listing")
    feed_url: str | None
    total: int = Field(description="Statements held for the member; items may be fewer")
    newest_published_at: dt.datetime | None
    items: list[StatementItem] = Field(description="Newest first")
    sources: list[SourceRef]


StockTradesStatus = Literal["filed", "no_filings", "senate_unavailable"]
PtrFilingStatus = Literal["parsed", "scanned", "failed"]


class StockTradeItem(BaseModel):
    doc_id: str = Field(description="The Clerk's DocID of the report the trade is printed on")
    row_number: int = Field(description="Position in that report's transaction table, from 1")
    trade_date: dt.date
    notification_date: dt.date
    filing_date: dt.date
    days_to_file: int = Field(description="Filing date minus trade date")
    owner_code: str = Field(description="SELF, SP (spouse), DC (dependent child) or JT (joint)")
    owner_label: str
    asset_name: str
    ticker: str | None = Field(description="Read from the asset name when it holds one")
    asset_type_code: str
    asset_type_label: str
    transaction_type_code: str = Field(description="P, S, S (partial) or E as printed")
    transaction_type_label: str
    direction: str = Field(description="purchase, sale, exchange or other")
    amount_raw: str = Field(description="The disclosed band as printed, e.g. $1,001 - $15,000")
    amount_kind: Literal["band", "top_band", "exact"] = Field(
        description="band: a disclosed range; top_band: Over $50,000,000, no high end; "
        "exact: the filer entered one figure, so low equals high"
    )
    amount_low: float
    amount_high: float | None = Field(description="Null for the top band (Over $50,000,000)")
    filing_status: str | None
    subholding_of: str | None
    description: str | None
    location: str | None
    comments: str | None
    has_unmapped_code: bool = Field(description="A code no seed maps; shown by its raw code")
    source_url: str = Field(description="The PDF, with #page=N")


class StockTradeFiling(BaseModel):
    doc_id: str
    year: int
    filing_date: dt.date
    status: PtrFilingStatus = Field(
        description="parsed: trades read; scanned: a paper form with no text layer, so no "
        "trades can be read; failed: text present but the table did not parse"
    )
    error: str | None
    pages: int | None
    trades: int
    source_url: str = Field(description="The report PDF on the Clerk's site")


class StockTradesSummary(BaseModel):
    filings: int
    filings_parsed: int
    filings_scanned: int
    filings_failed: int
    latest_filing_date: dt.date | None
    trades: int
    purchases: int
    sales: int
    exchanges: int
    purchases_low: float = Field(description="Sum of the low ends of the purchase bands")
    purchases_high: float = Field(description="Sum of the high ends of the purchase bands")
    purchases_high_is_open: bool = Field(
        description="A purchase is in the top band, which has no high end: the high sum is a floor"
    )
    sales_low: float
    sales_high: float
    sales_high_is_open: bool
    first_trade_date: dt.date | None
    last_trade_date: dt.date | None


class StockTradesResponse(BaseModel):
    bioguide_id: str
    chamber: Literal["house", "senate"]
    status: StockTradesStatus = Field(
        description="filed: the member has Periodic Transaction Reports; no_filings: a House "
        "member the Clerk lists none for; senate_unavailable: the Senate eFD system blocks "
        "automated access, so no Senate trades are ingested (ADR 0018)"
    )
    covers_from: dt.date = Field(description="First day of the tracked Congress")
    lookup_url: str = Field(description="The official search, for checking against the source")
    checked_at: dt.datetime | None = Field(description="Last successful ingest of the source")
    summary: StockTradesSummary
    filings: list[StockTradeFiling] = Field(description="Newest first")
    items: list[StockTradeItem] = Field(description="Newest trade first")
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


class MapCounty(BaseModel):
    geoid: str = Field(description="Census county GEOID (state + county FIPS)")
    name: str = Field(description="Name and type as Census gives it, e.g. Milwaukee County")
    d: str = Field(description="SVG path data in the view's frame; drawn with fill-rule evenodd")


class MapView(BaseModel):
    key: Literal["district", "state"]
    width: float = Field(
        description="Frame width in SVG user units; the viewBox is 0 0 width height"
    )
    height: float
    outline: str = Field(description="SVG path data of the shape this view is about")
    counties: list[MapCounty] = Field(
        description="County lines; in the district view clipped to the district"
    )
    district: str | None = Field(
        description="State view only: the member's district in this frame, null when the district "
        "is the whole state or has no map"
    )


class ConstituencyMap(BaseModel):
    views: list[MapView] = Field(description="First is the default; a House member has two")


class Estimate(BaseModel):
    value: float | None = Field(
        description="The ACS estimate; null when Census could not compute it"
    )
    margin: float | None = Field(description="Margin of error at 90 percent confidence")


class RaceShare(BaseModel):
    key: Literal[
        "white", "black", "native", "asian", "pacific", "other", "multiple", "hispanic"
    ] = Field(description="B03002 category; every one but hispanic is non-Hispanic")
    pct: float | None = Field(description="Share of the population, percent")


class ConstituencyDemographics(BaseModel):
    acs_year: int = Field(description="Last year of the 5-year estimates: 2024 is 2020-2024")
    period: str = Field(description="For example 2020-2024")
    name: str = Field(description="The Census's name for the geography")
    population: Estimate
    median_age: Estimate
    median_household_income: Estimate = Field(description="In dollars of the last year")
    households: Estimate
    bachelors_or_higher_pct: Estimate = Field(description="Of people 25 and over")
    high_school_or_higher_pct: Estimate = Field(description="Of people 25 and over")
    unemployment_pct: Estimate = Field(description="Of the civilian labor force")
    poverty_pct: Estimate = Field(description="Of all people")
    race: list[RaceShare] = Field(description="Sums to 100; the shares carry no margin of error")


class ConstituencyResponse(BaseModel):
    bioguide_id: str
    chamber: Literal["house", "senate"]
    label: str | None = Field(
        description="Wisconsin, WI-1, AK (At Large); null with no constituency row"
    )
    congress: int | None = Field(description="The Congress whose district lines the data uses")
    district: int | None = Field(description="Null for a senator; 0 at large")
    map: ConstituencyMap | None = Field(
        description="Null until the Census boundary files are loaded"
    )
    demographics: ConstituencyDemographics | None = Field(
        description="Null until the ACS release for this Congress's lines is loaded"
    )
    sources: list[SourceRef]
