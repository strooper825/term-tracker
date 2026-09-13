"""House and Senate vote sources: parsing, session walking, and shape validation (no DB)."""

from __future__ import annotations

import json

import httpx
import pytest

from ingest.congress_gov import CongressGovClient, RateLimiter
from ingest.sources import house_votes, senate_votes
from tests.fixtures.votes import (
    CONGRESS,
    house_client,
    senate_client,
    senate_fixture_fetch,
)


def test_house_session_list_is_paged_and_validated() -> None:
    client = house_client()
    session_1 = house_votes.fetch_session_votes(client, CONGRESS, 1)
    assert sorted(i["rollCallNumber"] for i in session_1) == [2, 122, 240, 353]
    assert client.requests_made == 2  # two pages
    assert house_votes.fetch_session_votes(client, CONGRESS, 3) == []


def test_house_members_include_tracked_member_and_raw_vocabulary() -> None:
    client = house_client()
    speaker = house_votes.fetch_members(client, CONGRESS, 1, 2)
    steil = next(r for r in speaker["results"] if r["bioguideID"] == "S001213")
    assert steil["voteCast"] == "Johnson (LA)"  # Speaker election: a name, not Yea/Nay
    recorded = house_votes.fetch_members(client, CONGRESS, 1, 122)
    assert {r["voteCast"] for r in recorded["results"]} <= {"Aye", "No", "Not Voting"}


def test_senate_menu_and_vote_parse() -> None:
    client = senate_client()
    menu = senate_votes.fetch_menu(client, CONGRESS, 1)
    assert menu is not None
    assert sorted(int(v["vote_number"]) for v in menu["votes"]["vote"]) == [1, 237]
    assert senate_votes.fetch_menu(client, CONGRESS, 3) is None  # 404 -> no such session

    vote = senate_votes.fetch_vote(client, CONGRESS, 1, 1)
    assert vote["vote_date"].startswith("January 9, 2025")
    cotton = next(m for m in vote["members"]["member"] if m["lis_member_id"] == "S374")
    assert cotton["vote_cast"] in {"Yea", "Nay", "Present", "Not Voting"}
    assert vote["document"]["document_type"] == "S."


def test_senate_paths() -> None:
    assert senate_votes.menu_path(119, 2) == "roll_call_lists/vote_menu_119_2.xml"
    assert senate_votes.vote_path(119, 1, 7) == "roll_call_votes/vote1191/vote_119_1_00007.xml"


def test_senate_redirect_to_file_not_found_means_no_session() -> None:
    def fetch(url: str) -> str:
        request = httpx.Request("GET", url)
        response = httpx.Response(
            302,
            request=request,
            headers={"Location": "https://www.senate.gov/pagelayout/general/file_not_found.htm"},
        )
        raise httpx.HTTPStatusError("302", request=request, response=response)

    client = senate_votes.SenateGovClient(fetch=fetch, limiter=RateLimiter(10))
    assert senate_votes.fetch_menu(client, CONGRESS, 3) is None


def test_senate_non_404_errors_propagate() -> None:
    def fetch(url: str) -> str:
        request = httpx.Request("GET", url)
        raise httpx.HTTPStatusError(
            "503", request=request, response=httpx.Response(503, request=request)
        )

    client = senate_votes.SenateGovClient(fetch=fetch, limiter=RateLimiter(10))
    with pytest.raises(httpx.HTTPStatusError):
        senate_votes.fetch_menu(client, CONGRESS, 1)


@pytest.mark.parametrize(
    "body",
    [
        {"houseRollCallVotes": [{"congress": 119, "sessionNumber": 1}], "pagination": {"count": 1}},
        {
            "houseRollCallVotes": [
                {"congress": 118, "sessionNumber": 1, "rollCallNumber": 1, "url": "u"}
            ],
            "pagination": {"count": 1},
        },
    ],
)
def test_house_list_shape_changes_stop_the_run(body: dict) -> None:
    client = CongressGovClient("k", fetch=lambda url: json.dumps(body), limiter=RateLimiter(10))
    with pytest.raises(house_votes.SourceShapeError):
        house_votes.fetch_session_votes(client, CONGRESS, 1)
    client.close()


