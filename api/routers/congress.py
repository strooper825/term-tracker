"""/api/v1/congress: the Congress overview page (chamber composition, legislative activity, and
the bills that passed both chambers).

Every figure is a mart column (docs/adr/0012, 0013); this router selects and reshapes rows and
does no arithmetic. Composition covers all 535 seats and is hand-maintained; every count and
the passed-both table cover every bill in the database, whoever sponsored it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.db import get_session
from api.schemas.congress import (
    Activity,
    ChamberComposition,
    Composition,
    OverviewResponse,
    PartyGroup,
    PassedBoth,
    PassedBothItem,
)
from api.schemas.members import SourceRef

router = APIRouter(prefix="/congress", tags=["congress"])

MAJORITY_SQL = text(
    """
    SELECT chamber, chamber_seats, seated, vacant, congress_seats, congress_seated,
           congress_vacant, majority_threshold, tiebreak_letter, majority_pct,
           republican_caucus, democratic_caucus,
           majority_party, majority_letter, majority_margin, as_of, source, source_url, fetched_at
    FROM mart.chamber_majority
    ORDER BY CASE chamber WHEN 'house' THEN 1 ELSE 2 END
    """
)

GROUPS_SQL = text(
    """
    SELECT chamber, party_group, party_label, seats, seat_pct, caucus_with
    FROM mart.chamber_composition
    ORDER BY chamber, sort_order
    """
)

OVERVIEW_SQL = text("SELECT * FROM mart.congress_overview")

PASSED_BOTH_SQL = text(
    """
    SELECT congress, bill_type, bill_number, label, title, outcome, public_law_number,
           outcome_date, house_yea, house_nay, senate_yea, senate_nay, congress_gov_url
    FROM mart.congress_bill_outcome
    WHERE passed_both_chambers
    ORDER BY outcome_date DESC NULLS LAST, label
    """
)

ACTIVITY_FIELDS = tuple(Activity.model_fields)


def _source(row: Any) -> SourceRef:
    return SourceRef(
        source=row["source"], source_url=row["source_url"], fetched_at=row["fetched_at"]
    )


@router.get(
    "/overview",
    response_model=OverviewResponse,
    summary="Chamber composition and the tracked members' legislative activity",
)
def overview(session: Annotated[Session, Depends(get_session)]) -> OverviewResponse:
    majority = session.execute(MAJORITY_SQL).mappings().all()
    stats = session.execute(OVERVIEW_SQL).mappings().first()
    if not majority or stats is None:
        raise HTTPException(status_code=503, detail="The Congress overview marts are empty.")
    groups = session.execute(GROUPS_SQL).mappings().all()
    passed = session.execute(PASSED_BOTH_SQL).mappings().all()

    chambers = [
        ChamberComposition(
            chamber=row["chamber"],
            seats=row["chamber_seats"],
            seated=row["seated"],
            vacant=row["vacant"],
            majority_threshold=row["majority_threshold"],
            tiebreak_letter=row["tiebreak_letter"],
            majority_pct=row["majority_pct"],
            republican_caucus=row["republican_caucus"],
            democratic_caucus=row["democratic_caucus"],
            majority_party=row["majority_party"],
            majority_letter=row["majority_letter"],
            majority_margin=row["majority_margin"],
            groups=[
                PartyGroup(
                    party_group=g["party_group"],
                    label=g["party_label"],
                    seats=g["seats"],
                    seat_pct=g["seat_pct"],
                    caucus_with=g["caucus_with"],
                )
                for g in groups
                if g["chamber"] == row["chamber"]
            ],
            source_url=row["source_url"],
        )
        for row in majority
    ]
    first = majority[0]
    return OverviewResponse(
        congress=stats["congress"],
        congress_start=stats["congress_start"],
        congress_end=stats["congress_end"],
        composition=Composition(
            as_of=first["as_of"],
            seats=first["congress_seats"],
            seated=first["congress_seated"],
            vacant=first["congress_vacant"],
            chambers=chambers,
        ),
        activity=Activity(**{k: stats[k] for k in ACTIVITY_FIELDS}),
        passed_both=PassedBoth(
            total=stats["passed_both"],
            enacted=stats["passed_both_enacted"],
            adopted=stats["passed_both_adopted"],
            vetoed=stats["passed_both_vetoed"],
            items=[
                PassedBothItem(**{k: p[k] for k in PassedBothItem.model_fields}) for p in passed
            ],
        ),
        generated_at=datetime.now(UTC),
        sources=[_source(first), _source(stats)],
    )
