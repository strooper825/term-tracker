"""Unit tests for the per-member endpoints with the database dependency stubbed out."""

from __future__ import annotations

from datetime import UTC, date, datetime

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
        if any(t in sql for t in ("mart.term_history", "mart.leadership_role", "mart.stock_trade")):
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
        "/contact",
        "/constituency",
        "/statements",
        "/stock-trades",
        "/key-dates",
        "/fundraising",
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
        ("/statements?limit=0", 422),
        ("/statements?limit=5001", 422),
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
        "/api/v1/members/{bioguide}/contact",
        "/api/v1/members/{bioguide}/constituency",
        "/api/v1/members/{bioguide}/statements",
        "/api/v1/members/{bioguide}/stock-trades",
        "/api/v1/members/{bioguide}/key-dates",
        "/api/v1/members/{bioguide}/fundraising",
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


def _source_row(mode: str, **overrides: object) -> dict:
    return {
        "mode": mode,
        "link_kind": "press_page",
        "label": "sanders.senate.gov",
        "press_url": "https://www.sanders.senate.gov/press-releases/",
        "feed_url": "https://www.sanders.senate.gov/press-releases/feed/"
        if mode == "feed"
        else None,
        "statements": 2 if mode == "feed" else 0,
        "newest_published_at": datetime(2026, 9, 19, 15, 39, tzinfo=UTC)
        if mode == "feed"
        else None,
        "source": "press_feed" if mode == "feed" else "press_page",
        "source_url": "https://www.sanders.senate.gov/press-releases/",
        "fetched_at": datetime(2026, 9, 19, 23, 0, tzinfo=UTC),
        **overrides,
    }


def _statement_row(n: int) -> dict:
    return {
        "guid": f"https://www.sanders.senate.gov/?p={n}",
        "title": f"Statement {n}",
        "published_at": datetime(2026, 9, 19 - n, 12, 0, tzinfo=UTC),
        "published_date": date(2026, 9, 19 - n),
        "url": f"https://www.sanders.senate.gov/press-releases/statement-{n}/",
        "author": "Sanders",
        "categories": ["Press Releases"],
        "description": "Excerpt",
        "content_html": "<p>Full text</p>",
    }


def test_statements_for_a_feed_member(client: TestClient) -> None:
    _use_rows(
        [_summary_row()],
        {
            "mart.statement_source": [_source_row("feed")],
            "ORDER BY published_at DESC, guid DESC": [_statement_row(0), _statement_row(1)],
        },
    )
    body = client.get("/api/v1/members/S001213/statements").json()
    assert body["mode"] == "feed" and body["total"] == 2
    assert [i["title"] for i in body["items"]] == ["Statement 0", "Statement 1"]
    assert body["items"][0]["content_html"] == "<p>Full text</p>"
    assert body["feed_url"].endswith("/feed/")
    assert body["sources"][0]["source"] == "press_feed"


def test_statements_for_a_link_member_carry_no_items(client: TestClient) -> None:
    _use_rows(
        [_summary_row()],
        {
            "mart.statement_source": [_source_row("link")],
            "ORDER BY published_at DESC, guid DESC": [_statement_row(0)],
        },
    )
    body = client.get("/api/v1/members/S001213/statements").json()
    assert body["mode"] == "link" and body["items"] == [] and body["total"] == 0
    assert body["press_url"] == "https://www.sanders.senate.gov/press-releases/"
    assert body["link_kind"] == "press_page"
    assert body["feed_url"] is None


def test_statements_for_an_unchecked_member_link_to_the_official_website(
    client: TestClient,
) -> None:
    """No hand-checked row and no press listing found: the link is the office's home page."""
    row = _source_row(
        "link",
        link_kind="official_website",
        press_url="https://www.sanders.senate.gov",
        source="official_website",
        source_url="https://www.sanders.senate.gov",
    )
    _use_rows([_summary_row()], {"mart.statement_source": [row]})
    body = client.get("/api/v1/members/S001213/statements").json()
    assert body["mode"] == "link" and body["link_kind"] == "official_website"
    assert body["sources"][0]["source"] == "official_website"


