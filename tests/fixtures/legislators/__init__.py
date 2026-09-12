"""Fixture loader for the congress-legislators source (no network)."""

from __future__ import annotations

from pathlib import Path

FIXTURE_DIR = Path(__file__).resolve().parent


def fixture_fetch(url: str) -> str:
    """Stand-in for ingest.http.fetch_text: serve the trimmed upstream file by its basename."""
    path = FIXTURE_DIR / url.rsplit("/", 1)[-1]
    if not path.exists():
        raise FileNotFoundError(f"no fixture for {url}")
    return path.read_text(encoding="utf-8")
