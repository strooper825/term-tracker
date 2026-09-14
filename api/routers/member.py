"""/api/v1/members/{bioguide}/...: one member's dashboard data (plan section 6)."""

from __future__ import annotations

import base64
import binascii
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.db import get_session
from api.routers.members import COMMITTEES_SQL, member_ids, seat_label
from api.schemas.member import (
    ActivityCounts,
    BillItem,
    BillsResponse,
    CommitteesResponse,
    ElectionCandidate,
    ElectionResponse,
    FecCandidateRef,
    FecCommitteeRef,
    FeedItem,
    FeedResponse,
    FundraisingCoverage,
    FundraisingResponse,
    FundraisingTotals,
    KeyDate,
    KeyDatesResponse,
    LeadershipRole,
    MemberBio,
    MemberDetail,
    NextElection,
    Opponent,
    PriorElection,
    ReceiptBreakdown,
    ReceiptSource,
    ServiceRecord,
    TermHistoryItem,
    TermSpan,
    TimelineResponse,
    VoteItem,
    VotesResponse,
    VoteStats,
    WeekBucket,
)
from api.schemas.members import CommitteeAssignment, MemberName, Seat, SourceRef

router = APIRouter(prefix="/members/{bioguide}", tags=["member"])

SUMMARY_SQL = text("SELECT * FROM mart.member_summary WHERE bioguide_id = :bioguide")

TERM_HISTORY_SQL = text(
    """
    SELECT term_index, chamber, congress, end_congress, start_date, end_date, state_abbr,
           district, senate_class, party, caucus, how, end_type, source, source_url, fetched_at
    FROM mart.term_history
    WHERE bioguide_id = :bioguide
    ORDER BY term_index
    """
)

LEADERSHIP_SQL = text(
    """
    SELECT title, chamber, start_date, end_date, is_current, source, source_url, fetched_at
    FROM mart.leadership_role
    WHERE bioguide_id = :bioguide
    ORDER BY start_date DESC, role_index DESC
    """
)

TIMELINE_SQL = text(
    """
    SELECT week_start, event_type, events, source, source_url, fetched_at
    FROM mart.member_activity_timeline
    WHERE bioguide_id = :bioguide AND week_start BETWEEN :from_week AND :to_date
    ORDER BY week_start
    """
)

FEED_SQL = text(
    """
    SELECT event_key, event_type, congress, event_at, event_date, headline, detail, detail_full,
           position, chamber,
           session, roll_number, bill_type, bill_number, bill_label, policy_area, url,
           source, source_url, fetched_at
    FROM mart.member_feed
    WHERE bioguide_id = :bioguide
      AND (
        CAST(:cursor_at AS timestamptz) IS NULL
        OR (event_at, event_key) < (CAST(:cursor_at AS timestamptz), :cursor_key)
      )
    ORDER BY event_at DESC, event_key DESC
    LIMIT :limit
    """
)

VOTES_SQL = text(
    """
    SELECT r.chamber, r.session, r.roll_number, r.voted_at, r.vote_date, r.question, r.result,
           r.bill_type, r.bill_number, b.title AS bill_title, v.position, v.position_raw,
           r.yea_total, r.nay_total, r.not_voting_total, v.source, v.source_url, v.fetched_at
    FROM mart.member_vote AS v
    JOIN mart.roll_call AS r
      ON r.congress = v.congress AND r.chamber = v.chamber
     AND r.session = v.session AND r.roll_number = v.roll_number
    LEFT JOIN mart.bill AS b
      ON b.congress = r.congress AND b.bill_type = r.bill_type AND b.bill_number = r.bill_number
    WHERE v.bioguide_id = :bioguide
    ORDER BY r.voted_at DESC NULLS LAST, r.session DESC, r.roll_number DESC
    LIMIT :limit
    """
)

BILLS_SQL = text(
    """
    SELECT b.congress, b.bill_type, b.bill_number, b.kind, b.title, b.policy_area,
           b.introduced_date, b.latest_action_date, b.latest_action_text, b.congress_gov_url,
           s.role, s.date, s.is_original_cosponsor, s.withdrawn_date,
           s.source, s.source_url, s.fetched_at
    FROM mart.bill_sponsorship AS s
    JOIN mart.bill AS b
      ON b.congress = s.congress AND b.bill_type = s.bill_type AND b.bill_number = s.bill_number
    WHERE s.bioguide_id = :bioguide AND (CAST(:role AS text) IS NULL OR s.role = :role)
    ORDER BY s.date DESC NULLS LAST, b.bill_type, b.bill_number DESC
    """
)