def test_statements_for_a_member_not_in_the_seed_are_none(client: TestClient) -> None:
    _use_rows([_summary_row()], {"mart.statement_source": []})
    body = client.get("/api/v1/members/S001213/statements").json()
    assert body["mode"] == "none" and body["items"] == [] and body["sources"] == []
    assert body["link_kind"] is None


PTR_URL = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20033945.pdf"
CLERK_SEARCH = "https://disclosures-clerk.house.gov/FinancialDisclosure"


def _trades_summary(status: str, **overrides: object) -> dict:
    return {
        "bioguide_id": "S001213",
        "chamber": "senate" if status == "senate_unavailable" else "house",
        "status": status,
        "filings": 0,
        "filings_parsed": 0,
        "filings_scanned": 0,
        "filings_failed": 0,
        "latest_filing_date": None,
        "trades": 0,
        "purchases": 0,
        "sales": 0,
        "exchanges": 0,
        "purchases_low": 0,
        "purchases_high": 0,
        "purchases_high_is_open": False,
        "sales_low": 0,
        "sales_high": 0,
        "sales_high_is_open": False,
        "first_trade_date": None,
        "last_trade_date": None,
        "covers_from": date(2025, 1, 3),
        "lookup_url": "https://efdsearch.senate.gov/search/"
        if status == "senate_unavailable"
        else CLERK_SEARCH,
        "source": "senate_efd" if status == "senate_unavailable" else "house_clerk_ptr",
        "source_url": CLERK_SEARCH,
        "fetched_at": datetime(2026, 9, 20, 6, 0, tzinfo=UTC),
        "checked_at": datetime(2026, 9, 20, 6, 0, tzinfo=UTC),
        **overrides,
    }


def _trade_row(n: int, **overrides: object) -> dict:
    return {
        "doc_id": "20033945",
        "row_number": n,
        "trade_date": date(2026, 1, 14),
        "notification_date": date(2026, 2, 4),
        "filing_date": date(2026, 2, 17),
        "days_to_file": 34,
        "owner_code": "SP",
        "owner_label": "Spouse",
        "asset_name": "Paychex, Inc. - Common Stock",
        "ticker": "PAYX",
        "asset_type_code": "ST",
        "asset_type_label": "Stocks (including ADRs)",
        "transaction_type_code": "S",
        "transaction_type_label": "Sale",
        "direction": "sale",
        "amount_raw": "$15,001 - $50,000",
        "amount_kind": "band",
        "amount_low": 15001,
        "amount_high": 50000,
        "filing_status": "New",
        "subholding_of": "LIVTR",
        "description": None,
        "location": None,
        "comments": None,
        "has_unmapped_code": False,
        "source_url": f"{PTR_URL}#page=1",
        **overrides,
    }


def _filing_row(doc_id: str, status: str, trades: int) -> dict:
    return {
        "doc_id": doc_id,
        "year": 2026,
        "filing_date": date(2026, 2, 17),
        "status": status,
        "error": "page 1: text before the first transaction" if status == "failed" else None,
        "pages": 2,
        "amendment": None,
        "superseded_by": None,
        "trades": trades,
        "source": "house_clerk_ptr",
        "source_url": f"https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/{doc_id}.pdf",
    }


def test_stock_trades_for_a_member_with_reports(client: TestClient) -> None:
    _use_rows(
        [_summary_row()],
        {
            "mart.member_stock_trades": [
                _trades_summary(
                    "filed",
                    filings=3,
                    filings_parsed=1,
                    filings_scanned=1,
                    filings_failed=1,
                    trades=2,
                    sales=2,
                    sales_low=30002,
                    sales_high=100000,
                    latest_filing_date=date(2026, 2, 17),
                )
            ],
            "mart.stock_trade_filing": [
                _filing_row("20033945", "parsed", 2),
                _filing_row("8221322", "scanned", 0),
                _filing_row("20034201", "failed", 0),
            ],
            "ORDER BY trade_date DESC, doc_id DESC": [_trade_row(1), _trade_row(2)],
        },
    )
    body = client.get("/api/v1/members/S001213/stock-trades").json()
    assert body["status"] == "filed" and body["chamber"] == "house"
    assert body["summary"]["filings_scanned"] == 1 and body["summary"]["sales_high"] == 100000
    assert [f["status"] for f in body["filings"]] == ["parsed", "scanned", "failed"]
    assert body["filings"][2]["error"].startswith("page 1")
    assert [t["row_number"] for t in body["items"]] == [1, 2]
    assert body["items"][0]["amount_high"] == 50000
    assert body["items"][0]["source_url"].endswith("#page=1")
    assert body["lookup_url"] == CLERK_SEARCH
    assert body["sources"][0]["source"] == "house_clerk_ptr"


