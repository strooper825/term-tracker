"""End to end on fixtures: raw load -> dbt build -> GET /api/v1/members.

Needs Postgres and the dbt CLI. Skipped locally when either is missing; required in CI.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.engine import make_url

from ingest.db import connect
from ingest.sources import legislators as src
from tests.fixtures.legislators import fixture_fetch

pytestmark = [pytest.mark.integration, pytest.mark.dbt]

ROOT = Path(__file__).resolve().parents[2]


def _dbt_env(database_url: str) -> dict[str, str]:
    url = make_url(database_url)
    return {
        **os.environ,
        "PGHOST": url.host or "localhost",
        "PGPORT": str(url.port or 5432),
        "PGUSER": url.username or "",
        "PGPASSWORD": url.password or "",
        "PGDATABASE": url.database or "",
    }


@pytest.fixture(scope="module")
def built_mart(migrated_engine: Engine) -> None:
    dbt = shutil.which("dbt")
    if dbt is None:
        if os.environ.get("CI"):
            pytest.fail("dbt CLI not on PATH in CI")
        pytest.skip("dbt CLI not on PATH")

    with connect() as conn:
        src.load(conn, fetch=fixture_fetch)

    result = subprocess.run(
        [dbt, "build", "--project-dir", str(ROOT / "dbt"), "--profiles-dir", str(ROOT / "dbt")],
        env=_dbt_env(migrated_engine.url.render_as_string(hide_password=False)),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"dbt build failed:\n{result.stdout}\n{result.stderr}"


def test_members_returns_both_tracked_members(built_mart: None, client: TestClient) -> None:
    response = client.get("/api/v1/members")
    assert response.status_code == 200
    body = response.json()
    members = {m["bioguide_id"]: m for m in body["members"]}
    assert set(members) == {"S001213", "C001095"}  # B001230 is in raw but not tracked

    steil = members["S001213"]
    assert steil["name"]["official_full"] == "Bryan Steil"
    assert steil["party"] == "Republican"
    assert steil["seat"] == {
        "chamber": "house",
        "state": "WI",
        "state_name": "Wisconsin",
        "fips_state": "55",
        "district": 1,
        "senate_class": None,
        "state_rank": None,
        "label": "WI-1",
    }
    assert steil["term"] == {
        "congress": 119,
        "start_date": "2025-01-03",
        "end_date": "2027-01-03",
        "party": "Republican",
    }
    assert steil["photo_url"] == "https://www.congress.gov/img/member/s001213_200.jpg"
    assert steil["ids"]["fec"] == ["H8WI01156"]
    steil_committees = {c["thomas_id"]: c for c in steil["committees"]}
    assert steil_committees["HSHA"]["title"] == "Chair"
    assert steil_committees["HSHA"]["name"] == "House Committee on House Administration"
    assert steil_committees["HSBA"]["rank"] == 12
    assert steil_committees["HSBA21"]["parent_thomas_id"] == "HSBA"
    assert steil_committees["HSBA21"]["title"] == "Chairman"

    cotton = members["C001095"]
    assert cotton["seat"]["chamber"] == "senate"
    assert cotton["seat"]["state"] == "AR"
    assert cotton["seat"]["fips_state"] == "05"
    assert cotton["seat"]["district"] is None
    assert cotton["seat"]["senate_class"] == 2
    assert cotton["seat"]["label"] == "Arkansas (Class 2)"
    assert cotton["term"]["start_date"] == "2021-01-03"
    assert cotton["term"]["end_date"] == "2027-01-03"
    assert cotton["term"]["congress"] == 117
    cotton_committees = {c["thomas_id"]: c for c in cotton["committees"]}
    assert cotton_committees["SLIN"]["title"] == "Chairman"
    assert cotton_committees["SSAS"]["rank"] == 3
    assert cotton_committees["SSAS14"]["parent_name"] == cotton_committees["SSAS"]["name"]

    assert body["sources"], "every response carries sources[]"
    assert all(s["source_url"].startswith(src.BASE_URL) for s in body["sources"])
    assert all(s["fetched_at"] for s in body["sources"])


def test_openapi_lists_members(client: TestClient) -> None:
    assert "/api/v1/members" in client.get("/openapi.json").json()["paths"]
