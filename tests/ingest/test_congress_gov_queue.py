"""Incremental bills ingest (ADR 0023): what counts as changed, the queue, the watermark.

The database tests run on a Congress number nothing else loads, so they start from an empty
``raw`` whatever the other tests left behind; the fake fetch answers that Congress's records
from the 119th's fixtures.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy import Engine, text

from api.config import Settings
from ingest.congress_gov import BASE_URL, CongressGovClient, RateLimiter
from ingest.db import connect
from ingest.freshness import QUEUE_MAX_WAIT, queue_problems, queue_report, read_queue
from ingest.sources import congress_gov as src
from ingest.sources import congress_gov_queue as queue
from tests.fixtures.congress_gov import fixture_fetch

CONGRESS = 121  # no fixture, seed or other test uses it
DAY0 = datetime(2027, 3, 1, 6, 0, tzinfo=UTC)
BILLS = ["bill/121/hr/4735", "bill/121/hr/5269", "bill/121/s/2274"]
AMENDMENT = "amendment/121/hamdt/9"
# detail + actions + cosponsors + summaries for a bill; an amendment has no summaries
BILL_REQUESTS = 4
AMENDMENT_REQUESTS = 3


@pytest.mark.parametrize(
    ("stored", "listed", "recent_from", "expected"),
    [
        (None, "2027-03-01", None, True),  # never held
        ("2027-02-27T09:00:00Z", None, None, True),  # the list says nothing: read it
        ("2027-02-27T09:00:00Z", "2027-03-01", None, True),  # held copy is from an earlier day
        ("2027-03-01T09:00:00Z", "2027-02-27", None, False),  # held copy is newer than the list
        # same day: the list cannot say whether it moved again after it was read
        ("2027-03-01T09:00:00Z", "2027-03-01", date(2027, 2, 28), True),  # inside the window
        ("2027-03-01T09:00:00Z", "2027-03-01", date(2027, 3, 2), False),  # older than the window
        ("2027-03-01T09:00:00Z", "2027-03-01", None, False),  # a sweep with no window
        # amendments carry a timestamp on the list too, so they compare exactly
        ("2027-03-01T09:00:00Z", "2027-03-01T09:00:00Z", date(2027, 2, 28), False),
        ("2027-03-01T09:00:00Z", "2027-03-01T09:00:01Z", None, True),
        ("not a date", "2027-03-01", None, True),
    ],
)
def test_needs_read(
    stored: str | None, listed: str | None, recent_from: date | None, expected: bool
) -> None:
    assert queue.needs_read(stored, listed, recent_from=recent_from) is expected


def test_the_mode_comes_from_the_environment_and_only_two_are_known(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BILL_INGEST_MODE", raising=False)
    assert Settings(_env_file=None).bill_ingest_mode == "full"  # the default changes nothing
    monkeypatch.setenv("BILL_INGEST_MODE", "incremental")
    monkeypatch.setenv("BILL_REQUEST_BUDGET", "1200")
    settings = Settings(_env_file=None)
    assert (settings.bill_ingest_mode, settings.bill_request_budget) == ("incremental", 1200)
    monkeypatch.setenv("BILL_INGEST_MODE", "sometimes")
    with pytest.raises(ValueError, match="bill_ingest_mode"):
        Settings(_env_file=None)


def test_run_hands_over_to_the_queue_in_incremental_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict] = []

    class Conn:
        def __enter__(self) -> Conn:
            return self

        def __exit__(self, *exc: object) -> None:
            return None

    settings = Settings(
        _env_file=None,
        congress_gov_api_key="k",
        bill_ingest_mode="incremental",
        bill_request_budget=77,
        current_congress=CONGRESS,
    )
    monkeypatch.setattr(src, "get_settings", lambda: settings)
    monkeypatch.setattr(src, "connect", Conn)
    monkeypatch.setattr(
        queue, "load", lambda conn, client, congress, **kw: calls.append({"c": congress, **kw}) or 5
    )
    monkeypatch.setattr(src, "load", lambda *a, **kw: pytest.fail("the full load ran"))
    assert src.run(full_refresh=True) == 5
    assert calls == [{"c": CONGRESS, "request_budget": 77, "full_refresh": True}]


# --- database tests ---------------------------------------------------------------------


class Api:
    """Congress.gov for one test: the two lists as given, records from the 119th's fixtures."""

    def __init__(self) -> None:
        self.bills: list[tuple[str, str]] = []  # (path, updateDate as the list gives it)
        self.amendments: list[tuple[str, str]] = []
        self.list_urls: list[str] = []
        self.broken: set[str] = set()  # record paths that answer 500
        self.lists_down = False

    def fetch(self, url: str) -> str:
        parsed = urlparse(url)
        path = parsed.path.removeprefix(urlparse(BASE_URL).path).strip("/")
        if path in (f"bill/{CONGRESS}", f"amendment/{CONGRESS}"):
            if self.lists_down:
                raise RuntimeError("list endpoint down")
            self.list_urls.append(url)
            key, items = (
                ("bills", self.bills)
                if path.startswith("bill")
                else ("amendments", self.amendments)
            )
            body = [{"url": f"{BASE_URL}/{p}?format=json", "updateDate": d} for p, d in items]
            return json.dumps({key: body, "pagination": {"count": len(body)}})
        if path in self.broken:
            request = httpx.Request("GET", url)
            raise httpx.HTTPStatusError(
                "HTTP 500", request=request, response=httpx.Response(500, request=request)
            )
        return fixture_fetch(url.replace(f"/{CONGRESS}/", "/119/"))

    def client(self) -> CongressGovClient:
        return CongressGovClient("test-key-not-real", fetch=self.fetch, limiter=RateLimiter(10**6))

    def since(self, index: int = -1) -> str | None:
        return parse_qs(urlparse(self.list_urls[index]).query).get("fromDateTime", [None])[0]