def test_a_top_band_trade_has_no_high_end(client: TestClient) -> None:
    _use_rows(
        [_summary_row()],
        {
            "mart.member_stock_trades": [
                _trades_summary("filed", filings=1, filings_parsed=1, trades=1, sales=1)
            ],
            "mart.stock_trade_filing": [_filing_row("20033945", "parsed", 1)],
            "ORDER BY trade_date DESC, doc_id DESC": [
                _trade_row(
                    1,
                    amount_raw="Over $50,000,000",
                    amount_kind="top_band",
                    amount_low=50000000,
                    amount_high=None,
                )
            ],
        },
    )
    item = client.get("/api/v1/members/S001213/stock-trades").json()["items"][0]
    assert item["amount_low"] == 50000000 and item["amount_high"] is None


def test_stock_trades_for_a_house_member_with_no_reports(client: TestClient) -> None:
    _use_rows([_summary_row()], {"mart.member_stock_trades": [_trades_summary("no_filings")]})
    body = client.get("/api/v1/members/S001213/stock-trades").json()
    assert body["status"] == "no_filings" and body["filings"] == [] and body["items"] == []
    assert body["summary"]["trades"] == 0 and body["covers_from"] == "2025-01-03"


def test_stock_trades_for_a_senator_are_unavailable_not_empty(client: TestClient) -> None:
    _use_rows(
        [_summary_row()], {"mart.member_stock_trades": [_trades_summary("senate_unavailable")]}
    )
    body = client.get("/api/v1/members/S001213/stock-trades").json()
    assert body["status"] == "senate_unavailable" and body["chamber"] == "senate"
    assert body["items"] == [] and body["lookup_url"] == "https://efdsearch.senate.gov/search/"


EFD = "https://efdsearch.senate.gov/search/view/ptr"


def test_stock_trades_for_a_senator_read_from_efd(client: TestClient) -> None:
    replaced, amendment = (
        "3a779539-8451-49d2-8419-d3eb72c7922a",
        "51455bcd-4966-4e77-b481-09897ada81ae",
    )
    senate_filing = {
        "year": 2025,
        "status": "parsed",
        "error": None,
        "pages": None,
        "source": "senate_efd",
    }
    _use_rows(
        [_summary_row()],
        {
            "mart.member_stock_trades": [
                _trades_summary(
                    "filed",
                    chamber="senate",
                    source="senate_efd",
                    lookup_url="https://efdsearch.senate.gov/search/",
                    filings=2,
                    filings_parsed=2,
                    trades=1,
                    purchases=1,
                )
            ],
            "mart.stock_trade_filing": [
                {
                    **senate_filing,
                    "doc_id": amendment,
                    "filing_date": date(2026, 8, 24),
                    "amendment": 1,
                    "superseded_by": None,
                    "trades": 1,
                    "source_url": f"{EFD}/{amendment}/",
                },
                {
                    **senate_filing,
                    "doc_id": replaced,
                    "filing_date": date(2025, 12, 8),
                    "amendment": 0,
                    "superseded_by": amendment,
                    "trades": 0,
                    "source_url": f"{EFD}/{replaced}/",
                },
            ],
            "ORDER BY trade_date DESC, doc_id DESC": [
                _trade_row(
                    1,
                    doc_id=amendment,
                    notification_date=None,
                    owner_code="JT",
                    owner_label="Joint",
                    asset_type_code="Stock",
                    asset_type_label="Stock",
                    transaction_type_code="P",
                    transaction_type_label="Purchase",
                    direction="purchase",
                    filing_status=None,
                    subholding_of=None,
                    source_url=f"{EFD}/{amendment}/",
                )
            ],
        },
    )
    body = client.get("/api/v1/members/S001213/stock-trades").json()
    assert body["status"] == "filed" and body["chamber"] == "senate"
    assert [f["superseded_by"] for f in body["filings"]] == [None, amendment]
    assert [f["amendment"] for f in body["filings"]] == [1, 0]
    assert {f["source"] for f in body["filings"]} == {"senate_efd"}
    assert body["items"][0]["notification_date"] is None
    assert body["items"][0]["source_url"] == f"{EFD}/{amendment}/"


