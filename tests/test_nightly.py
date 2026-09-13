"""Nightly job pieces: freshness evaluation, dbt env derivation, URL normalisation, workflow."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import yaml

from api.config import Settings
from ingest.dbt_env import dbt_env
from ingest.freshness import SourceStatus, evaluate, report
from ingest.run import SOURCES

ROOT = Path(__file__).resolve().parent.parent
NOW = datetime(2026, 9, 13, 6, 30, tzinfo=UTC)


def test_evaluate_flags_missing_and_stale_sources() -> None:
    statuses = [
        SourceStatus("legislators", NOW - timedelta(hours=1), 818),
        SourceStatus("senate_votes", NOW - timedelta(hours=30), 890),
        SourceStatus("congress_gov_bills", None, None),
    ]
    ok, problems = evaluate(statuses, NOW, timedelta(hours=26))
    assert not ok
    assert problems == [
        "senate_votes: last success 30.0 h ago (limit 1 day, 2:00:00)",
        "congress_gov_bills: no successful run recorded",
    ]
    ok, problems = evaluate(statuses[:1], NOW, timedelta(hours=26))
    assert ok and problems == []


def test_report_mentions_free_tier_and_warns_near_it() -> None:
    statuses = [SourceStatus("legislators", NOW - timedelta(hours=1), 818)]
    text = report(statuses, [], NOW, 100 * 1024 * 1024, [("raw", 90 * 1024 * 1024)])
    assert "100.0 MB" in text and "512.0 MB" in text and "(20%)" in text
    assert "Warning" not in text
    text = report(statuses, ["x: stale"], NOW, 450 * 1024 * 1024, [])
    assert "Warning: above 80%" in text and "## Problems" in text


def test_dbt_env_from_neon_style_url() -> None:
    env = dbt_env(
        "postgresql+psycopg://user:pw@ep-x.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    )
    assert env == {
        "PGHOST": "ep-x.us-east-2.aws.neon.tech",
        "PGPORT": "5432",
        "PGUSER": "user",
        "PGPASSWORD": "pw",
        "PGDATABASE": "neondb",
        "PGSSLMODE": "require",
    }
    assert (
        dbt_env("postgresql+psycopg://term:term@localhost:5433/term_tracker")["PGSSLMODE"]
        == "prefer"
    )


def test_settings_normalise_plain_postgres_url() -> None:
    settings = Settings(database_url="postgresql://u:p@host/db?sslmode=require")
    assert settings.database_url == "postgresql+psycopg://u:p@host/db?sslmode=require"
    settings = Settings(database_url="postgres://u:p@host/db")
    assert settings.database_url == "postgresql+psycopg://u:p@host/db"
    settings = Settings(database_url="postgresql+psycopg://u:p@host/db")
    assert settings.database_url == "postgresql+psycopg://u:p@host/db"


def test_nightly_workflow_shape() -> None:
    workflow = yaml.safe_load((ROOT / ".github/workflows/nightly.yml").read_text(encoding="utf-8"))
    triggers = workflow[True] if True in workflow else workflow["on"]  # YAML parses `on` as True
    assert triggers["schedule"] == [{"cron": "0 6 * * *"}]
    assert "workflow_dispatch" in triggers
    job = workflow["jobs"]["nightly"]
    assert set(job["env"]) == {"DATABASE_URL", "CONGRESS_GOV_API_KEY", "FEC_API_KEY"}
    names = [step.get("name", step.get("run", "")) for step in job["steps"]]
    order = [
        next(i for i, n in enumerate(names) if n.startswith(prefix))
        for prefix in ("Migrate", "Ingest", "dbt build", "Freshness check")
    ]
    assert order == sorted(order), "must run migrate -> ingest -> dbt build -> freshness"
    failure_steps = [s for s in job["steps"] if s.get("if") == "failure()"]
    assert failure_steps and "gh issue" in failure_steps[0]["run"]
    assert workflow["permissions"]["issues"] == "write"
    assert list(SOURCES)[:2] == ["legislators", "congress_gov_house_votes"]  # votes before bills
