"""Nightly job pieces: freshness evaluation, dbt env derivation, URL normalisation, workflows."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import yaml
from sqlalchemy import Engine, text

from api.config import Settings
from ingest.db import connect
from ingest.dbt_env import dbt_env
from ingest.freshness import SourceStatus, evaluate, read_sizes, read_statuses, report
from ingest.run import SOURCES

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = ROOT / ".github/workflows"
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


def _workflow(name: str) -> tuple[dict, dict, str]:
    raw = (WORKFLOWS / name).read_text(encoding="utf-8")
    workflow = yaml.safe_load(raw)
    triggers = workflow[True] if True in workflow else workflow["on"]  # YAML parses `on` as True
    return workflow, triggers, raw


def _step_order(steps: list[dict], prefixes: tuple[str, ...]) -> list[int]:
    names = [step.get("name", step.get("run", "")) for step in steps]
    return [next(i for i, n in enumerate(names) if n.startswith(p)) for p in prefixes]


def test_old_single_job_workflow_is_gone() -> None:
    assert not (WORKFLOWS / "nightly.yml").exists()


def test_ingest_workflow_shape() -> None:
    workflow, triggers, raw = _workflow("ingest.yml")
    assert triggers["schedule"] == [{"cron": "0 6 * * *"}]
    inputs = triggers["workflow_dispatch"]["inputs"]
    assert inputs["full_refresh"]["type"] == "boolean"
    assert inputs["max_age_hours"]["default"] == 26
    assert inputs["deploy"]["default"] is True

    ingest = workflow["jobs"]["ingest"]
    assert {"DATABASE_URL", "CONGRESS_GOV_API_KEY", "FEC_API_KEY"} <= set(ingest["env"])
    order = _step_order(
        ingest["steps"], ("Migrate", "dbt seed", "Ingest", "dbt build", "Freshness check")
    )
    assert order == sorted(order), "migrate -> seed -> ingest -> dbt build -> freshness"
    names = " ".join(step.get("name", "") for step in ingest["steps"])
    assert "Deploy" not in names and "Build the site" not in names  # deploy lives in deploy.yml

    deploy = workflow["jobs"]["deploy"]
    assert deploy["uses"] == "./.github/workflows/deploy.yml"  # same run, so alerting covers it
    assert deploy["needs"] == "ingest"
    assert deploy["with"] == {"deploy_target": "auto"}
    assert deploy["secrets"] == "inherit"
    assert "github.event_name == 'schedule'" in deploy["if"]

    alert = workflow["jobs"]["alert"]
    assert alert["needs"] == ["ingest", "deploy"] and alert["if"] == "always()"
    open_step, close_step = alert["steps"]
    assert "needs.deploy.result == 'failure'" in open_step["if"]  # a deploy failure alerts too
    assert "gh issue" in open_step["run"] and "nightly-failure" in open_step["run"]
    assert "needs.deploy.result == 'skipped'" in close_step["if"]  # deploy opted out is still ok
    assert "gh issue close" in close_step["run"]
    assert workflow["permissions"]["issues"] == "write"
    # the empty-string branch of `cond && '' || x` is falsy and always yields x; never use it
    assert "&& '' ||" not in raw
    assert list(SOURCES)[:2] == ["legislators", "congress_gov_house_votes"]  # votes before bills


def test_deploy_workflow_shape() -> None:
    workflow, triggers, raw = _workflow("deploy.yml")
    dispatch = triggers["workflow_dispatch"]["inputs"]["deploy_target"]
    assert dispatch["options"] == ["auto", "preview", "production"]
    assert dispatch["default"] == "auto"  # production from main, preview elsewhere
    assert triggers["workflow_call"]["inputs"]["deploy_target"]["default"] == "auto"

    job = workflow["jobs"]["deploy"]
    assert {"DATABASE_URL", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"} <= set(job["env"])
    steps = job["steps"]
    order = _step_order(
        steps,
        (
            "Resolve the deployment target",
            "Start the API",
            "Build the site",
            "Confirm the built site cannot reach the API",
            "Deploy the prebuilt",
        ),
    )
    assert order == sorted(order), "resolve -> API -> build -> static check -> deploy"
    resolve = steps[order[0]]
    assert (
        'if [ "$REF_NAME" = "main" ]; then target=production; else target=preview'
        in (resolve["run"])
    )
    deploy = steps[order[-1]]
    assert "--prebuilt" in deploy["run"] and "if" not in deploy  # a deploy failure fails the job
    assert deploy["env"]["PROD_FLAG"] == "${{ steps.target.outputs.prod_flag }}"
    assert "&& '' ||" not in raw
    assert "Migrate" not in " ".join(s.get("name", "") for s in steps)  # no ingest here
    assert workflow["permissions"] == {"contents": "read"}


@pytest.mark.integration
def test_read_statuses_and_sizes_against_database(migrated_engine: Engine) -> None:
    with migrated_engine.begin() as conn:
        before = conn.execute(text("SELECT coalesce(max(id), 0) FROM meta.ingest_run")).scalar_one()
        conn.execute(
            text(
                "INSERT INTO meta.ingest_run "
                "(source, source_url, status, finished_at, rows_loaded) "
                "VALUES ('test_fresh', 'https://x.example', 'success', now(), 7), "
                "('test_fresh', 'https://x.example', 'failed', now(), NULL), "
                "('test_never', 'https://x.example', 'running', NULL, NULL)"
            )
        )
    try:
        with connect() as conn:
            statuses = read_statuses(conn, ["test_fresh", "test_never", "test_absent"])
            total, schemas = read_sizes(conn)
    finally:
        with migrated_engine.begin() as conn:
            conn.execute(text("DELETE FROM meta.ingest_run WHERE id > :b"), {"b": before})
    by_source = {s.source: s for s in statuses}
    assert by_source["test_fresh"].rows_loaded == 7
    assert by_source["test_fresh"].last_success_at is not None
    assert by_source["test_never"].last_success_at is None  # running rows do not count
    assert by_source["test_absent"].last_success_at is None
    assert total > 0 and {name for name, _ in schemas} >= {"raw", "meta"}