def test_stock_trades_without_a_mart_row_is_404(client: TestClient) -> None:
    _use_rows([_summary_row()], {"mart.member_stock_trades": []})
    assert client.get("/api/v1/members/S001213/stock-trades").status_code == 404


def _annual_summary(**overrides: object) -> dict:
    return {
        "bioguide_id": "S001213",
        "chamber": "house",
        "status": "filed",
        "reports": 2,
        "pending": 1,
        "latest_year": 2025,
        "latest_filing_date": date(2026, 5, 12),
        "covers_from": date(2025, 1, 3),
        "lookup_url": CLERK_SEARCH,
        "source": "house_clerk",
        "source_url": CLERK_SEARCH,
        "fetched_at": datetime(2026, 11, 16, 18, 0, tzinfo=UTC),
        "checked_at": datetime(2026, 11, 16, 18, 0, tzinfo=UTC),
        **overrides,
    }


def test_annual_disclosures_list_reports_and_extensions(client: TestClient) -> None:
    pdf = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs"
    _use_rows(
        [_summary_row()],
        {
            # The net-worth query also names mart.annual_disclosure: none read yet.
            "mart.annual_net_worth": [],
            "mart.member_annual_disclosures": [_annual_summary()],
            "mart.annual_disclosure": [
                {
                    "doc_id": "30099999",
                    "kind": "extension",
                    "label": "Report for 2026: not filed yet",
                    "covers_year": 2026,
                    "filing_date": date(2027, 5, 10),
                    "extended_on": date(2027, 5, 10),
                    "source": "house_clerk",
                    "source_url": f"{pdf}/2026/30099999.pdf",
                },
                {
                    "doc_id": "10075925",
                    "kind": "annual",
                    "label": "Annual report for 2025",
                    "covers_year": 2025,
                    "filing_date": date(2026, 5, 12),
                    "extended_on": None,
                    "source": "house_clerk",
                    "source_url": f"{pdf}/2025/10075925.pdf",
                },
            ],
        },
    )
    body = client.get("/api/v1/members/S001213/annual-disclosures").json()
    assert body["status"] == "filed" and body["chamber"] == "house"
    assert [i["kind"] for i in body["items"]] == ["extension", "annual"]
    assert body["items"][1]["label"] == "Annual report for 2025"
    assert body["items"][1]["source_url"].endswith("/2025/10075925.pdf")
    assert body["sources"][0]["source"] == "house_clerk"


def test_annual_disclosures_without_a_mart_row_is_404(client: TestClient) -> None:
    _use_rows([_summary_row()], {"mart.member_annual_disclosures": []})
    assert client.get("/api/v1/members/S001213/annual-disclosures").status_code == 404