def _clear(engine: Engine) -> None:
    with engine.begin() as conn:
        for table in ("bill", "bill_actions", "bill_cosponsors", "bill_summaries"):
            conn.execute(text(f"DELETE FROM raw.{table} WHERE congress = :c"), {"c": CONGRESS})
        conn.execute(text("DELETE FROM meta.bill_refresh_queue"))
        conn.execute(text("DELETE FROM meta.ingest_cursor"))


@pytest.fixture
def api(migrated_engine: Engine, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[Api]:
    with migrated_engine.connect() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()
    _clear(migrated_engine)
    # roll calls loaded by other tests belong to the 119th; none exist for this Congress
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(tmp_path / "summary.md"))
    try:
        yield Api()
    finally:
        _clear(migrated_engine)
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})


def _run(api: Api, when: datetime, *, budget: int = 10_000) -> tuple[int, CongressGovClient]:
    client = api.client()
    with connect() as conn:
        rows = queue.load(conn, client, CONGRESS, request_budget=budget, now=when)
    return rows, client


def _state(engine: Engine) -> dict:
    with engine.connect() as conn:
        one: Callable[[str], object] = lambda sql: conn.execute(  # noqa: E731
            text(sql), {"c": CONGRESS}
        ).scalar_one()
        return {
            "held": one("SELECT count(*) FROM raw.bill WHERE congress = :c"),
            "queued": one("SELECT count(*) FROM meta.bill_refresh_queue WHERE congress = :c"),
            "changed": conn.execute(
                text(
                    "SELECT changed_through FROM meta.ingest_cursor "
                    "WHERE congress = :c AND kind = 'changed'"
                ),
                {"c": CONGRESS},
            ).scalar_one_or_none(),
            "resweep": conn.execute(
                text(
                    "SELECT changed_through FROM meta.ingest_cursor "
                    "WHERE congress = :c AND kind = 'resweep'"
                ),
                {"c": CONGRESS},
            ).scalar_one_or_none(),
            "status": one(
                "SELECT status FROM meta.ingest_run WHERE source = 'congress_gov_bills' "
                "ORDER BY id DESC LIMIT 1"
            ),
        }


def _summary() -> str:
    import os

    return Path(os.environ["GITHUB_STEP_SUMMARY"]).read_text(encoding="utf-8")


pytestmark_db = pytest.mark.integration


