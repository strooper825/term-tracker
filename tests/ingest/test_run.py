"""Tests for the ingestion CLI entry point."""

from __future__ import annotations

import pytest

from ingest import run


def test_all_with_no_sources_exits_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(run, "SOURCES", {})
    assert run.main(["--source", "all"]) == 0


def test_unknown_source_is_a_usage_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(run, "SOURCES", {})
    with pytest.raises(SystemExit) as excinfo:
        run.main(["--source", "nope"])
    assert excinfo.value.code == 2


def test_registered_source_runs(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_source(*, full_refresh: bool = False) -> int:
        calls.append("legislators")
        return 3

    monkeypatch.setattr(run, "SOURCES", {"legislators": fake_source})
    assert run.main(["--source", "legislators"]) == 0
    assert calls == ["legislators"]


def test_a_failing_source_does_not_stop_the_rest(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    calls: list[str] = []

    def failing(*, full_refresh: bool = False) -> int:
        calls.append("votes")
        raise RuntimeError("upstream exploded")

    def working(*, full_refresh: bool = False) -> int:
        calls.append("bills")
        return 1

    monkeypatch.setattr(run, "SOURCES", {"votes": failing, "bills": working})
    # Alembic's fileConfig (run by other tests' migrations) disables loggers created before it.
    monkeypatch.setattr(run.log, "disabled", False)
    assert run.main(["--source", "all"]) == 1
    assert calls == ["votes", "bills"]
    assert "1 of 2 sources failed: votes" in caplog.text
    assert "upstream exploded" in caplog.text  # the traceback reaches the run log