FUNDRAISING_SQL = text(
    """
    SELECT *
    FROM mart.member_fundraising
    WHERE bioguide_id = :bioguide
    ORDER BY cycle DESC
    LIMIT 1
    """
)

NEXT_ELECTION_SQL = text("SELECT * FROM mart.member_next_election WHERE bioguide_id = :bioguide")

PRIOR_ELECTION_SQL = text("SELECT * FROM mart.member_prior_election WHERE bioguide_id = :bioguide")

KEY_DATES_SQL = text(
    """
    SELECT date, label, kind, scope, scope_value, note, source, source_url, fetched_at
    FROM mart.key_date
    WHERE scope = 'congress'
       OR (scope = 'chamber' AND scope_value = :chamber)
       OR (scope = 'state' AND scope_value = :state)
       OR (scope = 'member' AND scope_value = :bioguide)
    ORDER BY date
    """
)


def _sources(rows: list[Any]) -> list[SourceRef]:
    seen: dict[tuple[str, str], SourceRef] = {}
    for row in rows:
        seen.setdefault(
            (row["source"], row["source_url"]),
            SourceRef(
                source=row["source"], source_url=row["source_url"], fetched_at=row["fetched_at"]
            ),
        )
    return sorted(seen.values(), key=lambda s: s.source_url)


def _summary(session: Session, bioguide: str) -> Any:
    row = session.execute(SUMMARY_SQL, {"bioguide": bioguide}).mappings().first()
    if row is None:
        raise HTTPException(
            status_code=404, detail=f"No tracked member with bioguide id {bioguide}"
        )
    return row


def age_on(birthday: date | None, today: date) -> int | None:
    """Whole years between birthday and today, or None when the birthday is unknown."""
    if birthday is None:
        return None
    before_birthday = (today.month, today.day) < (birthday.month, birthday.day)
    return today.year - birthday.year - int(before_birthday)


def encode_cursor(event_at: datetime, event_key: str) -> str:
    raw = f"{event_at.isoformat()}|{event_key}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        event_at_text, event_key = base64.urlsafe_b64decode(padded).decode().split("|", 1)
        return datetime.fromisoformat(event_at_text), event_key
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Malformed cursor") from exc


@router.get("", response_model=MemberDetail, summary="Header summary for one member")
def member_detail(bioguide: str, session: Annotated[Session, Depends(get_session)]) -> MemberDetail:
    row = _summary(session, bioguide)
    today = datetime.now(UTC).date()
    terms = session.execute(TERM_HISTORY_SQL, {"bioguide": bioguide}).mappings().all()
    roles = session.execute(LEADERSHIP_SQL, {"bioguide": bioguide}).mappings().all()
    return MemberDetail(
        bioguide_id=row["bioguide_id"],
        name=MemberName(
            first=row["first_name"],
            middle=row["middle_name"],
            last=row["last_name"],
            nickname=row["nickname"],
            suffix=row["suffix"],
            official_full=row["official_full_name"],
        ),
        party=row["party"],
        caucus=row["caucus"],
        seat=Seat(
            chamber=row["chamber"],
            state=row["state_abbr"],
            state_name=row["state_name"],
            fips_state=row["fips_state"],
            district=row["district"],
            senate_class=row["senate_class"],
            state_rank=row["state_rank"],
            label=seat_label(row),
        ),
        term=TermSpan(
            congress=row["congress"],
            end_congress=row["term_end_congress"],
            congresses=list(range(row["congress"], row["term_end_congress"] + 1)),
            tracked_congress=row["tracked_congress"],
            start_date=row["term_start_date"],
            end_date=row["term_end_date"],
            days_remaining=max((row["term_end_date"] - today).days, 0),
            days_elapsed=max((today - row["term_start_date"]).days, 0),
        ),
        bio=MemberBio(
            birthday=row["birthday"], age=age_on(row["birthday"], today), gender=row["gender"]
        ),
        service=ServiceRecord(
            first_term_start=row["first_term_start_date"],
            serving_since=row["serving_since_date"],
            term_number=row["term_count"],
            chamber_since=row["chamber_since_date"],
            chamber_term_number=row["chamber_term_count"],
            terms=[
                TermHistoryItem(state=t["state_abbr"], **{k: t[k] for k in _TERM_KEYS})
                for t in terms
            ],
        ),
        leadership=[
            LeadershipRole(**{k: r[k] for k in LeadershipRole.model_fields}) for r in roles
        ],
        photo_url=row["photo_url"],
        ids=member_ids(row),
        votes=VoteStats(
            roll_calls=row["roll_calls"],
            positions=row["positions"],
            votes_cast=row["votes_cast"],
            not_voting=row["not_voting"],
            attendance_pct=row["attendance_pct"],
            missed_vote_pct=row["missed_vote_pct"],
            scoring_party=row["scoring_party"],
            party_unity_pct=row["party_unity_pct"],
            party_unity_cq_pct=row["party_unity_cq_pct"],
        ),
        activity=ActivityCounts(
            bills_sponsored=row["bills_sponsored"],
            bills_cosponsored=row["bills_cosponsored"],
            committees=row["committees"],
            chairmanships=row["chairmanships"],
        ),
        sources=_sources([row, *terms, *roles]),
    )