@pytestmark_db
def test_first_run_reads_the_whole_list_and_then_only_what_changed(
    migrated_engine: Engine, api: Api
) -> None:
    api.bills = [(path, "2027-02-20") for path in BILLS]
    api.amendments = [(AMENDMENT, "2027-02-20T10:00:00Z")]
    rows, client = _run(api, DAY0)

    # no watermark yet: both lists are asked whole, and everything listed is the backlog
    assert [api.since(0), api.since(1)] == [None, None]
    assert client.requests_made == 2 + 3 * BILL_REQUESTS + AMENDMENT_REQUESTS
    assert rows == 3 * BILL_REQUESTS + AMENDMENT_REQUESTS
    state = _state(migrated_engine)
    assert (state["held"], state["queued"], state["status"]) == (4, 0, "success")
    assert state["changed"] == DAY0 and state["resweep"] == DAY0
    assert "first incremental run" in _summary() and "queued 4 backfill" in _summary()
    assert "The queue is empty." in _summary()

    # Next night nothing is listed as changed: two requests, nothing read.
    api.bills, api.amendments = [], []
    _, client = _run(api, DAY0 + timedelta(days=1))
    assert client.requests_made == 2
    # the window opens six hours before the previous run began, written the one way the API takes
    assert api.since() == "2027-03-01T00:00:00Z"
    assert _state(migrated_engine)["changed"] == DAY0 + timedelta(days=1)
    assert _state(migrated_engine)["resweep"] == DAY0  # not a sweep night

    # A bill listed as updated today: its detail is read; its updateDate is the one held, so
    # its lists are not read again. An amendment listed with the timestamp held is not queued.
    with migrated_engine.connect() as conn:
        held_amendment = conn.execute(
            text(
                "SELECT payload ->> 'updateDate' FROM raw.bill "
                "WHERE congress = :c AND bill_type = 'hamdt'"
            ),
            {"c": CONGRESS},
        ).scalar_one()
    api.bills = [(BILLS[1], "2027-03-03")]
    api.amendments = [(AMENDMENT, held_amendment)]
    _, client = _run(api, DAY0 + timedelta(days=2))
    assert client.requests_made == 2 + 1
    assert "queued 1 changed" in _summary()

    # The same bill again, this time with a different updateDate held: all its lists are read.
    with migrated_engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE raw.bill SET payload = payload || :patch "
                "WHERE congress = :c AND bill_type = 'hr' AND bill_number = '5269'"
            ),
            {"patch": '{"updateDate": "2000-01-01T00:00:00Z"}', "c": CONGRESS},
        )
    _, client = _run(api, DAY0 + timedelta(days=3))
    assert client.requests_made == 2 + BILL_REQUESTS


@pytestmark_db
def test_a_run_that_spends_its_budget_leaves_the_rest_queued_for_the_next(
    migrated_engine: Engine, api: Api
) -> None:
    api.bills = [(path, "2027-02-20") for path in BILLS]
    api.amendments = [(AMENDMENT, "2027-02-20T10:00:00Z")]
    # the budget is checked before each record: one bill fits under 5, the second crosses it
    _run(api, DAY0, budget=5)
    state = _state(migrated_engine)
    assert (state["held"], state["queued"], state["status"]) == (2, 2, "success")
    assert state["changed"] == DAY0  # the listing was stored whole; only the reading is unfinished
    assert "Stopped at the request budget (5); still queued: 2 backfill." in _summary()

    api.bills, api.amendments = [], []
    _run(api, DAY0 + timedelta(days=1))
    state = _state(migrated_engine)
    assert (state["held"], state["queued"]) == (4, 0)


@pytestmark_db
def test_a_record_that_cannot_be_read_stays_queued_and_does_not_stop_the_others(
    migrated_engine: Engine, api: Api
) -> None:
    api.bills = [(path, "2027-02-20") for path in BILLS]
    api.broken = {BILLS[0]}
    _run(api, DAY0)
    state = _state(migrated_engine)
    assert (state["held"], state["queued"], state["status"]) == (2, 1, "success")
    with migrated_engine.connect() as conn:
        attempts, error = conn.execute(
            text("SELECT attempts, last_error FROM meta.bill_refresh_queue WHERE congress = :c"),
            {"c": CONGRESS},
        ).one()
    assert attempts == 1 and "HTTPStatusError" in error
    assert "COULD NOT BE READ and left queued: 1 (bill/121/hr/4735)" in _summary()

    api.bills, api.broken = [], set()
    _run(api, DAY0 + timedelta(days=1))
    state = _state(migrated_engine)
    assert (state["held"], state["queued"]) == (3, 0)


