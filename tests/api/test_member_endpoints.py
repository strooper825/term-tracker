"""Unit tests for the per-member endpoints with the database dependency stubbed out."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from api.db import get_session
from api.main import app
from api.routers.member import age_on, decode_cursor, encode_cursor


class _Result:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict]:
        return self._rows

    def first(self) -> dict | None:
        return self._rows[0] if self._rows else None


class _StubSession:
    """Answers the member_summary query with `rows`; term_history and leadership_role
    queries get their own rows (empty by default); everything else gets `rows` too, which is
    enough for the 404 and validation paths."""

    def __init__(self, rows: list[dict], by_table: dict[str, list[dict]] | None = None) -> None:
        self.rows = rows
        self.by_table = by_table or {}

    def execute(self, statement, *_args, **_kwargs) -> _Result:
        sql = str(statement)
        for table, rows in self.by_table.items():
            if table in sql:
                return _Result(rows)
        if "mart.term_history" in sql or "mart.leadership_role" in sql:
            return _Result([])
        return _Result(self.rows)


def _use_rows(rows: list[dict], by_table: dict[str, list[dict]] | None = None) -> None:
    app.dependency_overrides[get_session] = lambda: _StubSession(rows, by_table)


def teardown_function() -> None:
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "path",
    [
        "",
        "/timeline",
        "/feed",
        "/votes",
        "/bills",
        "/committees",
        "/key-dates",
        "/fundraising",
        "/election",
    ],
)
def test_unknown_member_is_404(client: TestClient, path: str) -> None:
    _use_rows([])
    response = client.get(f"/api/v1/members/X000000{path}")
    assert response.status_code == 404
    assert "X000000" in response.json()["detail"]


def test_cursor_round_trip() -> None:
    at = datetime(2026, 9, 12, 14, 30, tzinfo=UTC)
    cursor = encode_cursor(at, "vote:house:2:249")
    assert "=" not in cursor
    assert decode_cursor(cursor) == (at, "vote:house:2:249")


def test_malformed_cursor_is_400(client: TestClient) -> None:
    _use_rows([_summary_row()])
    response = client.get("/api/v1/members/S001213/feed?cursor=not-a-cursor")
    assert response.status_code == 400


@pytest.mark.parametrize(
    ("path", "status"),
    [
        ("/feed?limit=0", 422),
        ("/feed?limit=201", 422),
        ("/votes?limit=0", 422),
        ("/bills?role=author", 422),
        ("/timeline?from=2026-02-01&to=2026-01-01", 400),
        ("/timeline?from=yesterday", 422),
    ],
)
def test_parameter_validation(client: TestClient, path: str, status: int) -> None:
    _use_rows([_summary_row()])
    assert client.get(f"/api/v1/members/S001213{path}").status_code == status


def test_openapi_lists_every_section_6_endpoint(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    expected = {
        "/api/v1/members",
        "/api/v1/members/{bioguide}",
        "/api/v1/members/{bioguide}/timeline",
        "/api/v1/members/{bioguide}/feed",
        "/api/v1/members/{bioguide}/votes",
        "/api/v1/members/{bioguide}/bills",
        "/api/v1/members/{bioguide}/committees",
        "/api/v1/members/{bioguide}/key-dates",
        "/api/v1/members/{bioguide}/fundraising",
        "/api/v1/members/{bioguide}/election",
        "/api/v1/meta/freshness",
    }
    assert expected <= set(paths)
    assert client.get("/docs").status_code == 200


def _summary_row() -> dict:
    return {
        "bioguide_id": "S001213",
        "first_name": "Bryan",
        "middle_name": None,
        "last_name": "Steil",
        "nickname": None,
        "suffix": None,
        "official_full_name": "Bryan Steil",
        "birthday": datetime(1981, 3, 30).date(),
        "gender": "M",
        "photo_url": None,
        "govtrack_id": 1,
        "icpsr_id": 2,
        "lis_id": None,
        "fec_ids": ["H8WI01156"],
        "opensecrets_id": "N00043379",
        "wikipedia_id": "Bryan Steil",
        "ballotpedia_id": "Bryan Steil",
        "cspan_id": None,
        "votesmart_id": 181289,
        "wikidata_id": "Q58494431",
        "congress": 119,
        "chamber": "house",
        "party": "Republican",
        "caucus": None,
        "state_abbr": "WI",
        "state_name": "Wisconsin",
        "fips_state": "55",
        "district": 1,
        "senate_class": None,
        "state_rank": None,
        "term_start_date": datetime(2025, 1, 3).date(),
        "term_end_date": datetime(2027, 1, 3).date(),
        "term_end_congress": 119,
        "tracked_congress": 119,
        "term_count": 4,
        "first_term_start_date": datetime(2019, 1, 3).date(),
        "serving_since_date": datetime(2019, 1, 3).date(),
        "chamber_term_count": 4,
        "chamber_since_date": datetime(2019, 1, 3).date(),
        "leadership_title": None,
        "roll_calls": 5,
        "positions": 5,
        "votes_cast": 4,
        "not_voting": 1,
        "attendance_pct": 80.0,
        "missed_vote_pct": 20.0,
        "scoring_party": "R",
        "party_unity_pct": 100.0,
        "party_unity_cq_pct": None,
        "bills_sponsored": 2,
        "bills_cosponsored": 2,
        "committees": 6,
        "chairmanships": 2,
        "source": "legislators",
        "source_url": "https://example.test/legislators-current.yaml",
        "fetched_at": datetime(2026, 9, 12, tzinfo=UTC),
    }


def _term_row(index: int, start: str, end: str, congress: int) -> dict:
    return {
        "term_index": index,
        "chamber": "house",
        "congress": congress,
        "end_congress": congress,
        "start_date": datetime.fromisoformat(start).date(),
        "end_date": datetime.fromisoformat(end).date(),
        "state_abbr": "WI",
        "district": 1,
        "senate_class": None,
        "party": "Republican",
        "caucus": None,
        "how": None,
        "end_type": None,
        "source": "legislators",
        "source_url": "https://example.test/legislators-current.yaml",
        "fetched_at": datetime(2026, 9, 12, tzinfo=UTC),
    }


def test_member_detail_from_summary_row(client: TestClient) -> None:
    terms = [
        _term_row(1, "2019-01-03", "2021-01-03", 116),
        _term_row(2, "2021-01-03", "2023-01-03", 117),
        _term_row(3, "2023-01-03", "2025-01-03", 118),
        _term_row(4, "2025-01-03", "2027-01-03", 119),
    ]
    role = {
        "title": "House Republican Policy Committee Chair",
        "chamber": "house",
        "start_date": datetime(2025, 1, 3).date(),
        "end_date": None,
        "is_current": True,
        "source": "legislators",
        "source_url": "https://example.test/legislators-current.yaml",
        "fetched_at": datetime(2026, 9, 12, tzinfo=UTC),
    }
    _use_rows([_summary_row()], {"mart.term_history": terms, "mart.leadership_role": [role]})
    body = client.get("/api/v1/members/S001213").json()
    assert body["seat"]["label"] == "WI-1"
    assert body["name"] == {
        "first": "Bryan",
        "middle": None,
        "last": "Steil",
        "nickname": None,
        "suffix": None,
        "official_full": "Bryan Steil",
    }
    assert body["caucus"] is None
    assert body["bio"]["birthday"] == "1981-03-30" and body["bio"]["gender"] == "M"
    assert body["bio"]["age"] == age_on(datetime(1981, 3, 30).date(), datetime.now(UTC).date())
    assert body["service"]["serving_since"] == "2019-01-03"
    assert body["service"]["term_number"] == 4 and body["service"]["chamber_term_number"] == 4
    assert [t["congress"] for t in body["service"]["terms"]] == [116, 117, 118, 119]
    assert body["service"]["terms"][0]["state"] == "WI"
    assert body["leadership"] == [
        {
            "title": "House Republican Policy Committee Chair",
            "chamber": "house",
            "start_date": "2025-01-03",
            "end_date": None,
            "is_current": True,
        }
    ]
    assert body["ids"]["opensecrets"] == "N00043379" and body["ids"]["cspan"] is None
    assert body["ids"]["wikidata"] == "Q58494431"
    assert body["votes"]["scoring_party"] == "R"
    assert body["term"]["end_date"] == "2027-01-03"
    assert body["term"]["congresses"] == [119] and body["term"]["tracked_congress"] == 119
    assert body["term"]["days_remaining"] >= 0
    assert body["votes"]["attendance_pct"] == 80.0
    assert body["activity"] == {
        "bills_sponsored": 2,
        "bills_cosponsored": 2,
        "committees": 6,
        "chairmanships": 2,
    }
    assert body["sources"][0]["source"] == "legislators"


@pytest.mark.parametrize(
    ("birthday", "today", "expected"),
    [
        ((1981, 3, 30), (2026, 9, 13), 45),
        ((1981, 9, 13), (2026, 9, 13), 45),  # birthday today
        ((1981, 9, 14), (2026, 9, 13), 44),  # birthday tomorrow
        ((1941, 9, 8), (2026, 9, 13), 85),
    ],
)
def test_age_on(birthday: tuple, today: tuple, expected: int) -> None:
    assert age_on(datetime(*birthday).date(), datetime(*today).date()) == expected
    assert age_on(None, datetime(*today).date()) is None


def _fundraising_row(**overrides) -> dict:
    row = {
        "bioguide_id": "S001213",
        "cycle": 2026,
        "status": "filed",
        "candidate_id": "H8WI01156",
        "candidate_name": "STEIL, BRYAN GEORGE",
        "candidate_fec_url": "https://www.fec.gov/data/candidate/H8WI01156/?cycle=2026&election_full=false",
        "committee_id": "C00677286",
        "committee_name": "STEIL FOR WISCONSIN, INC.",
        "committee_fec_url": "https://www.fec.gov/data/committee/C00677286/?cycle=2026",
        "coverage_start_date": datetime(2025, 1, 1).date(),
        "coverage_end_date": datetime(2026, 7, 22).date(),
        "last_report_type": "PRE-PRIMARY",
        "last_report_year": 2026,
        "raised": 5467777.07,
        "spent": 1359848.79,
        "cash_on_hand": 6327098.65,
        "debts": 0.0,
        "individual_small": 253362.51,
        "individual_large": 1240060.26,
        "individual_total": 1493422.77,
        "pac": 1633675.16,
        "party": 1000.0,
        "self_funding": 0.0,
        "transfers": 2190887.63,
        "other": 148791.51,
        "small_donor_pct": 4.63,
        "small_donor_of_individual_pct": 16.97,
        "individual_small_pct": 4.63,
        "individual_large_pct": 22.68,
        "individual_pct": 27.31,
        "pac_pct": 29.88,
        "party_pct": 0.02,
        "self_funding_pct": 0.0,
        "transfers_pct": 40.07,
        "other_pct": 2.72,
        "source": "fec",
        "source_url": "https://api.open.fec.gov/v1/committee/C00677286/totals/?cycle=2026",
        "fetched_at": datetime(2026, 9, 13, tzinfo=UTC),
    }
    row.update(overrides)
    return row


def test_fundraising_filed_row_maps_every_column(client: TestClient) -> None:
    _use_rows([_summary_row()], {"mart.member_fundraising": [_fundraising_row()]})
    body = client.get("/api/v1/members/S001213/fundraising").json()
    assert body["status"] == "filed" and body["cycle"] == 2026
    assert body["committee"] == {
        "committee_id": "C00677286",
        "name": "STEIL FOR WISCONSIN, INC.",
        "fec_url": "https://www.fec.gov/data/committee/C00677286/?cycle=2026",
    }
    assert body["candidate"]["candidate_id"] == "H8WI01156"
    assert body["coverage"] == {
        "start_date": "2025-01-01",
        "end_date": "2026-07-22",
        "last_report_type": "PRE-PRIMARY",
        "last_report_year": 2026,
    }
    assert body["totals"] == {
        "raised": 5467777.07,
        "spent": 1359848.79,
        "cash_on_hand": 6327098.65,
        "debts": 0.0,
    }
    assert body["receipts"]["individual_small"] == {"amount": 253362.51, "pct": 4.63}
    assert body["receipts"]["individual"] == {"amount": 1493422.77, "pct": 27.31}
    assert body["receipts"]["transfers"] == {"amount": 2190887.63, "pct": 40.07}
    assert body["receipts"]["other"] == {"amount": 148791.51, "pct": 2.72}
    assert body["small_donor_pct"] == 4.63
    assert body["sources"] == [
        {
            "source": "fec",
            "source_url": "https://api.open.fec.gov/v1/committee/C00677286/totals/?cycle=2026",
            "fetched_at": "2026-09-13T00:00:00Z",
        }
    ]


@pytest.mark.parametrize(
    ("status", "nulls"),
    [
        ("no_filings", ["coverage", "totals", "receipts"]),
        ("no_committee", ["committee", "coverage", "totals", "receipts"]),
        ("no_candidate", ["candidate", "committee", "coverage", "totals", "receipts"]),
    ],
)
def test_fundraising_missing_data_keeps_the_status_and_no_zeros(
    client: TestClient, status: str, nulls: list[str]
) -> None:
    row = _fundraising_row(status=status)
    money = [k for k in row if isinstance(row[k], float)] + [
        "coverage_start_date",
        "coverage_end_date",
        "last_report_type",
        "last_report_year",
    ]
    for key in money:
        row[key] = None
    if status in ("no_committee", "no_candidate"):
        row.update(committee_id=None, committee_name=None, committee_fec_url=None)
    if status == "no_candidate":
        row.update(candidate_id=None, candidate_name=None, candidate_fec_url=None)
    _use_rows([_summary_row()], {"mart.member_fundraising": [row]})
    body = client.get("/api/v1/members/S001213/fundraising").json()
    assert body["status"] == status
    for key in nulls:
        assert body[key] is None, key
    assert body["small_donor_pct"] is None


NEXT_KILEY = {
    "bioguide_id": "K000401",
    "chamber": "house",
    "state_abbr": "CA",
    "state_name": "California",
    "seat_district": 3,
    "race_district": 6,
    "race_differs_from_seat": True,
    "election_year": 2026,
    "election_date": datetime(2026, 11, 3).date(),
    "cycle": 2026,
    "on_ballot_this_cycle": True,
    "opponent_status": "confirmed",
    "opponent_name": "Richard Pan",
    "opponent_party": "D",
    "opponent_fec_candidate_id": "H6CA03158",
    "opponent_fec_url": "https://www.fec.gov/data/candidate/H6CA03158/?cycle=2026&election_full=false",
    "opponent_source_url": "https://example.test/ca-6",
    "opponent_verified_on": datetime(2026, 9, 13).date(),
    "opponent_note": None,
    "election_date_source_url": "https://uscode.house.gov/2usc7",
    "source": "legislators",
    "source_url": "https://example.test/legislators",
    "fetched_at": datetime(2026, 9, 13, tzinfo=UTC),
}
PRIOR_UNOPPOSED = {
    "status": "found",
    "chamber": "house",
    "state_abbr": "CA",
    "state_name": "California",
    "district": 3,
    "election_year": 2024,
    "election_date": datetime(2024, 11, 5).date(),
    "special": False,
    "winner_name": "KEVIN KILEY",
    "winner_party": "R",
    "winner_party_lines": ["REPUBLICAN"],
    "winner_votes": 1000,
    "winner_pct": 100.0,
    "runner_up_name": None,
    "runner_up_party": None,
    "runner_up_party_lines": None,
    "runner_up_votes": None,
    "runner_up_pct": None,
    "margin_votes": 1000,
    "margin_pct": 100.0,
    "candidates": 1,
    "valid_votes": 1000,
    "blank_votes": 0,
    "over_votes": 0,
    "mixed_votes": 0,
    "dataset_url": "https://example.test/mit",
    "dataset_version": "15.0",
    "source": "mit_election_lab",
    "source_url": "https://clerk.house.gov/member_info/electionInfo/2024/statistics2024.pdf",
    "fetched_at": datetime(2026, 9, 14, tzinfo=UTC),
}


def test_election_labels_the_race_apart_from_the_seat(client: TestClient) -> None:
    _use_rows(
        [{"bioguide_id": "K000401"}],
        {
            "mart.member_next_election": [NEXT_KILEY],
            "mart.member_prior_election": [PRIOR_UNOPPOSED],
        },
    )
    body = client.get("/api/v1/members/K000401/election").json()
    today = datetime.now(UTC).date()
    assert body["next"] == {
        "election_date": "2026-11-03",
        "election_year": 2026,
        "cycle": 2026,
        "on_ballot_this_cycle": True,
        "days_away": (NEXT_KILEY["election_date"] - today).days,
        "race_label": "CA-6",
        "seat_label": "CA-3",
        "race_differs_from_seat": True,
        "date_source_url": "https://uscode.house.gov/2usc7",
    }
    assert body["opponent_status"] == "confirmed"
    assert body["opponent"]["name"] == "Richard Pan"
    assert body["prior"]["seat_label"] == "CA-3"
    assert body["prior"]["runner_up"] is None  # unopposed
    assert {s["source"] for s in body["sources"]} == {
        "legislators",
        "race_nominees_seed",
        "mit_election_lab",
    }


def test_election_without_opponent_or_prior_result(client: TestClient) -> None:
    senate = {
        **NEXT_KILEY,
        "chamber": "senate",
        "state_abbr": "VT",
        "state_name": "Vermont",
        "seat_district": None,
        "race_district": None,
        "race_differs_from_seat": False,
        "election_year": 2030,
        "election_date": datetime(2030, 11, 5).date(),
        "on_ballot_this_cycle": False,
        "opponent_status": "not_on_ballot",
        **{k: None for k in NEXT_KILEY if k.startswith("opponent_") and k != "opponent_status"},
    }
    _use_rows(
        [{"bioguide_id": "S000033"}],
        {
            "mart.member_next_election": [senate],
            "mart.member_prior_election": [{**PRIOR_UNOPPOSED, "status": "no_contest"}],
        },
    )
    body = client.get("/api/v1/members/S000033/election").json()
    assert body["next"]["race_label"] == "Vermont"
    assert body["next"]["on_ballot_this_cycle"] is False
    assert body["opponent"] is None and body["opponent_status"] == "not_on_ballot"
    assert body["prior"] is None and body["prior_status"] == "no_contest"
    assert [s["source"] for s in body["sources"]] == ["legislators"]