def test_annual_disclosures_carry_the_newest_read_report(client: TestClient) -> None:
    url = "https://efdsearch.senate.gov/search/view/annual/81060eb2-fc35-4a8c-857d-3220cf411b9b/"
    worth = {
        "bioguide_id": "S001213",
        "covers_year": 2025,
        "doc_id": "81060eb2-fc35-4a8c-857d-3220cf411b9b",
        "label": "Annual report for 2025",
        "filing_date": date(2026, 8, 13),
        "holdings": 29,
        "unascertainable": 1,
        "assets_low": 662029,
        "assets_high": 1830000,
        "assets_high_is_open": False,
        "liabilities": 2,
        "liabilities_low": 200002,
        "liabilities_high": 500000,
        "liabilities_high_is_open": False,
        "net_low": 162029,
        "net_high": 1629998,
        "source": "senate_efd",
        "source_url": url,
    }
    asset = {
        "row_label": "1.1",
        "is_account": False,
        "held_in": "Spouse Retirement plan",
        "asset_name": "CREF Stock Account - R1",
        "asset_notes": None,
        "asset_category": "Mutual Funds",
        "asset_subtype": "Mutual Fund",
        "owner_label": "Spouse",
        "value_raw": "$15,001 - $50,000",
        "value_kind": "band",
        "value_low": 15001,
        "value_high": 50000,
        "income_type": "Excepted Investment Fund",
        "income_raw": "None (or less than $201)",
    }
    debt = {
        "incurred": "2013",
        "owner_label": "Joint",
        "liability_type": "Mortgage",
        "rate": "8.0% (30 years)",
        "amount_raw": "$100,001 - $250,000",
        "amount_low": 100001,
        "amount_high": 250000,
        "creditor": "Quicken Loans/Rocket Mortgage",
        "comments": None,
    }
    income = {
        "owner_label": "Self",
        "income_type": "Pension",
        "income_detail": None,
        "payer": "City of Burlington Vermont",
        "payer_location": "Burlington, VT",
        "amount_raw": "$6,408.12",
        "amount_kind": "exact",
        "amount_low": 6408.12,
        "amount_high": 6408.12,
        "comments": None,
    }
    position = {
        "position_dates": "Aug 2016 to present",
        "is_current": True,
        "position_held": "Trustee",
        "entity": "Islands Family Trust",
        "entity_location": "North Hero, Vermont",
        "entity_type": "Trust",
        "comments": None,
    }
    trip = {
        "departed": date(2025, 5, 22),
        "returned": date(2025, 5, 28),
        "travelers": "Self, Spouse",
        "travel_type": "Privately-Sponsored",
        "itinerary": "DC to Dublin & return",
        "reimbursed_for": "Airfare",
        "sponsor": "Robert Tressell Organizing Committee",
        "sponsor_location": "Dublin, Ireland",
        "comments": None,
    }
    _use_rows(
        [_summary_row()],
        {
            # Order matters: the net-worth query also names mart.annual_disclosure.
            "mart.annual_net_worth": [worth],
            "mart.annual_asset": [asset],
            "mart.annual_liability": [debt],
            "mart.annual_income": [income],
            "mart.annual_position": [position],
            "mart.annual_agreement": [],
            "mart.annual_gift": [],
            "mart.annual_travel": [trip],
            "mart.member_annual_disclosures": [
                _annual_summary(chamber="senate", source="senate_efd")
            ],
            "mart.annual_disclosure": [],
        },
    )
    latest = client.get("/api/v1/members/S001213/annual-disclosures").json()["latest"]
    assert latest["covers_year"] == 2025 and latest["net_low"] == 162029
    assert latest["assets"][0]["asset_name"] == "CREF Stock Account - R1"
    assert latest["liabilities_list"][0]["creditor"] == "Quicken Loans/Rocket Mortgage"
    assert latest["source_url"] == url
    # ADR 0030: the rest of a Senate report; a part with no rows is an empty list.
    assert latest["income"][0]["payer"] == "City of Burlington Vermont"
    assert latest["income"][0]["amount_kind"] == "exact"
    assert latest["positions"][0]["is_current"] is True
    assert latest["agreements"] == [] and latest["gifts"] == []
    assert latest["travel"][0]["departed"] == "2025-05-22"

    # A House report is not read past Schedules A and D yet: its sections are null, not empty.
    worth["source"] = "house_clerk"
    latest = client.get("/api/v1/members/S001213/annual-disclosures").json()["latest"]
    assert latest["assets"] and latest["income"] is None and latest["travel"] is None
