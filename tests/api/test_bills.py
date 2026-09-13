"""Unit tests for /api/v1/bills with the database dependency stubbed out."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient

from api.db import get_session
from api.main import app


class _Result:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict]:
        return self._rows

    def first(self) -> dict | None:
        return self._rows[0] if self._rows else None

    def scalar_one(self) -> int:
        return len(self._rows)


class _StubSession:
    """Answers each query with the rows registered for the table it selects FROM.

    The table name must end at a non-identifier character, so `mart.bill` does not also
    answer the `mart.bill_summary` and `mart.bill_cosponsor` queries.
    """

    def __init__(self, by_table: dict[str, list[dict]]) -> None:
        self.by_table = by_table

    def execute(self, statement, *_args, **_kwargs) -> _Result:
        sql = str(statement)
        for table, rows in self.by_table.items():
            needle = f"FROM {table}"
            at = sql.find(needle)
            if at < 0:
                continue
            after = sql[at + len(needle) : at + len(needle) + 1]
            if not (after.isalnum() or after == "_"):
                return _Result(rows)
        return _Result([])


def _use(by_table: dict[str, list[dict]]) -> None:
    app.dependency_overrides[get_session] = lambda: _StubSession(by_table)


def teardown_function() -> None:
    app.dependency_overrides.clear()


PROVENANCE = {
    "source": "congress_gov",
    "source_url": "https://api.congress.gov/v3/bill/119/hr/4735?format=json",
    "fetched_at": datetime(2026, 9, 13, tzinfo=UTC),
}


def _bill_row(**overrides) -> dict:
    row = {
        "congress": 119,
        "bill_type": "hr",
        "bill_number": "4735",
        "label": "H.R. 4735",
        "kind": "bill",
        "title": "Business of Insurance Regulatory Reform Act of 2025",
        "policy_area": "Finance and Financial Sector",
        "introduced_date": date(2025, 7, 23),
        "latest_action_date": date(2025, 7, 23),
        "latest_action_text": "Referred to the House Committee on Financial Services.",
        "sponsor_bioguide_id": "S001213",
        "sponsor_name": "Bryan Steil",
        "sponsor_full_name": "Rep. Steil, Bryan [R-WI-1]",
        "sponsor_party": "R",
        "sponsor_state": "WI",
        "sponsor_district": 1,
        "sponsor_is_tracked": True,
        "cosponsor_count": 3,
        "cosponsors_democratic": 1,
        "cosponsors_republican": 2,
        "cosponsors_other": 0,
        "cosponsors_withdrawn": 0,
        "action_count": 2,
        "summary_count": 1,
        "has_summary": True,
        "roll_call_count": 1,
        "congress_gov_url": "https://www.congress.gov/bill/119th-congress/house-bill/4735",
        "amended_bill_congress": None,
        "amended_bill_type": None,
        "amended_bill_number": None,
        "update_date": datetime(2026, 9, 1, tzinfo=UTC),
        **PROVENANCE,
    }
    row.update(overrides)
    return row


def _summary_row(**overrides) -> dict:
    row = {
        "version_code": "00",
        "action_date": date(2025, 7, 23),
        "action_desc": "Introduced in House",
        "text_html": "<p><strong>Act</strong></p>",
        "text_length": 26,
        "update_date": datetime(2025, 7, 30, tzinfo=UTC),
        "is_latest": True,
        **PROVENANCE,
    }
    row.update(overrides)
    return row


def _cosponsor_row(**overrides) -> dict:
    row = {
        "bioguide_id": "C001095",
        "display_name": "Tom Cotton",
        "full_name": "Sen. Cotton, Tom [R-AR]",
        "party": "R",
        "state": "AR",
        "district": None,
        "sponsorship_date": date(2025, 8, 1),
        "is_original_cosponsor": False,
        "withdrawn_date": None,
        "is_withdrawn": False,
        "is_tracked_member": True,
        **PROVENANCE,
    }
    row.update(overrides)
    return row


def _action_row() -> dict:
    return {
        "action_date": date(2025, 7, 23),
        "action_time": None,
        "action_code": "H11100",
        "action_text": "Referred to the House Committee on Financial Services.",
        "action_type": "IntroReferral",
        "source_system": "House floor actions",
        **PROVENANCE,
    }


def _roll_call_row() -> dict:
    return {
        "chamber": "house",
        "session": 1,
        "roll_number": 240,
        "voted_at": datetime(2025, 9, 3, 18, 24, tzinfo=UTC),
        "vote_date": date(2025, 9, 3),
        "question": "On Passage",
        "result": "Passed",
        "yea_total": 237,
        "nay_total": 169,
        "present_total": 1,
        "not_voting_total": 26,
        **PROVENANCE,
    }


def _position_row() -> dict:
    return {
        "chamber": "house",
        "session": 1,
        "roll_number": 240,
        "bioguide_id": "S001213",
        "position": "Yea",
        "official_full_name": "Bryan Steil",
        "party": "Republican",
    }


def _full_bill() -> dict[str, list[dict]]:
    return {
        "mart.bill_summary": [_summary_row(), _summary_row(version_code="53", is_latest=False)],
        "mart.bill_cosponsor": [_cosponsor_row()],
        "mart.bill_action": [_action_row()],
        "mart.member_vote": [_position_row()],
        "mart.roll_call": [_roll_call_row()],
        "mart.bill": [_bill_row()],
    }


def test_unknown_bill_is_404_and_says_what_the_site_covers(client: TestClient) -> None:
    _use({"mart.bill": []})
    response = client.get("/api/v1/bills/119/hr/999999")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "HR 999999" in detail and "sponsored or cosponsored" in detail


def test_bill_type_is_matched_case_insensitively(client: TestClient) -> None:
    _use(_full_bill())
    assert client.get("/api/v1/bills/119/HR/4735").status_code == 200


def test_detail_maps_every_section(client: TestClient) -> None:
    _use(_full_bill())
    body = client.get("/api/v1/bills/119/hr/4735").json()

    assert body["label"] == "H.R. 4735" and body["kind"] == "bill"
    assert body["sponsor"] == {
        "bioguide_id": "S001213",
        "name": "Bryan Steil",
        "full_name": "Rep. Steil, Bryan [R-WI-1]",
        "party": "R",
        "state": "WI",
        "district": 1,
        "is_tracked": True,
    }
    assert body["cosponsors"] == {
        "total": 3,
        "democratic": 1,
        "republican": 2,
        "other": 0,
        "withdrawn": 0,
    }
    # the latest version is lifted out; the history keeps every version
    assert body["summary"]["version_code"] == "00"
    assert body["summary"]["action_date"] == "2025-07-23"
    assert [v["version_code"] for v in body["summary_versions"]] == ["00", "53"]
    assert body["cosponsor_list"][0]["name"] == "Tom Cotton"
    assert body["cosponsor_list"][0]["is_tracked_member"] is True
    assert body["actions"][0]["action_type"] == "IntroReferral"
    call = body["roll_calls"][0]
    assert (call["yea_total"], call["nay_total"]) == (237, 169)
    assert call["tracked_positions"] == [
        {"bioguide_id": "S001213", "name": "Bryan Steil", "party": "Republican", "position": "Yea"}
    ]
    assert body["sources"][0]["source"] == "congress_gov"


def test_a_bill_with_no_summary_returns_null_not_an_empty_object(client: TestClient) -> None:
    _use({"mart.bill": [_bill_row(summary_count=0, has_summary=False)]})
    body = client.get("/api/v1/bills/119/hr/4735").json()
    assert body["summary"] is None
    assert body["summary_versions"] == []
    assert body["has_summary"] is False
    assert body["cosponsor_list"] == [] and body["roll_calls"] == []


def test_listing_reports_the_window_and_the_total(client: TestClient) -> None:
    _use({"mart.bill": [_bill_row(), _bill_row(bill_number="1502", label="H.R. 1502")]})
    body = client.get("/api/v1/bills?limit=2&offset=0").json()
    assert body["total"] == 2 and body["limit"] == 2 and body["offset"] == 0
    assert [item["label"] for item in body["items"]] == ["H.R. 4735", "H.R. 1502"]
    assert body["items"][0]["sponsor"]["name"] == "Bryan Steil"
    assert "summary" not in body["items"][0]  # the listing carries counts, not the text


@pytest.mark.parametrize(
    ("path", "status"),
    [("/bills?limit=0", 422), ("/bills?limit=2001", 422), ("/bills?offset=-1", 422)],
)
def test_listing_parameter_validation(client: TestClient, path: str, status: int) -> None:
    _use({"mart.bill": []})
    assert client.get(f"/api/v1{path}").status_code == status


def test_openapi_lists_both_bill_paths(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/bills" in paths
    assert "/api/v1/bills/{congress}/{bill_type}/{bill_number}" in paths