_TERM_KEYS = [k for k in TermHistoryItem.model_fields if k != "state"]


@router.get("/timeline", response_model=TimelineResponse, summary="Weekly buckets of typed events")
def member_timeline(
    bioguide: str,
    session: Annotated[Session, Depends(get_session)],
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
) -> TimelineResponse:
    summary = _summary(session, bioguide)
    start = from_date or summary["term_start_date"]
    end = to_date or datetime.now(UTC).date()
    if end < start:
        raise HTTPException(status_code=400, detail="'to' must not be before 'from'")
    # A week bucket starts on Monday; include the week containing `from`.
    from_week = start - timedelta(days=start.weekday())
    rows = (
        session.execute(
            TIMELINE_SQL, {"bioguide": bioguide, "from_week": from_week, "to_date": end}
        )
        .mappings()
        .all()
    )
    buckets: dict[date, WeekBucket] = {}
    for row in rows:
        bucket = buckets.setdefault(row["week_start"], WeekBucket(week_start=row["week_start"]))
        setattr(bucket, row["event_type"], row["events"])
        bucket.total += row["events"]
    return TimelineResponse(
        bioguide_id=bioguide,
        **{"from": start, "to": end},
        weeks=[buckets[k] for k in sorted(buckets)],
        sources=_sources(rows),
    )


@router.get("/feed", response_model=FeedResponse, summary="Paginated chronological feed")
def member_feed(
    bioguide: str,
    session: Annotated[Session, Depends(get_session)],
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> FeedResponse:
    _summary(session, bioguide)
    cursor_at, cursor_key = decode_cursor(cursor) if cursor else (None, None)
    rows = (
        session.execute(
            FEED_SQL,
            {
                "bioguide": bioguide,
                "cursor_at": cursor_at.isoformat() if cursor_at else None,
                "cursor_key": cursor_key,
                "limit": limit + 1,
            },
        )
        .mappings()
        .all()
    )
    page = rows[:limit]
    next_cursor = (
        encode_cursor(page[-1]["event_at"], page[-1]["event_key"]) if len(rows) > limit else None
    )
    return FeedResponse(
        bioguide_id=bioguide,
        items=[FeedItem(**{k: row[k] for k in FeedItem.model_fields}) for row in page],
        next_cursor=next_cursor,
        sources=_sources(page),
    )


@router.get("/votes", response_model=VotesResponse, summary="Recent roll calls with position")
def member_votes(
    bioguide: str,
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=500)] = 20,
) -> VotesResponse:
    _summary(session, bioguide)
    rows = session.execute(VOTES_SQL, {"bioguide": bioguide, "limit": limit}).mappings().all()
    return VotesResponse(
        bioguide_id=bioguide,
        items=[VoteItem(**{k: row[k] for k in VoteItem.model_fields}) for row in rows],
        sources=_sources(rows),
    )


