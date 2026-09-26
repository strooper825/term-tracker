"""The ``sources[]`` provenance every response carries, built from mart rows.

A row names its origin in ``source``, ``source_url`` and ``fetched_at`` columns.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from api.schemas.members import SourceRef


def source_ref(row: Any) -> SourceRef:
    return SourceRef(
        source=row["source"], source_url=row["source_url"], fetched_at=row["fetched_at"]
    )


def distinct_sources(rows: Iterable[Any]) -> list[SourceRef]:
    """One reference per (source, URL), the first row's ``fetched_at`` kept, sorted by URL."""
    seen: dict[tuple[str, str], SourceRef] = {}
    for row in rows:
        seen.setdefault((row["source"], row["source_url"]), source_ref(row))
    return sorted(seen.values(), key=lambda s: s.source_url)
