"""End to end on fixtures: raw load -> dbt build -> mart.roll_call and mart.member_vote."""

from __future__ import annotations

import pytest
from sqlalchemy import Engine, text

pytestmark = [pytest.mark.integration, pytest.mark.dbt]


def _rows(engine: Engine, sql: str, **params) -> list[dict]:
    with engine.connect() as conn:
        return [dict(r) for r in conn.execute(text(sql), params).mappings()]


def test_roll_calls_from_both_chambers(built_mart: None, migrated_engine: Engine) -> None:
    rows = _rows(
        migrated_engine,
        "SELECT chamber, session, roll_number, vote_date, question, bill_type, bill_number, "
        "member_total FROM mart.roll_call WHERE congress = 119 "
        "ORDER BY chamber, session, roll_number",
    )
    keys = [(r["chamber"], r["session"], r["roll_number"]) for r in rows]
    assert ("house", 1, 2) in keys and ("house", 1, 240) in keys and ("house", 2, 1) in keys
    assert ("senate", 1, 1) in keys and ("senate", 2, 1) in keys
    senate_1 = next(
        r for r in rows if (r["chamber"], r["session"], r["roll_number"]) == ("senate", 1, 1)
    )
    assert str(senate_1["vote_date"]) == "2025-01-09"
    assert senate_1["question"] == "On Cloture on the Motion to Proceed S. 5"
    assert (senate_1["bill_type"], senate_1["bill_number"]) == ("s", "5")
    assert senate_1["member_total"] == 5  # trimmed fixture
    house_240 = next(
        r for r in rows if (r["chamber"], r["session"], r["roll_number"]) == ("house", 1, 240)
    )
    assert str(house_240["vote_date"]) == "2025-09-08"
    assert (house_240["bill_type"], house_240["bill_number"]) == ("hr", "3424")


def test_member_votes_are_tracked_members_with_normalised_positions(
    built_mart: None, migrated_engine: Engine
) -> None:
    rows = _rows(
        migrated_engine,
        "SELECT bioguide_id, chamber, session, roll_number, position, position_raw, voted "
        "FROM mart.member_vote WHERE congress = 119 ORDER BY 1, 2, 3, 4",
    )
    by_member: dict[str, list[dict]] = {}
    for r in rows:
        by_member.setdefault(r["bioguide_id"], []).append(r)
    assert set(by_member) == {"S001213", "C001095"}
    assert len(by_member["S001213"]) == 5 and len(by_member["C001095"]) == 3
    absent = next(r for r in by_member["S001213"] if (r["session"], r["roll_number"]) == (1, 353))
    assert (absent["position"], absent["voted"]) == ("Not Voting", False)

    speaker = next(r for r in by_member["S001213"] if (r["session"], r["roll_number"]) == (1, 2))
    assert (speaker["position"], speaker["position_raw"], speaker["voted"]) == (
        "Other",
        "Johnson (LA)",
        True,
    )
    recorded = next(r for r in by_member["S001213"] if (r["session"], r["roll_number"]) == (1, 122))
    assert recorded["position_raw"] in {"Aye", "No"} and recorded["position"] in {"Yea", "Nay"}
    for r in by_member["C001095"]:
        assert r["chamber"] == "senate" and r["position"] == r["position_raw"]
    assert sum(1 for r in by_member["C001095"] if not r["voted"]) == 1


def test_attendance_query_shape(built_mart: None, migrated_engine: Engine) -> None:
    rows = _rows(
        migrated_engine,
        """
        SELECT v.bioguide_id,
               count(*) AS positions,
               count(*) FILTER (WHERE v.voted) AS votes_cast,
               count(*) FILTER (WHERE NOT v.voted) AS not_voting
        FROM mart.member_vote AS v
        WHERE v.congress = 119
        GROUP BY 1 ORDER BY 1
        """,
    )
    assert {r["bioguide_id"]: r["positions"] for r in rows} == {"C001095": 3, "S001213": 5}
    steil = next(r for r in rows if r["bioguide_id"] == "S001213")
    assert (steil["votes_cast"], steil["not_voting"]) == (4, 1)
    assert all(r["votes_cast"] + r["not_voting"] == r["positions"] for r in rows)
