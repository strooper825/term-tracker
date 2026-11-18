"""/api/v1/states: state governments, their governors and legislatures (ADR 0035).

Every figure is a mart column (state_government, state_chamber, state_chamber_party,
state_seat_holder), all describing one day: today for the live site, a fixed day for an archived
build. This router selects and reshapes rows and does no arithmetic.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.db import get_session
from api.provenance import distinct_sources
from api.schemas.states import (
    Chamber,
    CommitteeSeat,
    District,
    Governor,
    Legislator,
    LegislatorProfile,
    Office,
    PartySeats,
    RosterChamber,
    Social,
    StateDetail,
    StateRoster,
    StatesResponse,
    StateSummary,
    Term,
)

router = APIRouter(prefix="/states", tags=["states"])

GOVERNMENT_SQL = """
    SELECT state, state_name, legislature_name, control, by_registration, as_of, executive_title,
           governor_person_id, governor_name, governor_party, governor_party_label,
           governor_image_url, governor_website_url, governor_start_date,
           'openstates_people' AS source, source_url, fetched_at
    FROM mart.state_government
"""

CHAMBER_SQL = """
    SELECT state, chamber, chamber_name, title, seats, republican, democratic, other, nonpartisan,
           vacant, majority_seats, supermajority_seats, supermajority_numerator,
           supermajority_denominator, supermajority_basis, control_party, control_group,
           control_kind, control_note, by_registration, chamber_slug
    FROM mart.state_chamber
"""

PARTY_SQL = """
    SELECT state, chamber, party, party_group, seats
    FROM mart.state_chamber_party
