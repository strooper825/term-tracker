"""/api/v1/bills: the bill detail pages and the list of bills that have one.

Scope is mart.bill: every bill or amendment a tracked member sponsored or cosponsored, plus
every bill a loaded roll call references. This is not a search over all legislation in the
Congress; that is an open item in docs/PLAN.md section 12.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.db import get_session
from api.provenance import distinct_sources
from api.schemas.bill import (
    BillAction,
    BillCosponsor,
    BillDetail,
    BillListItem,
    BillListResponse,
    BillRollCall,
    BillSponsor,
    BillSummaryVersion,
    CosponsorCounts,
    JourneyStage,
    PartySplit,
    PassageVote,
    TrackedPosition,
)

router = APIRouter(prefix="/bills", tags=["bills"])

BILL_COLUMNS = """
    congress, bill_type, bill_number, label, kind, title, policy_area, introduced_date,
    latest_action_date, latest_action_text, sponsor_bioguide_id, sponsor_name,
    sponsor_full_name, sponsor_party, sponsor_state, sponsor_district, sponsor_is_tracked,
    cosponsor_count, cosponsors_democratic, cosponsors_republican, cosponsors_other,
    cosponsors_withdrawn, action_count, summary_count, has_summary, roll_call_count,
    congress_gov_url, source, source_url, fetched_at
