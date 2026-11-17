"""The SEC industry lookup (ADR 0032): parsing the SEC's files and storing traded companies."""

from __future__ import annotations

import json
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text

from ingest.congress_gov import RateLimiter
from ingest.db import connect
from ingest.sec import (
    SUBMISSIONS_URL,
    TICKERS_URL,
    SecClient,
    normalise_ticker,
    parse_submissions,
    parse_tickers,
    user_agent,
)
from ingest.shape import SourceShapeError
from ingest.sources import sec_industry

# Invented companies in the shape of the SEC's files (checked against the published format).
TICKERS = {
    "0": {"cik_str": 900001, "ticker": "MSLE", "title": "Example Missiles Corp"},
    "1": {"cik_str": 900002, "ticker": "BRK-B", "title": "Example Holdings Inc"},
    "2": {"cik_str": 900003, "ticker": "FNDX", "title": "Example Index Trust"},
}
SUBMISSIONS = {
    900001: {
        "cik": "0000900001",
        "name": "Example Missiles Corp",
        "sic": "3760",
        "sicDescription": "Guided Missiles & Space Vehicles & Parts",
        "tickers": ["MSLE"],
    },
    900002: {
        "cik": "0000900002",
        "name": "Example Holdings Inc",
        "sic": "6331",
        "sicDescription": "Fire, Marine & Casualty Insurance",
        "tickers": ["BRK-A", "BRK-B"],
    },
    900003: {
        "cik": "0000900003",
        "name": "Example Index Trust",
        "sic": "",
        "sicDescription": "",
        "tickers": ["FNDX"],
    },
}


def _client(requested: list[str]) -> SecClient:
    def fetch(url: str) -> bytes:
        requested.append(url)
        if url == TICKERS_URL:
            return json.dumps(TICKERS).encode()
        for cik, body in SUBMISSIONS.items():
            if url == SUBMISSIONS_URL.format(cik=cik):
                return json.dumps(body).encode()
        raise AssertionError(f"unexpected request {url}")

    return SecClient("project@example.test", fetch=fetch, limiter=RateLimiter(10_000, 1.0))


# --- parsing -------------------------------------------------------------------------------------


def test_the_user_agent_names_the_project_and_its_contact() -> None:
    assert user_agent("project@example.test") == "Term (term-tracker) project@example.test"


@pytest.mark.parametrize("raw", ["brk.b", "BRK/B", " BRK-B "])
def test_a_class_separator_is_one_form(raw: str) -> None:
    assert normalise_ticker(raw) == "BRK-B"


def test_the_ticker_list_maps_each_ticker_to_its_company() -> None:
    assert parse_tickers(TICKERS)["BRK-B"] == (900002, "Example Holdings Inc")


def test_a_changed_ticker_list_is_refused() -> None:
    with pytest.raises(SourceShapeError):
        parse_tickers({"0": {"cik": 1, "symbol": "X"}})


def test_a_company_without_an_industry_keeps_a_null_sic() -> None:
    company = parse_submissions(SUBMISSIONS[900003], 900003)
    assert company.sic is None and company.sic_description is None


def test_a_sic_code_that_is_not_four_digits_is_refused() -> None:
    with pytest.raises(SourceShapeError, match="four digits"):
        parse_submissions({**SUBMISSIONS[900001], "sic": "37A0"}, 900001)


# --- storing -------------------------------------------------------------------------------------

STORED = ("MSLE", "BRK-B", "FNDX")


@pytest.fixture
def clean(migrated_engine: Engine) -> Iterator[None]:
    def wipe() -> None:
        with migrated_engine.begin() as conn:
            conn.execute(
                text("DELETE FROM raw.sec_company WHERE ticker = ANY(:t)"), {"t": [*STORED, "GONE"]}
            )

    wipe()
    try:
        yield
    finally:
        wipe()


@pytest.mark.integration
def test_each_traded_ticker_is_looked_up_once(migrated_engine: Engine, clean: None) -> None:
    requested: list[str] = []
    with connect() as conn:
        sec_industry.load(conn, _client(requested), tickers={"MSLE", "BRK-B", "FNDX", "GONE"})
    # The list once, then one submissions file per listed company; GONE is not listed.
    assert requested[0] == TICKERS_URL and len(requested) == 4
    with migrated_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT ticker, cik, sic, sic_description FROM raw.sec_company "
                "WHERE ticker = ANY(:t) ORDER BY ticker"
            ),
            {"t": list(STORED)},
        ).all()
    assert [tuple(r) for r in rows] == [
        ("BRK-B", "0000900002", "6331", "Fire, Marine & Casualty Insurance"),
        ("FNDX", "0000900003", None, None),
        ("MSLE", "0000900001", "3760", "Guided Missiles & Space Vehicles & Parts"),
    ]
    requested.clear()
    with connect() as conn:
        sec_industry.load(conn, _client(requested), tickers={"MSLE", "BRK-B", "FNDX", "GONE"})
    # The next night: GONE is still asked about through the list, nothing else is fetched.
    assert requested == [TICKERS_URL]
    requested.clear()
    with connect() as conn:
        sec_industry.load(conn, _client(requested), tickers={"MSLE"})
    assert requested == []  # every ticker stored: not even the list
