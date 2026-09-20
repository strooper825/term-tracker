"""Census sources without a database: the boundary builder, the Data API client, and the ACS
assembler, all against the synthetic fixtures in tests/fixtures/census (no network)."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

import httpx
import pytest

from ingest.census import (
    ACS_CONGRESS,
    GEOGRAPHY_CONGRESS,
    CensusClient,
    SourceShapeError,
    congress_for,
    geoid,
)
from ingest.http import fetch_text
from ingest.sources import census_acs, census_geography
from tests.fixtures.census import (
    ACS_MINIMUMS,
    CONGRESS,
    GEOGRAPHY_MINIMUMS,
    SENTINEL,
    YEAR,
    FixtureFiles,
    acs_fetch,
    census_client,
)

NOW = datetime(2026, 9, 21, tzinfo=UTC)


def _shapes(files: FixtureFiles):
    urls = census_geography.file_urls(YEAR, CONGRESS)
    return urls, {k: census_geography.read_shapefile(files.download(u)) for k, u in urls.items()}


def _built():
    files = FixtureFiles()
    urls, shapes = _shapes(files)
    return census_geography.build_rows(
        CONGRESS,
        shapes["state"],
        shapes["district"],
        shapes["county"],
        urls=urls,
        source_modified="stamp",
        fetched_at=NOW,
        minimums=GEOGRAPHY_MINIMUMS,
    )


def test_file_urls_name_the_vintage_and_the_congress() -> None:
    urls = census_geography.file_urls(2025, 119)
    assert (
        urls["district"]
        == "https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_cd119_500k.zip"
    )
    assert urls["state"].endswith("/GENZ2025/shp/cb_2025_us_state_500k.zip")
    assert urls["county"].endswith("/GENZ2025/shp/cb_2025_us_county_500k.zip")


def test_read_shapefile_returns_attributes_and_shapes() -> None:
    _, shapes = _shapes(FixtureFiles())
    states = {rec["STATEFP"]: (rec, geom) for rec, geom in shapes["state"]}
    assert set(states) == {"55", "05", "50", "26", "06", "36"}
    rec, geom = states["55"]
    assert rec["NAME"] == "Wisconsin" and rec["STUSPS"] == "WI"
    assert geom.bounds == pytest.approx((-92.9, 42.5, -86.8, 46.9))
    assert len(shapes["county"]) == 12


def test_build_rows_makes_a_state_row_and_a_district_row_of_finished_paths() -> None:
    built = _built()
    rows = {r["geoid"]: r for r in built.rows}
    # 6 states, and 4 districts (the ZZ "not defined" area is skipped)
    assert (built.states, built.districts, built.counties) == (6, 4, 12)
    assert set(rows) == {"55", "05", "50", "26", "06", "36", "5501", "0603", "3608", "5000"}
    assert {r["kind"] for r in built.rows} == {"state", "district"}
    assert all(r["congress"] == CONGRESS and r["source_modified"] == "stamp" for r in built.rows)

    wisconsin = rows["55"]["payload"].obj
    assert wisconsin["name"] == "Wisconsin"
    assert wisconsin["outline"].startswith("M") and wisconsin["outline"].endswith("Z")
    assert 0 < wisconsin["frame"]["width"] <= 308 and 0 < wisconsin["frame"]["height"] <= 308
    assert max(wisconsin["frame"].values()) == pytest.approx(308, abs=1)  # longest side + padding
    assert [c["name"] for c in wisconsin["counties"]] == [
        "West Wisconsin County",
        "East Wisconsin County",
    ]
    assert rows["55"]["source_url"].endswith("cb_2025_us_state_500k.zip")

    wi1 = rows["5501"]["payload"].obj
    assert wi1["state_geoid"] == "55" and wi1["name"] == "Congressional District 1"
    assert wi1["in_state"].startswith("M")  # the district in the state's frame
    assert rows["5501"]["source_url"].endswith("cb_2025_us_cd119_500k.zip")
    assert wi1["county_source_url"].endswith("cb_2025_us_county_500k.zip")


def test_a_district_view_holds_only_the_counties_it_touches_clipped_to_it() -> None:
    rows = {r["geoid"]: r["payload"].obj for r in _built().rows}
    # WI-1 is the west half of Wisconsin, which is exactly the west county: the east county is
    # only edge-adjacent (a line), so it does not appear
    assert [c["geoid"] for c in rows["5501"]["counties"]] == ["55001"]
    # the at-large district is the whole state: both counties
    assert [c["geoid"] for c in rows["5000"]["counties"]] == ["50001", "50003"]
    # each view fills its own frame
    assert max(rows["5501"]["frame"].values()) == pytest.approx(308, abs=1)
    # the district drawn inside the state view is smaller than the district view of it
    assert len(rows["5501"]["in_state"]) <= len(rows["5501"]["outline"]) + 20


def test_build_rows_refuses_a_file_that_is_too_small() -> None:
    files = FixtureFiles()
    urls, shapes = _shapes(files)
    with pytest.raises(SourceShapeError, match="expected at least 50 states"):
        census_geography.build_rows(
            CONGRESS,
            shapes["state"],
            shapes["district"],
            shapes["county"],
            urls=urls,
            source_modified="",
            fetched_at=NOW,
        )


def test_build_rows_stops_when_the_district_column_is_for_another_congress() -> None:
    files = FixtureFiles()
    urls, shapes = _shapes(files)
    with pytest.raises(SourceShapeError, match="no CD120FP column"):
        census_geography.build_rows(
            120,
            shapes["state"],
            shapes["district"],
            shapes["county"],
            urls=urls,
            source_modified="",
            fetched_at=NOW,
            minimums=GEOGRAPHY_MINIMUMS,
        )


def test_an_unknown_vintage_stops_the_run_rather_than_guessing() -> None:
    assert congress_for(GEOGRAPHY_CONGRESS, 2025, "x") == 119
    assert congress_for(ACS_CONGRESS, 2024, "x") == 119
    with pytest.raises(SourceShapeError, match="ACS 5-year 2025 is not in the table"):
        congress_for(ACS_CONGRESS, 2025, "ACS 5-year")


# ---- Data API client ------------------------------------------------------------------------


def test_request_url_encodes_the_geography_and_carries_the_key() -> None:
    client = CensusClient("SECRETKEY")
    url = client.url("2024/acs/acs5/profile", ["DP05_0001E", "DP05_0001M"], "district")
    assert url == (
        "https://api.census.gov/data/2024/acs/acs5/profile"
        "?get=NAME,DP05_0001E,DP05_0001M&for=congressional%20district:*&in=state:*&key=SECRETKEY"
    )
    assert client.url("2024/acs/acs5", ["B03002_001E"], "state").endswith(
        "?get=NAME,B03002_001E&for=state:*&key=SECRETKEY"
    )
    with pytest.raises(ValueError, match="variables"):
        client.table("2024/acs/acs5", [f"B{n}" for n in range(50)], "state")


def test_geoid_joins_state_and_district() -> None:
    assert geoid({"state": "55", "congressional district": "01"}) == "5501"
    assert geoid({"state": "55"}) == "55"
    assert geoid({"state": "02", "congressional district": "00"}) == "0200"


def test_table_parses_the_array_of_arrays_and_rejects_other_shapes() -> None:
    body = json.dumps([["NAME", "X", "state"], ["Wisconsin", "5", "55"]])
    client = CensusClient("k", fetch=lambda url: body)
    assert client.table("2024/acs/acs5", ["X"], "state") == [
        {"NAME": "Wisconsin", "X": "5", "state": "55"}
    ]
    assert client.requests_made == 1
    for bad, match in [
        ("<html>Missing Key</html>", "not JSON"),
        ("[]", "header row"),
        (json.dumps([["NAME", "state"], ["W", "55"]]), "columns missing"),
        (json.dumps([["NAME", "X", "state"], ["W", "5"]]), "a row has 2 values for 3"),
    ]:
        with pytest.raises(SourceShapeError, match=match):
            CensusClient("k", fetch=lambda url, b=bad: b).table("p", ["X"], "state")


def test_the_key_never_reaches_an_error_or_a_log(caplog: pytest.LogCaptureFixture) -> None:
    """The key is in the URL, so a failing request must not echo it (meta.ingest_run.error is
    stored in the database)."""
    key = "abc123SECRETKEY"

    def handler(request: httpx.Request) -> httpx.Response:
        assert key in str(request.url)
        return httpx.Response(400, text=f"error: unknown variable; key {key} was invalid")

    client = CensusClient(key)
    client._http = httpx.Client(transport=httpx.MockTransport(handler))
    client._fetch = client._http_fetch
    # Alembic's fileConfig (run by the integration fixtures earlier in a full session) disables
    # the loggers that already exist; switch them back on so the assertions below are not vacuous.
    for name in ("httpx", "ingest.http"):
        logging.getLogger(name).disabled = False
    caplog.set_level(logging.DEBUG)
    with pytest.raises(RuntimeError) as failure:
        client.table("2024/acs/acs5/profile", ["DP05_0001E"], "state")
    assert key not in str(failure.value) and "HTTP 400" in str(failure.value)
    # httpx logs every request URL itself; the filter in ingest/census.py masks the key
    assert "HTTP Request: GET" in caplog.text and "key=***" in caplog.text
    assert key not in caplog.text

    # a retried server error logs the redacted URL
    calls = []

    def flaky(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return (
            httpx.Response(200, json=[["NAME", "X", "state"], ["W", "1", "55"]])
            if len(calls) > 1
            else httpx.Response(503)
        )

    client._http = httpx.Client(transport=httpx.MockTransport(flaky))
    client._fetch = lambda url: fetch_text(
        url, client=client._http, sleep=lambda _: None, log_url=url.replace(key, "***")
    )
    caplog.clear()
    assert client.table("p", ["X"], "state")[0]["X"] == "1"
    assert "retrying" in caplog.text and "key=***" in caplog.text
    assert key not in caplog.text


# ---- ACS assembler --------------------------------------------------------------------------


def test_fetch_all_makes_four_requests_and_merges_by_geography() -> None:
    client = census_client()
    merged = census_acs.fetch_all(client, 2024, ACS_MINIMUMS)
    assert client.requests_made == 4  # profile and detail, for states and for districts
    assert {k for k in merged if k[0] == "state"} == {
        ("state", f) for f in ("55", "05", "50", "26", "06", "36")
    }
    assert {g for kind, g in merged if kind == "district"} == {"5501", "0603", "3608", "5000"}
    # the response also holds a ZZ row (no district: water-only), which is not loaded
    assert ("district", "26ZZ") not in merged
    wi1 = merged[("district", "5501")]
    assert wi1["name"].startswith("Congressional District 01") or "Wisconsin" in wi1["name"]
    assert set(wi1) == {"name", "profile", "detail"}
    assert wi1["profile"]["DP05_0001E"] == "700000" and wi1["profile"]["DP05_0001M"] == "7001.0"
    assert wi1["detail"]["B03002_001E"] == "700000"
    # the API's "could not compute" sentinel is kept verbatim (dbt turns it into null)
    assert merged[("district", "5000")]["profile"]["DP03_0062E"] == SENTINEL


def test_every_variable_is_requested_with_its_margin_and_within_the_limit() -> None:
    for _, (_, variables) in census_acs.DATASETS.items():
        assert len(variables) <= 49
        estimates = [v for v in variables if v[-1] == "E"] + [
            v for v in variables if v.endswith("PE")
        ]
        for estimate in set(estimates):
            assert estimate[:-1] + "M" in variables


def test_fetch_all_refuses_a_thin_national_response() -> None:
    with pytest.raises(SourceShapeError, match="expected at least 51 states and 435 districts"):
        census_acs.fetch_all(census_client(), 2024)


def test_fetch_all_stops_when_one_table_lacks_a_geography() -> None:
    def fetch(url: str) -> str:
        rows = json.loads(acs_fetch(url))
        if "B03002_001E" in url and "congressional" in url:
            rows.pop(1)  # the detail table drops WI-1
        return json.dumps(rows)

    with pytest.raises(SourceShapeError, match="not the other"):
        census_acs.fetch_all(census_client(fetch), 2024, ACS_MINIMUMS)
