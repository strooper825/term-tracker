"""Ingestion CLI.

Usage::

    python -m ingest.run --source all
    python -m ingest.run --source congress_gov

Sources register themselves in ``SOURCES`` as they are implemented (Phase 1). With no
sources registered the command logs a warning and exits 0, so the nightly workflow can
be wired up before the first source lands.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Callable, Sequence

log = logging.getLogger("ingest")

# name -> callable that runs that source end to end and returns rows loaded.
SOURCES: dict[str, Callable[[], int]] = {}


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
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.source == "all":
        selected = sorted(SOURCES)
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
        rows = SOURCES[name]()
        log.info("Source %s loaded %d rows", name, rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