"""

LIST_SQL = text(
    f"""
    SELECT {BILL_COLUMNS}
    FROM mart.bill
    ORDER BY congress DESC, bill_type, length(bill_number), bill_number
    LIMIT :limit OFFSET :offset
    """
)

COUNT_SQL = text("SELECT count(*) FROM mart.bill")

DETAIL_SQL = text(
    f"""
    SELECT {BILL_COLUMNS}, amended_bill_congress, amended_bill_type, amended_bill_number,
           update_date
    FROM mart.bill
    WHERE congress = :congress AND bill_type = :bill_type AND bill_number = :bill_number
    """
)

SUMMARIES_SQL = text(
    """
    SELECT version_code, action_date, action_desc, text_html, text_length, update_date,
           is_latest, source, source_url, fetched_at
    FROM mart.bill_summary
    WHERE congress = :congress AND bill_type = :bill_type AND bill_number = :bill_number
    ORDER BY action_date DESC, seq DESC
    """
)

COSPONSORS_SQL = text(
    """
    SELECT bioguide_id, display_name, full_name, party, state, district, sponsorship_date,
           is_original_cosponsor, withdrawn_date, is_withdrawn, is_tracked_member,
           source, source_url, fetched_at
    FROM mart.bill_cosponsor
    WHERE congress = :congress AND bill_type = :bill_type AND bill_number = :bill_number
    ORDER BY sponsorship_date, display_name
    """
)

ACTIONS_SQL = text(
    """
    SELECT action_date, action_time, action_code, action_text, action_type, source_system,
           source, source_url, fetched_at
    FROM mart.bill_action
    WHERE congress = :congress AND bill_type = :bill_type AND bill_number = :bill_number
    ORDER BY action_date DESC, action_seq DESC
    """
)

ROLL_CALLS_SQL = text(
    """
    SELECT chamber, session, roll_number, voted_at, vote_date, question, result,
           yea_total, nay_total, present_total, not_voting_total, source, source_url, fetched_at
    FROM mart.roll_call
    WHERE congress = :congress AND bill_type = :bill_type AND bill_number = :bill_number
    ORDER BY voted_at DESC NULLS LAST, session DESC, roll_number DESC
    """
)

# The shown stages of the vote journey, each with its passage roll call when it has one (ADR 0009).
JOURNEY_SQL = text(
    """
    SELECT j.stage_key, j.stage_label, j.stage_order, j.status, j.status_label, j.event_date,
           j.detail, j.ends_journey,
           v.chamber, v.session, v.roll_number, v.vote_date, v.question, v.result, v.passed,
           v.majority_label, v.yea_total, v.nay_total, v.present_total, v.not_voting_total,
           v.yea_pct, v.nay_pct,
           v.yea_republican, v.nay_republican, v.yea_republican_pct, v.nay_republican_pct,
           v.yea_democratic, v.nay_democratic, v.yea_democratic_pct, v.nay_democratic_pct,
           v.yea_independent, v.nay_independent, v.yea_independent_pct, v.nay_independent_pct,
           v.yea_other, v.nay_other, v.yea_other_pct, v.nay_other_pct,
           v.source_url AS vote_source_url
    FROM mart.bill_journey_stage AS j
    LEFT JOIN mart.bill_passage_vote AS v
      ON v.congress = j.congress AND v.bill_type = j.bill_type AND v.bill_number = j.bill_number
     AND v.chamber = j.vote_chamber AND v.session = j.vote_session
     AND v.roll_number = j.vote_roll_number
    WHERE j.congress = :congress AND j.bill_type = :bill_type AND j.bill_number = :bill_number
      AND j.is_shown
    ORDER BY j.stage_order
    """
)

PARTY_COLUMNS = (("R", "republican"), ("D", "democratic"), ("I", "independent"), ("Other", "other"))

# Tracked-member positions on every roll call for this bill, with the member's display name.
POSITIONS_SQL = text(
    """
    SELECT v.chamber, v.session, v.roll_number, v.bioguide_id, v.position,
           m.official_full_name, m.party
    FROM mart.member_vote AS v
    JOIN mart.roll_call AS r
      ON r.congress = v.congress AND r.chamber = v.chamber
     AND r.session = v.session AND r.roll_number = v.roll_number
    JOIN mart.member_summary AS m ON m.bioguide_id = v.bioguide_id
    WHERE r.congress = :congress AND r.bill_type = :bill_type AND r.bill_number = :bill_number
    ORDER BY m.last_name, m.official_full_name
    """
)


def _sponsor(row: Any) -> BillSponsor:
    return BillSponsor(
        bioguide_id=row["sponsor_bioguide_id"],
        name=row["sponsor_name"],
        full_name=row["sponsor_full_name"],
        party=row["sponsor_party"],
        state=row["sponsor_state"],
        district=row["sponsor_district"],
        is_tracked=row["sponsor_is_tracked"],
    )


def _counts(row: Any) -> CosponsorCounts:
    return CosponsorCounts(
        total=row["cosponsor_count"],
        democratic=row["cosponsors_democratic"],
        republican=row["cosponsors_republican"],
        other=row["cosponsors_other"],
        withdrawn=row["cosponsors_withdrawn"],
    )


def _journey_stage(row: Any) -> JourneyStage:
    vote = None
    if row["roll_number"] is not None:
        vote = PassageVote(
            chamber=row["chamber"],
            session=row["session"],
            roll_number=row["roll_number"],
            vote_date=row["vote_date"],
            question=row["question"],
            result=row["result"],
            passed=row["passed"],
            majority_label=row["majority_label"],
            yea_total=row["yea_total"],
            nay_total=row["nay_total"],
            present_total=row["present_total"],
            not_voting_total=row["not_voting_total"],
            yea_pct=row["yea_pct"],
            nay_pct=row["nay_pct"],
            parties=[
                PartySplit(
                    party=letter,
                    yea=row[f"yea_{name}"],
                    nay=row[f"nay_{name}"],
                    yea_pct=row[f"yea_{name}_pct"],
                    nay_pct=row[f"nay_{name}_pct"],
                )
                for letter, name in PARTY_COLUMNS
                if row[f"yea_{name}"] or row[f"nay_{name}"]
            ],
            source_url=row["vote_source_url"],
        )
    return JourneyStage(
        stage_key=row["stage_key"],
        label=row["stage_label"],
        order=row["stage_order"],
        status=row["status"],
        status_label=row["status_label"],
        date=row["event_date"],
        detail=row["detail"],
        ends_journey=row["ends_journey"],
        vote=vote,
    )


def _list_fields(row: Any) -> dict[str, Any]:
    return {
        "congress": row["congress"],
        "bill_type": row["bill_type"],
        "bill_number": row["bill_number"],
        "label": row["label"],
        "kind": row["kind"],
        "title": row["title"],
        "policy_area": row["policy_area"],
        "introduced_date": row["introduced_date"],
        "latest_action_date": row["latest_action_date"],
        "latest_action_text": row["latest_action_text"],
        "sponsor": _sponsor(row),
        "cosponsors": _counts(row),
        "action_count": row["action_count"],
        "summary_count": row["summary_count"],
        "has_summary": row["has_summary"],
        "roll_call_count": row["roll_call_count"],
        "congress_gov_url": row["congress_gov_url"],
    }


@router.get("", response_model=BillListResponse, summary="Bills and amendments with a detail page")
def list_bills(
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=2000)] = 500,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> BillListResponse:
    rows = session.execute(LIST_SQL, {"limit": limit, "offset": offset}).mappings().all()
    total = session.execute(COUNT_SQL).scalar_one()
    return BillListResponse(
        items=[BillListItem(**_list_fields(row)) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
        sources=distinct_sources(rows),
    )


@router.get(
    "/{congress}/{bill_type}/{bill_number}",
    response_model=BillDetail,
    summary="One bill: summary, cosponsors, actions, and roll calls",
)
def bill_detail(
    congress: int,
    bill_type: str,
    bill_number: str,
    session: Annotated[Session, Depends(get_session)],
) -> BillDetail:
    params = {
        "congress": congress,
        "bill_type": bill_type.lower(),
        "bill_number": bill_number,
    }
    row = session.execute(DETAIL_SQL, params).mappings().first()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No bill {bill_type.upper()} {bill_number} in Congress {congress}. This site "
                "covers legislation the tracked members sponsored or cosponsored and every "
                "bill a recorded roll call names."
            ),
        )
    summaries = session.execute(SUMMARIES_SQL, params).mappings().all()
    cosponsors = session.execute(COSPONSORS_SQL, params).mappings().all()
    actions = session.execute(ACTIONS_SQL, params).mappings().all()
    calls = session.execute(ROLL_CALLS_SQL, params).mappings().all()
    positions = session.execute(POSITIONS_SQL, params).mappings().all()
    journey = session.execute(JOURNEY_SQL, params).mappings().all()

    by_call: dict[tuple[str, int, int], list[TrackedPosition]] = defaultdict(list)
    for p in positions:
        by_call[(p["chamber"], p["session"], p["roll_number"])].append(
            TrackedPosition(
                bioguide_id=p["bioguide_id"],
                name=p["official_full_name"],
                party=p["party"],
                position=p["position"],
            )
        )

    versions = [
        BillSummaryVersion(**{k: s[k] for k in BillSummaryVersion.model_fields}) for s in summaries
    ]
    return BillDetail(
        **_list_fields(row),
        amended_bill_congress=row["amended_bill_congress"],
        amended_bill_type=row["amended_bill_type"],
        amended_bill_number=row["amended_bill_number"],
        update_date=row["update_date"],
        summary=next((v for v in versions if v.is_latest), None),
        summary_versions=versions,
        cosponsor_list=[
            BillCosponsor(
                bioguide_id=c["bioguide_id"],
                name=c["display_name"],
                full_name=c["full_name"],
                party=c["party"],
                state=c["state"],
                district=c["district"],
                date=c["sponsorship_date"],
                is_original_cosponsor=c["is_original_cosponsor"],
                withdrawn_date=c["withdrawn_date"],
                is_withdrawn=c["is_withdrawn"],
                is_tracked_member=c["is_tracked_member"],
            )
            for c in cosponsors
        ],
        actions=[BillAction(**{k: a[k] for k in BillAction.model_fields}) for a in actions],
        roll_calls=[
            BillRollCall(
                **{k: r[k] for k in BillRollCall.model_fields if k != "tracked_positions"},
                tracked_positions=by_call.get((r["chamber"], r["session"], r["roll_number"]), []),
            )
            for r in calls
        ],
        journey=[_journey_stage(j) for j in journey],
        sources=distinct_sources([row, *summaries, *cosponsors, *actions, *calls]),
    )