@router.get("/bills", response_model=BillsResponse, summary="Sponsored or cosponsored bills")
def member_bills(
    bioguide: str,
    session: Annotated[Session, Depends(get_session)],
    role: Annotated[str | None, Query(pattern="^(sponsor|cosponsor)$")] = None,
) -> BillsResponse:
    _summary(session, bioguide)
    rows = session.execute(BILLS_SQL, {"bioguide": bioguide, "role": role}).mappings().all()
    return BillsResponse(
        bioguide_id=bioguide,
        role=role,
        items=[BillItem(**{k: row[k] for k in BillItem.model_fields}) for row in rows],
        sources=_sources(rows),
    )


@router.get("/committees", response_model=CommitteesResponse, summary="Committee assignments")
def member_committees(
    bioguide: str, session: Annotated[Session, Depends(get_session)]
) -> CommitteesResponse:
    _summary(session, bioguide)
    rows = [
        r for r in session.execute(COMMITTEES_SQL).mappings().all() if r["bioguide_id"] == bioguide
    ]
    items = [
        CommitteeAssignment(
            thomas_id=row["committee_thomas_id"],
            name=row["name"],
            chamber=row["chamber"],
            parent_thomas_id=row["parent_thomas_id"],
            parent_name=row["parent_name"],
            rank=row["rank"],
            title=row["title"],
        )
        for row in rows
    ]
    return CommitteesResponse(bioguide_id=bioguide, items=items, sources=_sources(rows))


@router.get("/key-dates", response_model=KeyDatesResponse, summary="Calendar events for the member")
def member_key_dates(
    bioguide: str, session: Annotated[Session, Depends(get_session)]
) -> KeyDatesResponse:
    summary = _summary(session, bioguide)
    rows = (
        session.execute(
            KEY_DATES_SQL,
            {"bioguide": bioguide, "chamber": summary["chamber"], "state": summary["state_abbr"]},
        )
        .mappings()
        .all()
    )
    return KeyDatesResponse(
        bioguide_id=bioguide,
        items=[KeyDate(**{k: row[k] for k in KeyDate.model_fields}) for row in rows],
        sources=_sources(rows),
    )


def race_label(chamber: str, state_abbr: str, state_name: str | None, district: int | None) -> str:
    """The contested seat: "CA-6", "AK (At Large)", or the state name for a Senate race."""
    if chamber == "senate":
        return state_name or state_abbr
    if district == 0:
        return f"{state_abbr} (At Large)"
    return f"{state_abbr}-{district}"


def _election_candidate(row: Any, prefix: str) -> ElectionCandidate | None:
    if row[f"{prefix}_name"] is None:
        return None
    return ElectionCandidate(
        name=row[f"{prefix}_name"],
        party=row[f"{prefix}_party"],
        party_lines=list(row[f"{prefix}_party_lines"] or []),
        votes=row[f"{prefix}_votes"],
        pct=row[f"{prefix}_pct"],
    )


def _prior_election(row: Any) -> PriorElection | None:
    winner = _election_candidate(row, "winner")
    if row["status"] not in ("found", "uncontested") or winner is None:
        return None
    return PriorElection(
        election_year=row["election_year"],
        election_date=row["election_date"],
        special=row["special"],
        seat_label=race_label(
            row["chamber"], row["state_abbr"], row["state_name"], row["district"]
        ),
        winner=winner,
        runner_up=_election_candidate(row, "runner_up"),
        margin_votes=row["margin_votes"],
        margin_pct=row["margin_pct"],
        candidates=row["candidates"],
        valid_votes=row["valid_votes"],
        blank_votes=row["blank_votes"],
        over_votes=row["over_votes"],
        mixed_votes=row["mixed_votes"],
        source_url=row["source_url"],
        dataset_url=row["dataset_url"],
        dataset_version=row["dataset_version"],
    )


