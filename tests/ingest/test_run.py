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

    def fake_source() -> int:
        calls.append("legislators")
        return 3

    monkeypatch.setattr(run, "SOURCES", {"legislators": fake_source})
    assert run.main(["--source", "legislators"]) == 0
    assert calls == ["legislators"]