"""

LEGISLATOR_SQL = text(
    """
    SELECT person_id, chamber, district, shape, district_seats, district_note, name, party,
           party_label, image_url, email, website_url, family_name
    FROM mart.state_seat_holder
    WHERE state = :state AND is_seated
    ORDER BY chamber, district, family_name NULLS LAST, name
    """
)

DISTRICT_SQL = text(
    """
    SELECT chamber, district, seats, nullif(shape, '') AS shape, nullif(note, '') AS note
    FROM seed.state_districts
    WHERE state = :state
    ORDER BY chamber, district
    """
)

PROFILE_SQL = text(
    """
    SELECT person_id, chamber, district, district_note, name, family_name, party, party_group,
           party_label, party_basis, image_url, email, website_url, capitol_address,
           capitol_phone, district_address, district_phone, twitter, facebook, instagram, youtube
    FROM mart.state_seat_holder
    WHERE state = :state AND is_seated
    """
)

TERM_SQL = text(
    """
    SELECT person_id, chamber, chamber_name, district, start_date, end_date
    FROM mart.state_legislator_term
    WHERE state = :state
    ORDER BY person_id, term_order
    """
)

COMMITTEE_SQL = text(
    """
    SELECT person_id, committee_name, committee_chamber, role
    FROM mart.state_committee_member
    WHERE state = :state
    ORDER BY person_id, committee_order
    """
)


def _district_key(district: str) -> tuple:
    """Districts in natural order: 2 before 10, "Hillsborough 2" before "Hillsborough 10"."""
    return tuple(
        (0, int(part), "") if part.isdigit() else (1, 0, part.lower())
        for part in re.split(r"(\d+)", district)
        if part
    )


def _office(address: str | None, phone: str | None) -> Office | None:
    return Office(address=address, phone=phone) if address or phone else None


# The bar reads left to right: Democrats, other parties, independents, nonpartisan, Republicans.
PARTY_ORDER = {"D": 0, "I": 1, "N": 2, "R": 3}


def _chamber(row: Any, parties: list[Any]) -> Chamber:
    return Chamber(
        chamber=row["chamber"],
        name=row["chamber_name"],
        slug=row["chamber_slug"],
        title=row["title"],
        seats=row["seats"],
        republican=row["republican"],
        democratic=row["democratic"],
        other=row["other"],
        nonpartisan=row["nonpartisan"],
        vacant=row["vacant"],
        majority_seats=row["majority_seats"],
        supermajority_seats=row["supermajority_seats"],
        supermajority_fraction=f"{row['supermajority_numerator']}/{row['supermajority_denominator']}",
        supermajority_basis=row["supermajority_basis"],
        control_party=row["control_party"],
        control_group=row["control_group"],
        control_kind=row["control_kind"],
        control_note=row["control_note"],
        by_registration=row["by_registration"],
        parties=[
            PartySeats(party=p["party"], party_group=p["party_group"], seats=p["seats"])
            for p in sorted(
                parties,
                key=lambda p: (
                    PARTY_ORDER.get(p["party"], 1),
                    p["party_group"] == "Independent",
                    -p["seats"],
                    p["party_group"],
                ),
            )
        ],
    )


def _summaries(session: Session, state: str | None = None) -> tuple[list[Any], list[StateSummary]]:
    where = " WHERE state = :state" if state else ""
    params = {"state": state} if state else {}
    governments = (
        session.execute(text(GOVERNMENT_SQL + where + " ORDER BY state_name"), params)
        .mappings()
        .all()
    )
    chambers = (
        session.execute(text(CHAMBER_SQL + where + " ORDER BY state, chamber_order"), params)
        .mappings()
        .all()
    )
    parties = session.execute(text(PARTY_SQL + where), params).mappings().all()

    parties_by: dict[tuple[str, str], list[Any]] = defaultdict(list)
    for p in parties:
        parties_by[(p["state"], p["chamber"])].append(p)
    chambers_by: dict[str, list[Chamber]] = defaultdict(list)
    for c in chambers:
        chambers_by[c["state"]].append(_chamber(c, parties_by[(c["state"], c["chamber"])]))

    summaries = []
    for g in governments:
        governor = None
        if g["governor_person_id"]:
            governor = Governor(
                person_id=g["governor_person_id"],
                name=g["governor_name"],
                title=g["executive_title"],
                party=g["governor_party"],
                party_label=g["governor_party_label"],
                image_url=g["governor_image_url"],
                website_url=g["governor_website_url"],
                start_date=g["governor_start_date"],
            )
        summaries.append(
            StateSummary(
                state=g["state"],
                name=g["state_name"],
                control=g["control"],
                by_registration=g["by_registration"],
                governor=governor,
                chambers=chambers_by[g["state"]],
            )
        )
    return governments, summaries


@router.get(
    "",
    response_model=StatesResponse,
    summary="Every state's government: governor, chambers, and who controls them",
)
def states(session: Annotated[Session, Depends(get_session)]) -> StatesResponse:
    """The 50 states, DC and Puerto Rico, for the national control map (ADR 0035)."""
    governments, summaries = _summaries(session)
    if not governments:
        raise HTTPException(status_code=503, detail="The state marts are empty.")
    return StatesResponse(
        as_of=governments[0]["as_of"],
        states=summaries,
        generated_at=datetime.now(UTC),
        sources=distinct_sources(governments),
    )


@router.get(
    "/{state}",
    response_model=StateDetail,
    summary="One state's government and every legislator in it",
)
def state_detail(state: str, session: Annotated[Session, Depends(get_session)]) -> StateDetail:
    abbr = state.upper()
    governments, summaries = _summaries(session, abbr)
    if not governments:
        raise HTTPException(status_code=404, detail=f"No state {state!r}.")
    rows = session.execute(LEGISLATOR_SQL, {"state": abbr}).mappings().all()
    districts = session.execute(DISTRICT_SQL, {"state": abbr}).mappings().all()
    return StateDetail(
        as_of=governments[0]["as_of"],
        state=summaries[0],
        legislature_name=governments[0]["legislature_name"],
        districts=[District(**d) for d in districts],
        legislators=[Legislator(**{k: r[k] for k in Legislator.model_fields}) for r in rows],
        generated_at=datetime.now(UTC),
        sources=distinct_sources(governments),
    )


@router.get(
    "/{state}/legislators",
    response_model=StateRoster,
    summary="Every seated legislator in one state, with contact details, terms and committees",
)
def state_roster(state: str, session: Annotated[Session, Depends(get_session)]) -> StateRoster:
    """The roster pages, one per chamber (ADR 0035). Legislators are in district order."""
    abbr = state.upper()
    governments, summaries = _summaries(session, abbr)
    if not governments:
        raise HTTPException(status_code=404, detail=f"No state {state!r}.")
    people = session.execute(PROFILE_SQL, {"state": abbr}).mappings().all()
    terms: dict[str, list[Term]] = defaultdict(list)
    for t in session.execute(TERM_SQL, {"state": abbr}).mappings():
        terms[t["person_id"]].append(
            Term(
                chamber=t["chamber"],
                chamber_name=t["chamber_name"],
                district=t["district"],
                start_date=t["start_date"],
                end_date=t["end_date"],
            )
        )
    committees: dict[str, list[CommitteeSeat]] = defaultdict(list)
    for c in session.execute(COMMITTEE_SQL, {"state": abbr}).mappings():
        committees[c["person_id"]].append(
            CommitteeSeat(name=c["committee_name"], chamber=c["committee_chamber"], role=c["role"])
        )
    by_chamber: dict[str, list[LegislatorProfile]] = defaultdict(list)
    for p in sorted(
        people, key=lambda p: (_district_key(p["district"]), p["family_name"] or "", p["name"])
    ):
        by_chamber[p["chamber"]].append(
            LegislatorProfile(
                person_id=p["person_id"],
                district=p["district"],
                district_note=p["district_note"],
                name=p["name"],
                family_name=p["family_name"],
                party=p["party"],
                party_group=p["party_group"],
                party_label=p["party_label"],
                party_basis=p["party_basis"],
                image_url=p["image_url"],
                email=p["email"],
                website_url=p["website_url"],
                capitol_office=_office(p["capitol_address"], p["capitol_phone"]),
                district_office=_office(p["district_address"], p["district_phone"]),
                social=Social(
                    twitter=p["twitter"],
                    facebook=p["facebook"],
                    instagram=p["instagram"],
                    youtube=p["youtube"],
                ),
                terms=terms[p["person_id"]],
                committees=committees[p["person_id"]],
            )
        )
    summary = summaries[0]
    return StateRoster(
        as_of=governments[0]["as_of"],
        state=summary.state,
        name=summary.name,
        legislature_name=governments[0]["legislature_name"],
        chambers=[
            RosterChamber(
                chamber=c.chamber,
                slug=c.slug,
                name=c.name,
                title=c.title,
                seats=c.seats,
                vacant=c.vacant,
                legislators=by_chamber[c.chamber],
            )
            for c in summary.chambers
        ],
        generated_at=datetime.now(UTC),
        sources=distinct_sources(governments),
    )
