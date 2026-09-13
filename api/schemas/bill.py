"""Response models for /api/v1/bills and /api/v1/bills/{congress}/{type}/{number}."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field

from api.schemas.members import SourceRef


class BillKey(BaseModel):
    congress: int
    bill_type: str = Field(description="Lower-case Congress.gov type: hr, s, hres, samdt, ...")
    bill_number: str
    label: str = Field(description='Human form, e.g. "H.R. 4735"')
    kind: str = Field(description="bill or amendment")


class BillSponsor(BaseModel):
    bioguide_id: str | None
    name: str = Field(description='Plain form, e.g. "Bryan Steil"')
    full_name: str | None = Field(description='Upstream form, "Rep. Steil, Bryan [R-WI-1]"')
    party: str | None
    state: str | None
    district: int | None
    is_tracked: bool = Field(description="Whether this member has a dashboard on this site")


class CosponsorCounts(BaseModel):
    total: int
    democratic: int
    republican: int
    other: int = Field(description="Independents and anyone the source records otherwise")
    withdrawn: int = Field(description="Included in total; the list marks them")


class BillListItem(BillKey):
    title: str
    policy_area: str | None
    introduced_date: dt.date
    latest_action_date: dt.date | None
    latest_action_text: str | None
    sponsor: BillSponsor
    cosponsors: CosponsorCounts
    action_count: int
    summary_count: int
    has_summary: bool
    roll_call_count: int
    congress_gov_url: str


class BillListResponse(BaseModel):
    items: list[BillListItem]
    total: int = Field(description="Bills in the mart, ignoring limit and offset")
    limit: int
    offset: int
    sources: list[SourceRef]


class BillCosponsor(BaseModel):
    bioguide_id: str
    name: str
    full_name: str | None
    party: str | None
    state: str | None
    district: int | None
    date: dt.date = Field(description="The day the member joined as a cosponsor")
    is_original_cosponsor: bool | None
    withdrawn_date: dt.date | None
    is_withdrawn: bool
    is_tracked_member: bool


class BillSummaryVersion(BaseModel):
    version_code: str = Field(description='Stage code: "00" Introduced, "49" Public Law, ...')
    action_date: dt.date = Field(description='The "as of" date of this summary')
    action_desc: str = Field(description='Stage in words, e.g. "Passed House"')
    text_html: str = Field(description="Summary as CRS publishes it, HTML")
    text_length: int
    update_date: dt.datetime
    is_latest: bool


class BillAction(BaseModel):
    action_date: dt.date
    action_time: str | None
    action_code: str | None
    action_text: str | None
    action_type: str | None
    source_system: str | None


class TrackedPosition(BaseModel):
    bioguide_id: str
    name: str
    party: str | None
    position: str = Field(description="Yea, Nay, Present, Not Voting, or Other")


class BillRollCall(BaseModel):
    chamber: str
    session: int
    roll_number: int
    voted_at: dt.datetime | None
    vote_date: dt.date
    question: str | None
    result: str | None
    yea_total: int
    nay_total: int
    present_total: int
    not_voting_total: int
    tracked_positions: list[TrackedPosition] = Field(
        description="How the members tracked on this site voted; empty when none was seated"
    )
    source_url: str


class BillDetail(BillListItem):
    amended_bill_congress: int | None = Field(description="Amendments: the bill amended")
    amended_bill_type: str | None
    amended_bill_number: str | None
    update_date: dt.datetime | None
    summary: BillSummaryVersion | None = Field(
        description="Latest CRS summary; null when the bill has none yet"
    )
    summary_versions: list[BillSummaryVersion] = Field(
        description="Every version, newest first, the latest one included"
    )
    cosponsor_list: list[BillCosponsor] = Field(description="Every cosponsor, earliest first")
    actions: list[BillAction] = Field(description="Complete action history, newest first")
    roll_calls: list[BillRollCall] = Field(description="Every recorded roll call on this bill")
    sources: list[SourceRef]
