"""OpenFEC client and source: key handling, pagination, selection rules, shapes."""

from __future__ import annotations

import json

import pytest

from ingest.congress_gov import RateLimiter
from ingest.fec import BASE_URL, FecClient, candidate_page_url, committee_page_url
from ingest.sources import fec as src
from tests.fixtures.fec import CYCLE, PRINCIPAL, fixture_client, fixture_name


def _client(pages: dict[str, dict]) -> FecClient:
    def fetch(url: str) -> str:
        return json.dumps(pages[url])

    return FecClient(
        "secret-key", fetch=fetch, hourly=RateLimiter(10**6), per_minute=RateLimiter(10**6, 60)
    )


def test_api_key_travels_in_header_not_url() -> None:
    client = _client({})
    url = client.url("candidate/H8WI01156/committees", cycle=2026, page=None)
    assert "secret-key" not in url
    assert url == f"{BASE_URL}/candidate/H8WI01156/committees/?cycle=2026"
    assert client._http.headers["X-Api-Key"] == "secret-key"
    client.close()


def test_results_follow_pagination_pages() -> None:
    base = f"{BASE_URL}/committee/C1/totals/?per_page=100&page="
    client = _client(
        {
            base + "1&cycle=2026": {"results": [{"a": 1}], "pagination": {"pages": 2}},
            base + "2&cycle=2026": {"results": [{"a": 2}], "pagination": {"pages": 2}},
        }
    )
    assert client.results("committee/C1/totals", cycle=2026) == [{"a": 1}, {"a": 2}]
    assert client.requests_made == 2


def test_both_rate_limiters_are_consulted() -> None:
    calls: list[str] = []

    class Spy(RateLimiter):
        def __init__(self, name: str) -> None:
            super().__init__(10**6)
            self.name = name

        def acquire(self) -> None:
            calls.append(self.name)

    client = FecClient(
        "k", fetch=lambda url: '{"results": []}', hourly=Spy("h"), per_minute=Spy("m")
    )
    client.get("candidate/X")
    assert calls == ["h", "m"]


def test_public_page_urls() -> None:
    assert (
        candidate_page_url("H8WI01156", 2026)
        == "https://www.fec.gov/data/candidate/H8WI01156/?cycle=2026&election_full=false"
    )
    assert (
        committee_page_url("C00677286", 2026)
        == "https://www.fec.gov/data/committee/C00677286/?cycle=2026"
    )


def test_fixture_names() -> None:
    assert fixture_name(f"{BASE_URL}/candidate/H8WI01156/") == "candidate__H8WI01156.json"
    assert (
        fixture_name(f"{BASE_URL}/candidate/H8WI01156/committees/?per_page=100&page=1&cycle=2026")
        == "candidate__H8WI01156__committees__cycle=2026.json"
    )


def test_candidate_committees_totals_from_fixtures() -> None:
    client = fixture_client()
    for bioguide, (candidate_id, committee_id) in PRINCIPAL.items():
        candidate = src.fetch_candidate(client, candidate_id)
        assert candidate is not None and candidate["office"] == candidate_id[0], bioguide
        committees = src.fetch_candidate_committees(client, candidate_id, CYCLE)
        principal = src.select_principal_committee(committees)
        assert principal is not None and principal["committee_id"] == committee_id, bioguide
        totals = src.fetch_committee_totals(client, committee_id, CYCLE)
        assert totals is not None and totals["cycle"] == CYCLE and totals["receipts"] > 0


def test_cotton_house_id_is_not_the_senate_candidate() -> None:
    """The old House id H2AR04083 stays in raw but is never the current-office candidate."""
    client = fixture_client()
    house = src.fetch_candidate(client, "H2AR04083")
    senate = src.fetch_candidate(client, "S4AR00103")
    assert house is not None and senate is not None
    assert src.select_candidate("senate", [house, senate])["candidate_id"] == "S4AR00103"
    assert src.select_candidate("house", [senate]) is None


def test_two_candidates_for_one_office_stop_the_run() -> None:
    a = {"candidate_id": "S4AR00103", "office": "S"}
    b = {"candidate_id": "S6AR00999", "office": "S"}
    with pytest.raises(src.SourceShapeError, match="2 FEC candidate ids with office S"):
        src.select_candidate("senate", [a, b])


def test_two_principal_committees_stop_the_run() -> None:
    committees = [
        {"committee_id": "C1", "designation": "P"},
        {"committee_id": "C2", "designation": "P"},
        {"committee_id": "C3", "designation": "D"},
    ]
    with pytest.raises(src.SourceShapeError, match="2 principal campaign committees"):
        src.select_principal_committee(committees)
    assert src.select_principal_committee(committees[2:]) is None


def test_kiley_leadership_pac_is_listed_but_not_principal() -> None:
    client = fixture_client()
    committees = src.fetch_candidate_committees(client, "H2CA03157", CYCLE)
    designations = {c["committee_id"]: c["designation"] for c in committees}
    assert designations == {"C00801985": "P", "C00818328": "D"}


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("candidate/H8WI01156", {"results": [{"candidate_id": "H8WI01156", "name": "X"}]}),
        (
            "candidate/H8WI01156",
            {"results": [{"candidate_id": "H8WI01156", "name": "X", "office": "Z"}]},
        ),
        (
            "candidate/H8WI01156",
            {"results": [{"candidate_id": "OTHER0001", "name": "X", "office": "H"}]},
        ),
    ],
)
def test_candidate_shape_changes_stop_the_run(path: str, body: dict) -> None:
    client = _client({f"{BASE_URL}/{path}/": body})
    with pytest.raises(src.SourceShapeError):
        src.fetch_candidate(client, "H8WI01156")


def test_missing_candidate_and_unfiled_cycle_are_none() -> None:
    client = _client(
        {
            f"{BASE_URL}/candidate/H0000000/": {"results": []},
            f"{BASE_URL}/committee/C1/totals/?per_page=100&page=1&cycle=2026": {
                "results": [],
                "pagination": {"pages": 1},
            },
        }
    )
    assert src.fetch_candidate(client, "H0000000") is None
    assert src.fetch_committee_totals(client, "C1", 2026) is None


def test_totals_for_another_cycle_stop_the_run() -> None:
    body = {"results": [{"committee_id": "C1", "cycle": 2024}], "pagination": {"pages": 1}}
    client = _client({f"{BASE_URL}/committee/C1/totals/?per_page=100&page=1&cycle=2026": body})
    with pytest.raises(src.SourceShapeError, match="another committee or cycle"):
        src.fetch_committee_totals(client, "C1", 2026)
