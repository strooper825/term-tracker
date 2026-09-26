"""Ingestion CLI.

Usage::

    python -m ingest.run --source all
    python -m ingest.run --source congress_gov

Every selected source runs even when an earlier one fails. A failure inside a load is recorded
in ``meta.ingest_run`` by :func:`ingest.load.record_run` (the load rolled back); every failure
is logged with its traceback here, and the command exits 1 after the last source, naming the
sources that failed.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Callable, Sequence

from ingest.sources import (
    census_acs,
    census_geography,
    congress_gov,
    fec,
    house_votes,
    legislators,
    senate_votes,
    statements,
)

log = logging.getLogger("ingest")

# name -> callable that runs that source end to end and returns rows loaded.
# Order matters for --source all: legislators first (the FEC source reads its candidate ids),
# votes before bills, so bills referenced by new roll calls are fetched the same night. The two
# Census sources read nothing from the others and change once a year, so they go near the end.
# Statements read third-party office sites, so they run last (ADR 0015). A failing source no
# longer stops the ones after it, but the order still decides what a later source can read.
SOURCES: dict[str, Callable[..., int]] = {
    legislators.SOURCE: legislators.run,
    house_votes.SOURCE: house_votes.run,
    senate_votes.SOURCE: senate_votes.run,
    congress_gov.SOURCE: congress_gov.run,
    fec.SOURCE: fec.run,
    census_geography.SOURCE: census_geography.run,
    census_acs.SOURCE: census_acs.run,
    statements.SOURCE: statements.run,
}


def build_parser() -> argparse.ArgumentParser:
    known = ", ".join(sorted(SOURCES))
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
        parser.error(f"unknown source {args.source!r}; known: {', '.join(sorted(SOURCES))}")

    failed: list[str] = []
    for name in selected:
        log.info("Running source %s", name)
        try:
            rows = SOURCES[name](full_refresh=args.full_refresh)
        except Exception:
            log.exception("Source %s failed; continuing with the remaining sources", name)
            failed.append(name)
            continue
        log.info("Source %s loaded %d rows", name, rows)

    if failed:
        log.error("%d of %d sources failed: %s", len(failed), len(selected), ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
