"""End to end on fixtures: raw load -> dbt build -> mart bill tables (Phase 1b data layer).

The bills API endpoints arrive in Phase 1d; here the mart is queried directly.
"""

from __future__ import annotations

import pytest
from sqlalchemy import Engine, text

from tests.fixtures.congress_gov import FIXTURE_BILLS_SQL

pytestmark = [pytest.mark.integration, pytest.mark.dbt]


def _rows(engine: Engine, sql: str, **params) -> list[dict]:
    with engine.connect() as conn:
        return [dict(r) for r in conn.execute(text(sql), params).mappings()]


def test_sponsorship_counts_per_member_and_role(built_mart: None, migrated_engine: Engine) -> None:
    rows = _rows(
        migrated_engine,
        "SELECT bioguide_id, role, count(*) AS n FROM mart.bill_sponsorship "
        f"WHERE congress = 119 AND {FIXTURE_BILLS_SQL} GROUP BY 1, 2 ORDER BY 1, 2",
    )
    assert {(r["bioguide_id"], r["role"]): r["n"] for r in rows} == {
        ("C001095", "cosponsor"): 3,
        ("C001095", "sponsor"): 2,
        ("S001213", "cosponsor"): 2,
        ("S001213", "sponsor"): 2,
    }


def test_dates_come_from_detail_and_cosponsors_endpoints(
    built_mart: None, migrated_engine: Engine
) -> None:
    (bill,) = _rows(
        migrated_engine,
        "SELECT introduced_date, congress_gov_url, policy_area FROM mart.bill "
        "WHERE congress = 119 AND bill_type = 'hr' AND bill_number = '5269'",
    )
    assert str(bill["introduced_date"]) == "2025-09-10"
    assert (
        bill["congress_gov_url"] == "https://www.congress.gov/bill/119th-congress/house-bill/5269"
    )
    assert bill["policy_area"] == "Health"

    (cosponsorship,) = _rows(
        migrated_engine,
        "SELECT date, is_original_cosponsor, withdrawn_date FROM mart.bill_sponsorship "
        "WHERE bioguide_id = 'S001213' AND bill_type = 'hr' AND bill_number = '5269'",
    )
    assert str(cosponsorship["date"]) == "2026-09-04"  # joined a year after introduction
    assert cosponsorship["is_original_cosponsor"] is False
    assert cosponsorship["withdrawn_date"] is None

    (sponsorship,) = _rows(
        migrated_engine,
        "SELECT s.date, b.introduced_date FROM mart.bill_sponsorship AS s "
        "JOIN mart.bill AS b USING (congress, bill_type, bill_number) "
        "WHERE s.bioguide_id = 'S001213' AND s.role = 'sponsor' AND s.bill_type = 'hr' "
        "AND s.bill_number = '4735'",
    )
    assert sponsorship["date"] == sponsorship["introduced_date"]


def test_amendments_are_bills_with_kind_amendment(
    built_mart: None, migrated_engine: Engine
) -> None:
    (amendment,) = _rows(
        migrated_engine,
        "SELECT kind, title, introduced_date, congress_gov_url, amended_bill_type, "
        "amended_bill_number, sponsor_bioguide_id FROM mart.bill "
        "WHERE congress = 119 AND bill_type = 'samdt' AND bill_number = '6683'",
    )
    assert amendment["kind"] == "amendment"
    assert amendment["title"]
    assert str(amendment["introduced_date"]) == "2026-07-14"
    assert amendment["congress_gov_url"] == (
        "https://www.congress.gov/amendment/119th-congress/senate-amendment/6683"
    )
    assert (amendment["amended_bill_type"], amendment["amended_bill_number"]) == ("s", "4784")
    assert amendment["sponsor_bioguide_id"] == "C001095"


def test_actions_present_for_every_bill(built_mart: None, migrated_engine: Engine) -> None:
    rows = _rows(
        migrated_engine,
        "SELECT b.bill_type, b.bill_number, count(a.action_hash) AS n FROM mart.bill AS b "
        "LEFT JOIN mart.bill_action AS a USING (congress, bill_type, bill_number) "
        f"WHERE b.congress = 119 AND (b.bill_type, b.bill_number) IN "
        f"{FIXTURE_BILLS_SQL.split(' IN ', 1)[1]} GROUP BY 1, 2",
    )
    assert len(rows) == 9
    assert all(r["n"] >= 1 for r in rows)
