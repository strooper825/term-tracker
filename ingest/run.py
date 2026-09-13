"""Ingestion CLI.

Usage::

    python -m ingest.run --source all
    python -m ingest.run --source congress_gov

Sources register in ``SOURCES`` as they are implemented (Phase 1). With no sources
registered the command logs a warning and exits 0.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Callable, Sequence

from ingest.sources import congress_gov, house_votes, legislators, senate_votes

log = logging.getLogger("ingest")

# name -> callable that runs that source end to end and returns rows loaded.
# Order matters for --source all: votes before bills, so bills referenced by new roll calls
# are fetched the same night.
SOURCES: dict[str, Callable[..., int]] = {
    legislators.SOURCE: legislators.run,
    house_votes.SOURCE: house_votes.run,
    senate_votes.SOURCE: senate_votes.run,
    congress_gov.SOURCE: congress_gov.run,
}


def build_parser() -> argparse.ArgumentParser:
    known = ", ".join(sorted(SOURCES)) or "none registered yet"
    parser = argparse.ArgumentParser(
        prog="python -m ingest.run",
        description="Run one ingestion source, or all of them.",
    )
    parser.add_argument(
        "--source",
        default="all",
        help=f"Source to run, or 'all' (default). Known sources: {known}.",
    )
    parser.add_argument(
        "--full-refresh",
        action="store_true",
        help="Re-fetch dependent records even when the source reports no change.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.source == "all":
        selected = list(SOURCES)
    elif args.source in SOURCES:
        selected = [args.source]
    else:
        parser.error(
            f"unknown source {args.source!r}; known: {', '.join(sorted(SOURCES)) or 'none'}"
        )

    if not selected:
        log.warning("No ingestion sources are registered yet; nothing to do.")
        return 0

    for name in selected:
        log.info("Running source %s", name)
        rows = SOURCES[name](full_refresh=args.full_refresh)
        log.info("Source %s loaded %d rows", name, rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