def test_house_members_shape_change_stops_the_run() -> None:
    body = {
        "houseRollCallVoteMemberVotes": {
            "congress": 119,
            "sessionNumber": 1,
            "rollCallNumber": 1,
            "results": [{"bioguideID": "S001213"}],
        }
    }
    client = CongressGovClient("k", fetch=lambda url: json.dumps(body), limiter=RateLimiter(10))
    with pytest.raises(house_votes.SourceShapeError, match="shape differs"):
        house_votes.fetch_members(client, CONGRESS, 1, 1)
    client.close()


@pytest.mark.parametrize(
    ("text", "root"),
    [
        ("<not-xml", "roll_call_vote"),
        ("<other><congress>119</congress></other>", "roll_call_vote"),
        (
            "<roll_call_vote><congress>119</congress><session>1</session><vote_number>1</vote_number></roll_call_vote>",
            "roll_call_vote",
        ),
    ],
)
def test_senate_shape_changes_stop_the_run(text: str, root: str) -> None:
    client = senate_votes.SenateGovClient(fetch=lambda url: text, limiter=RateLimiter(10))
    with pytest.raises(senate_votes.SourceShapeError):
        senate_votes.fetch_vote(client, CONGRESS, 1, 1)


def test_senate_fixture_fetch_serves_real_menu() -> None:
    text = senate_fixture_fetch(senate_votes.BASE_URL + senate_votes.menu_path(CONGRESS, 2))
    assert "<vote_summary>" in text


MIXED_CONTENT_MENU = (
    "<vote_summary><congress>119</congress><session>1</session><congress_year>2025</congress_year>"
    "<votes><vote><vote_number>00003</vote_number><vote_date>15-Jan</vote_date><issue>S. 5</issue>"
    "<question>On the Amendment<measure>S.Amdt. 14</measure></question><result>Agreed to</result>"
    "<vote_tally><yeas>70</yeas><nays>25</nays></vote_tally><title>Cornyn Amdt. No. 14</title>"
    "</vote></votes></vote_summary>"
)


def test_senate_menu_accepts_mixed_content_question() -> None:
    """Amendment votes nest <measure> inside <question>; the menu is stored verbatim."""
    client = senate_votes.SenateGovClient(
        fetch=lambda url: MIXED_CONTENT_MENU, limiter=RateLimiter(10)
    )
    menu = senate_votes.fetch_menu(client, CONGRESS, 1)
    assert menu is not None
    question = menu["votes"]["vote"][0]["question"]
    assert question == {"#text": "On the Amendment", "measure": "S.Amdt. 14"}


EN_BLOC_VOTE = (
    "<roll_call_vote><congress>119</congress><session>1</session><vote_number>522</vote_number>"
    "<vote_date>October 7, 2025,  05:12 PM</vote_date><question>On the Cloture Motion</question>"
    "<vote_result>Cloture Motion Rejected</vote_result>"
    "<document><document_type>PN</document_type><document_number>55-25</document_number></document>"
    "<document><document_type>PN</document_type><document_number>12-19</document_number></document>"
    "<members><member><lis_member_id>S374</lis_member_id><vote_cast>Yea</vote_cast></member></members>"
    "</roll_call_vote>"
)


def test_senate_vote_accepts_multiple_documents() -> None:
    """En bloc votes repeat <document>; the record is stored verbatim with a list."""
    client = senate_votes.SenateGovClient(fetch=lambda url: EN_BLOC_VOTE, limiter=RateLimiter(10))
    vote = senate_votes.fetch_vote(client, CONGRESS, 1, 522)
    assert isinstance(vote["document"], list) and len(vote["document"]) == 2