@router.get(
    "/election",
    response_model=ElectionResponse,
    summary="Next election for the seat, the opponent when known, and the prior result",
)
def member_election(
    bioguide: str, session: Annotated[Session, Depends(get_session)]
) -> ElectionResponse:
    _summary(session, bioguide)
    row = session.execute(NEXT_ELECTION_SQL, {"bioguide": bioguide}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"No election row for bioguide id {bioguide}")
    prior_row = session.execute(PRIOR_ELECTION_SQL, {"bioguide": bioguide}).mappings().first()
    today = datetime.now(UTC).date()

    sources = [
        SourceRef(source=row["source"], source_url=row["source_url"], fetched_at=row["fetched_at"])
    ]
    opponent = None
    if row["opponent_status"] == "confirmed":
        opponent = Opponent(
            name=row["opponent_name"],
            party=row["opponent_party"],
            fec_candidate_id=row["opponent_fec_candidate_id"],
            fec_url=row["opponent_fec_url"],
            source_url=row["opponent_source_url"],
            verified_on=row["opponent_verified_on"],
            note=row["opponent_note"],
        )
        sources.append(
            SourceRef(
                source="race_nominees_seed",
                source_url=row["opponent_source_url"],
                fetched_at=datetime.combine(row["opponent_verified_on"], time(), UTC),
            )
        )
    prior = _prior_election(prior_row) if prior_row is not None else None
    if prior_row is not None and prior is not None:
        sources.append(
            SourceRef(
                source=prior_row["source"],
                source_url=prior_row["source_url"],
                fetched_at=prior_row["fetched_at"],
            )
        )

    return ElectionResponse(
        bioguide_id=bioguide,
        next=NextElection(
            election_date=row["election_date"],
            election_year=row["election_year"],
            cycle=row["cycle"],
            on_ballot_this_cycle=row["on_ballot_this_cycle"],
            days_away=(row["election_date"] - today).days,
            race_label=race_label(
                row["chamber"], row["state_abbr"], row["state_name"], row["race_district"]
            ),
            seat_label=race_label(
                row["chamber"], row["state_abbr"], row["state_name"], row["seat_district"]
            ),
            race_differs_from_seat=bool(row["race_differs_from_seat"]),
            date_source_url=row["election_date_source_url"],
        ),
        opponent_status=row["opponent_status"],
        opponent=opponent,
        prior_status=prior_row["status"] if prior_row is not None else "no_contest",
        prior=prior,
        sources=sorted(sources, key=lambda s: s.source_url),
    )


RECEIPT_SOURCES = (
    "individual_small",
    "individual_large",
    "individual",
    "pac",
    "party",
    "self_funding",
    "transfers",
    "other",
)
RECEIPT_AMOUNT_COLUMN = {"individual": "individual_total"}


@router.get(
    "/fundraising",
    response_model=FundraisingResponse,
    summary="Principal campaign committee totals for the current cycle",
)
def member_fundraising(
    bioguide: str, session: Annotated[Session, Depends(get_session)]
) -> FundraisingResponse:
    _summary(session, bioguide)
    row = session.execute(FUNDRAISING_SQL, {"bioguide": bioguide}).mappings().first()
    if row is None:
        raise HTTPException(
            status_code=404, detail=f"No fundraising row for bioguide id {bioguide}"
        )
    filed = row["status"] == "filed"
    return FundraisingResponse(
        bioguide_id=bioguide,
        cycle=row["cycle"],
        status=row["status"],
        candidate=(
            FecCandidateRef(
                candidate_id=row["candidate_id"],
                name=row["candidate_name"],
                fec_url=row["candidate_fec_url"],
            )
            if row["candidate_id"]
            else None
        ),
        committee=(
            FecCommitteeRef(
                committee_id=row["committee_id"],
                name=row["committee_name"],
                fec_url=row["committee_fec_url"],
            )
            if row["committee_id"]
            else None
        ),
        coverage=(
            FundraisingCoverage(
                start_date=row["coverage_start_date"],
                end_date=row["coverage_end_date"],
                last_report_type=row["last_report_type"],
                last_report_year=row["last_report_year"],
            )
            if filed
            else None
        ),
        totals=(
            FundraisingTotals(
                raised=row["raised"],
                spent=row["spent"],
                cash_on_hand=row["cash_on_hand"],
                debts=row["debts"],
            )
            if filed
            else None
        ),
        receipts=(
            ReceiptBreakdown(
                **{
                    name: ReceiptSource(
                        amount=row[RECEIPT_AMOUNT_COLUMN.get(name, name)], pct=row[f"{name}_pct"]
                    )
                    for name in RECEIPT_SOURCES
                }
            )
            if filed
            else None
        ),
        small_donor_pct=row["small_donor_pct"],
        small_donor_of_individual_pct=row["small_donor_of_individual_pct"],
        sources=_sources([row]),
    )