@pytestmark_db
def test_a_failed_listing_moves_nothing_so_the_next_run_asks_the_same_window(
    migrated_engine: Engine, api: Api
) -> None:
    api.bills = [(BILLS[0], "2027-02-20")]
    _run(api, DAY0)
    api.lists_down = True
    with pytest.raises(RuntimeError, match="list endpoint down"):
        _run(api, DAY0 + timedelta(days=1))
    state = _state(migrated_engine)
    assert state["status"] == "failed"
    assert state["changed"] == DAY0  # not the failed run's start

    api.lists_down = False
    _run(api, DAY0 + timedelta(days=2))
    assert api.since() == "2027-03-01T00:00:00Z"  # still six hours before DAY0
    assert _state(migrated_engine)["changed"] == DAY0 + timedelta(days=2)


@pytestmark_db
def test_the_weekly_sweep_reads_the_whole_list_and_reports_what_the_filter_missed(
    migrated_engine: Engine, api: Api
) -> None:
    api.bills = [(BILLS[0], "2027-02-20")]
    _run(api, DAY0)
    _run(api, DAY0 + timedelta(days=6))
    assert api.since() is not None  # six days on: still the filter

    # A week after the last sweep the whole list is asked. It holds a bill dated weeks ago
    # that was never brought in: the filter, or a run, missed it.
    # the bill already held is listed with a date no later than the copy held
    api.bills = [(BILLS[0], "2020-01-01"), (BILLS[2], "2027-02-10")]
    _, client = _run(api, DAY0 + timedelta(days=7))
    assert [api.since(-2), api.since(-1)] == [None, None]
    assert client.requests_made == 2 + BILL_REQUESTS
    state = _state(migrated_engine)
    assert (state["held"], state["queued"]) == (2, 0)
    assert state["resweep"] == DAY0 + timedelta(days=7)
    assert "RE-SWEEP FOUND 1 records the nightly filter had not brought in" in _summary()

    # The next sweep lists that bill with a date ahead of the record held (as the fixture's
    # own updateDate is older). It is read to check, found unchanged, and not called a miss.
    _run(api, DAY0 + timedelta(days=14))
    assert "Re-sweep: 1 records read to check; none had changed." in _summary()

    # A sweep whose list agrees with what is held reads nothing.
    api.bills = [(BILLS[0], "2020-01-01"), (BILLS[2], "2020-01-01")]
    _, client = _run(api, DAY0 + timedelta(days=21))
    assert client.requests_made == 2
    assert "Re-sweep: nothing the nightly filter had missed." in _summary()


@pytestmark_db
def test_a_bill_a_roll_call_names_is_queued_ahead_of_the_backlog(
    migrated_engine: Engine, api: Api, monkeypatch: pytest.MonkeyPatch
) -> None:
    named = src.LegislationKey("bill", CONGRESS, "s", "2274")
    monkeypatch.setattr(queue, "roll_call_legislation_keys", lambda conn, congress: {named})
    api.bills = [(BILLS[0], "2027-02-20"), (BILLS[1], "2027-02-20")]
    _run(api, DAY0, budget=1)  # room for one record only
    with migrated_engine.connect() as conn:
        held = conn.execute(
            text("SELECT bill_type, bill_number FROM raw.bill WHERE congress = :c"), {"c": CONGRESS}
        ).all()
    assert held == [("s", "2274")]


@pytestmark_db
def test_freshness_fails_when_a_changed_bill_has_waited_too_long(
    migrated_engine: Engine, api: Api
) -> None:
    now = datetime.now(UTC)
    with connect() as conn:
        queue.enqueue(
            conn,
            [
                (src.LegislationKey("bill", CONGRESS, "hr", "1"), "changed"),
                (src.LegislationKey("bill", CONGRESS, "hr", "2"), "backfill"),
            ],
        )
        conn.commit()
        fresh = read_queue(conn, now)
        assert fresh.by_reason == {"backfill": 1, "changed": 1} and fresh.overdue == 0
        assert queue_problems(fresh) == []
        assert "2 queued: 1 backfill, 1 changed." in "\n".join(queue_report(fresh))

        # the backlog may wait as long as it takes; a changed bill may not
        late = read_queue(conn, now + QUEUE_MAX_WAIT + timedelta(hours=1))
        assert late.overdue == 1
        assert queue_problems(late) == [
            "congress_gov_bills: 1 changed bills have waited over 72 h to be read"
        ]
