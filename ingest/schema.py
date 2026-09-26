"""Put the database back at main's Alembic head after a run of another branch (ADR 0019).

ingest.yml and deploy.yml migrate the managed database to the head of whichever branch they run
on. A branch that adds a migration therefore leaves the database at a revision main does not
have, and every scheduled run on main then fails at ``alembic upgrade head`` with "Can't locate
revision" until the database is reverted. That happened after the election-context run
(2026-09-13) and again after the house-ptr-trades run (2026-09-21), which failed the nightlies
of 2026-09-21 and 2026-09-22.

Branch runs now end by calling this module. It downgrades to main's head with the migration
files of the checkout it runs in, because only the branch's files know how to undo the branch's
revisions. It does nothing when the database is already at main's head or behind it.

Usage::

    git fetch --depth=1 origin main
    python -m ingest.schema restore --main-ref FETCH_HEAD
"""

from __future__ import annotations

import argparse
import io
import logging
import subprocess
import sys
import tarfile
import tempfile
from collections.abc import Sequence
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine

from api.config import get_settings

ROOT = Path(__file__).resolve().parent.parent


class SchemaRestoreError(RuntimeError):
    """The database cannot be returned to main's head from this checkout. Stop and report."""


def main_head(ref: str, repo: Path = ROOT) -> str:
    """The single Alembic head of the migrations committed at git ``ref``."""
    archive = subprocess.run(
        ["git", "archive", ref, "migrations/versions"],
        cwd=repo,
        check=True,
        capture_output=True,
    ).stdout
    with tempfile.TemporaryDirectory() as tmp:
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            tar.extractall(tmp, filter="data")
        return ScriptDirectory(str(Path(tmp) / "migrations")).get_current_head() or "base"


def current_revision(database_url: str) -> str | None:
    engine = create_engine(database_url)
    try:
        with engine.connect() as conn:
            heads = MigrationContext.configure(conn).get_current_heads()
    finally:
        engine.dispose()
    if len(heads) > 1:
        raise SchemaRestoreError(f"the database has several Alembic heads {heads}; fix by hand")
    return heads[0] if heads else None


def restore(config: Config, target: str, current: str | None) -> str:
    """Downgrade from ``current`` to ``target`` when ``current`` is ahead of it; say what was done.

    ``config`` names the checkout's migrations, which must hold both revisions.
    """
    if current is None or current == target:
        return f"database is at {current or 'no revision'}; nothing to restore"
    script = ScriptDirectory.from_config(config)
    known = {rev.revision for rev in script.walk_revisions()}
    if current not in known:
        raise SchemaRestoreError(
            f"the database is at revision {current}, which this checkout does not have. Dispatch "
            "ingest.yml on main with restore_schema_from set to the branch that added it (git "
            f"log --all -- 'migrations/versions/*_{current}_*' names it)."
        )
    if target not in known:
        raise SchemaRestoreError(
            f"main's head {target} is not in this checkout's migrations: merge main into the "
            "branch before running it against the managed database."
        )
    below_current = {rev.revision for rev in script.walk_revisions("base", current)}
    if target not in below_current:
        below_target = {rev.revision for rev in script.walk_revisions("base", target)}
        if current in below_target:
            return f"database is at {current}, behind main's {target}; the nightly will upgrade it"
        raise SchemaRestoreError(
            f"revisions {current} (database) and {target} (main) are on different lines; "
            "the branch's migrations were written against an older main. Fix by hand."
        )
    command.downgrade(config, target)
    return f"downgraded the database from {current} to main's head {target}"


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="python -m ingest.schema")
    sub = parser.add_subparsers(dest="command", required=True)
    restore_cmd = sub.add_parser("restore", help="Downgrade to main's head if ahead of it.")
    restore_cmd.add_argument("--main-ref", default="origin/main", help="git ref of main")
    args = parser.parse_args(argv)

    target = main_head(args.main_ref)
    try:
        outcome = restore(
            Config(str(ROOT / "alembic.ini")),
            target,
            current_revision(get_settings().database_url),
        )
    except SchemaRestoreError as exc:
        print(f"::error::{exc}")
        return 1
    # print, not log: env.py's fileConfig disables existing loggers during a downgrade
    print(outcome)
    return 0


if __name__ == "__main__":
    sys.exit(main())
