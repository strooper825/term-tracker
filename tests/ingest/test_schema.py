"""Returning the database to main's Alembic head after a branch run (ingest/schema.py, ADR 0019)."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect

from ingest.schema import SchemaRestoreError, current_revision, main_head, restore

ROOT = Path(__file__).resolve().parents[2]
HEAD = ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini"))).get_current_head()

# A revision that only "the branch" has, standing in for house-ptr-trades' 0009.
BRANCH_REVISION = f'''
from alembic import op
import sqlalchemy as sa

revision = "9999"
down_revision = "{HEAD}"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("schema_restore_probe", sa.Column("id", sa.Integer), schema="raw")


def downgrade():
    op.drop_table("schema_restore_probe", schema="raw")
'''


@pytest.mark.skipif(shutil.which("git") is None, reason="needs git (absent in the dbt image)")
def test_main_head_reads_the_migrations_committed_at_a_ref() -> None:
    assert main_head("HEAD") == HEAD


@pytest.fixture
def branch_config(tmp_path: Path) -> Config:
    """An Alembic config whose migrations are this checkout's plus one branch-only revision."""
    shutil.copy(ROOT / "alembic.ini", tmp_path / "alembic.ini")
    shutil.copytree(
        ROOT / "migrations", tmp_path / "migrations", ignore=shutil.ignore_patterns("__pycache__")
    )
    (tmp_path / "migrations" / "versions" / "20990101_9999_branch_only.py").write_text(
        BRANCH_REVISION, encoding="utf-8"
    )
    return Config(str(tmp_path / "alembic.ini"))


def test_restore_does_nothing_at_or_without_a_revision(branch_config: Config) -> None:
    assert "nothing to restore" in restore(branch_config, HEAD, HEAD)
    assert "nothing to restore" in restore(branch_config, HEAD, None)


def test_restore_refuses_a_revision_the_checkout_does_not_have(branch_config: Config) -> None:
    with pytest.raises(SchemaRestoreError, match="restore_schema_from"):
        restore(Config(str(ROOT / "alembic.ini")), HEAD, "9999")


def test_restore_leaves_a_database_behind_main_to_the_nightly(branch_config: Config) -> None:
    assert "behind main" in restore(branch_config, "9999", HEAD)


@pytest.mark.integration
def test_restore_downgrades_a_branch_revision(
    migrated_engine: Engine, branch_config: Config
) -> None:
    url = migrated_engine.url.render_as_string(hide_password=False)
    command.upgrade(branch_config, "9999")
    try:
        assert current_revision(url) == "9999"
        outcome = restore(branch_config, HEAD, current_revision(url))
        assert outcome == f"downgraded the database from 9999 to main's head {HEAD}"
        assert current_revision(url) == HEAD
        assert "schema_restore_probe" not in inspect(migrated_engine).get_table_names("raw")
    finally:
        if current_revision(url) == "9999":
            command.downgrade(branch_config, HEAD)
