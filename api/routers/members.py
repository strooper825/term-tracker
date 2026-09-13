"""/api/v1/members: tracked members with seat, current term, and committee assignments."""

from __future__ import annotations

from collections import defaultdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.db import get_session
from api.schemas.members import (
    CommitteeAssignment,
    MemberIds,
    MemberName,
    MembersResponse,
    MemberSummary,
    Seat,
    SourceRef,
    TermInfo,
)

router = APIRouter(prefix="/members", tags=["members"])

# Each tracked member with their most recent term overlapping the current Congress.
MEMBERS_SQL = text(
    """
    SELECT m.bioguide_id, m.first_name, m.middle_name, m.last_name, m.nickname, m.suffix,
           m.official_full_name, m.govtrack_id, m.icpsr_id, m.lis_id, m.fec_ids,
           m.opensecrets_id, m.wikipedia_id, m.ballotpedia_id, m.cspan_id, m.votesmart_id,
           m.wikidata_id, m.photo_url, m.source, m.source_url, m.fetched_at,
           t.congress, t.chamber, t.start_date, t.end_date, t.state_abbr, t.state_name,
           t.fips_state, t.district, t.senate_class, t.party, t.caucus, t.state_rank
    FROM mart.member AS m
    JOIN LATERAL (
        SELECT * FROM mart.term AS t
        WHERE t.bioguide_id = m.bioguide_id
        ORDER BY t.start_date DESC
        LIMIT 1
    ) AS t ON true
    ORDER BY m.last_name, m.first_name, m.bioguide_id
    """
)

COMMITTEES_SQL = text(
    """
    SELECT cm.bioguide_id, cm.committee_thomas_id, cm.rank, cm.title,
           cm.source, cm.source_url, cm.fetched_at,
           c.name, c.chamber, c.parent_thomas_id, p.name AS parent_name,
           c.source AS committee_source, c.source_url AS committee_source_url,
           c.fetched_at AS committee_fetched_at
    FROM mart.committee_membership AS cm
    JOIN mart.committee AS c ON c.thomas_id = cm.committee_thomas_id
    LEFT JOIN mart.committee AS p ON p.thomas_id = c.parent_thomas_id
    ORDER BY cm.bioguide_id, coalesce(c.parent_thomas_id, c.thomas_id),
             c.parent_thomas_id NULLS FIRST, c.thomas_id
    """
)


def seat_label(row: Any) -> str:
    if row["chamber"] == "senate":
        state = row["state_name"] or row["state_abbr"]
        return f"{state} (Class {row['senate_class']})" if row["senate_class"] else state
    if row["district"] == 0:
        return f"{row['state_abbr']} (At Large)"
    return f"{row['state_abbr']}-{row['district']}"


def member_ids(row: Any) -> MemberIds:
    return MemberIds(
        govtrack=row["govtrack_id"],
        icpsr=row["icpsr_id"],
        fec=list(row["fec_ids"] or []),
        lis=row["lis_id"],
        opensecrets=row["opensecrets_id"],
        wikipedia=row["wikipedia_id"],
        ballotpedia=row["ballotpedia_id"],
        cspan=row["cspan_id"],
        votesmart=row["votesmart_id"],
        wikidata=row["wikidata_id"],
    )


def _add_source(
    sources: dict[tuple[str, str], SourceRef], source: str, source_url: str, fetched_at: Any
) -> None:
    sources.setdefault(
        (source, source_url), SourceRef(source=source, source_url=source_url, fetched_at=fetched_at)
    )


@router.get(
    "",
    response_model=MembersResponse,
    summary="Tracked members with seat, term, and committee assignments",
)
def list_members(session: Annotated[Session, Depends(get_session)]) -> MembersResponse:
    member_rows = session.execute(MEMBERS_SQL).mappings().all()
    committee_rows = session.execute(COMMITTEES_SQL).mappings().all()

    committees: dict[str, list[CommitteeAssignment]] = defaultdict(list)
    sources: dict[tuple[str, str], SourceRef] = {}
    for row in committee_rows:
        committees[row["bioguide_id"]].append(
            CommitteeAssignment(
                thomas_id=row["committee_thomas_id"],
                name=row["name"],
                chamber=row["chamber"],
                parent_thomas_id=row["parent_thomas_id"],
                parent_name=row["parent_name"],
                rank=row["rank"],
                title=row["title"],
            )
        )
        _add_source(sources, row["source"], row["source_url"], row["fetched_at"])
        _add_source(
            sources,
            row["committee_source"],
            row["committee_source_url"],
            row["committee_fetched_at"],
        )

    members: list[MemberSummary] = []
    for row in member_rows:
        _add_source(sources, row["source"], row["source_url"], row["fetched_at"])
        members.append(
            MemberSummary(
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
                term=TermInfo(
                    congress=row["congress"],
                    start_date=row["start_date"],
                    end_date=row["end_date"],
                    party=row["party"],
                ),
                photo_url=row["photo_url"],
                ids=member_ids(row),
                committees=committees.get(row["bioguide_id"], []),
            )
        )

    return MembersResponse(
        members=members, sources=sorted(sources.values(), key=lambda s: s.source_url)
    )
