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
    assert {"DATABASE_URL", "CONGRESS_GOV_API_KEY", "FEC_API_KEY", "CENSUS_API_KEY"} <= set(
        ingest["env"]
    )
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

    # A branch run must not leave the database at a revision main lacks: the nightlies of
    # 2026-09-21 and 09-22 failed on house-ptr-trades' 0009 (ADR 0019). The restore runs after
    # the deploy (which migrates too), and also when the run failed or was cancelled.
    assert inputs["restore_schema_from"]["default"] == ""
    assert "!inputs.restore_schema_from" in ingest["if"]  # restore-only dispatches skip ingest
    restore = workflow["jobs"]["restore-schema"]
    assert restore["needs"] == ["ingest", "deploy"]
    assert restore["if"].startswith("always() &&") and "github.ref_name != 'main'" in restore["if"]
    assert "python -m ingest.schema restore --main-ref FETCH_HEAD" in restore["steps"][-1]["run"]
    migrate = next(s for s in ingest["steps"] if s.get("name") == "Migrate")
    assert "restore_schema_from" in migrate["run"]  # the failure says how to recover

    alert = workflow["jobs"]["alert"]
    assert alert["needs"] == ["ingest", "deploy", "restore-schema"] and alert["if"] == "always()"
    open_step, close_step = alert["steps"]
    # any failed job alerts: a deploy or schema restore failure as much as an ingest failure
    assert open_step["if"] == "contains(needs.*.result, 'failure')"
    assert "gh issue" in open_step["run"] and "nightly-failure" in open_step["run"]
    # a skipped deploy (opted out) or restore (main) still closes the issue
    assert "needs.ingest.result == 'success'" in close_step["if"]
    assert "!contains(needs.*.result, 'failure')" in close_step["if"]
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
            "Migrate",
            "dbt build",
            "Start the API",
            "Build the site",
            "Drop the client prefetch payloads",
            "Confirm the built site cannot reach the API",
            "Deploy the prebuilt",
        ),
    )
    assert order == sorted(order), (
        "resolve -> migrate -> dbt build -> API -> build -> strip -> static check -> deploy"
    )

    # Vercel bills deployment storage on the unpacked deployment, and the RSC payloads were 62
    # percent of it (ADR 0017). Stripping before the static check also means that check reads
    # only what ships.
    strip = steps[order[5]]
    assert "strip-prefetch-payloads.mjs .vercel/output/static" in strip["run"]
    assert "GITHUB_STEP_SUMMARY" in strip["run"], "the size belongs in the run summary"
    functions = next(s for s in steps if "function output" in s.get("name", ""))
    assert "output/functions" in functions["run"]

    # The API here is this commit's code, so the mart must be rebuilt from this commit's
    # models before it serves anything. Skipping that renders the site against whatever the
    # last nightly built, and a branch that adds a mart column answers 500 on every request
    # that selects it (policy_area, 2026-09-13).
    assert any(
        "dbt" in step.get("run", "") for step in steps if "pip install" in step.get("run", "")
    )
    dbt_build = steps[order[2]]
    assert "dbt build" in dbt_build["run"] and "--project-dir dbt" in dbt_build["run"]
    assert any("ingest.dbt_env" in step.get("run", "") for step in steps)
    assert "Ingest" not in " ".join(s.get("name", "") for s in steps)  # rebuild only, no fetch

    # A page render only ever sees an HTTP status, so the API's own log has to reach the run.
    log_step = next(s for s in steps if s.get("name", "").startswith("API log"))
    assert log_step["if"] == "failure()" and "cat api.log" in log_step["run"]
    assert steps.index(log_step) > order[4], "after the site build, so a 500 there is explained"
    resolve = steps[order[0]]
    assert (
        'if [ "$REF_NAME" = "main" ]; then target=production; else target=preview'
        in (resolve["run"])
    )
    deploy = steps[order[-1]]
    assert "--prebuilt" in deploy["run"] and "if" not in deploy  # a deploy failure fails the job
    # One tarball, not 9,435 separate files: the free tier rejects a deploy of more than 5,000
    # (code api-upload-free). `vercel build` takes no such flag and uploads nothing.
    assert "--archive=tgz" in deploy["run"]
    build = next(s for s in steps if s.get("name", "").startswith("Build the site"))
    assert "vercel build" in build["run"] and "--archive" not in build["run"]
    assert deploy["env"]["PROD_FLAG"] == "${{ steps.target.outputs.prod_flag }}"
    assert "&& '' ||" not in raw
    # Dispatched on its own from a branch, the deploy restores main's schema itself (ADR 0019).
    restore = steps[-1]
    assert "github.workflow == 'Deploy site'" in restore["if"] and "always()" in restore["if"]
    assert "ingest.schema restore" in restore["run"]
    assert workflow["name"] == "Deploy site"
    # This job re-derives the mart but never fetches: no source is ingested here.
    assert "ingest.run" not in raw and "CONGRESS_GOV_API_KEY" not in raw
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


def test_ci_strips_the_prefetch_payloads_before_the_static_check() -> None:
    """The deploy drops the RSC payloads (ADR 0017); CI runs the same step so a break in it
    fails on the pull request rather than at deploy time."""
    workflow, _, _ = _workflow("ci.yml")
    steps = workflow["jobs"]["test"]["steps"]
    order = _step_order(
        steps,
        (
            "Build the static site",
            "Drop the client prefetch payloads",
            "Confirm the built site cannot reach the API",
        ),
    )
    assert order == sorted(order), "build -> strip -> static check"
    assert "strip-prefetch-payloads.mjs out" in steps[order[1]]["run"]
    # the build needs the API base URL; the strip step reads only the file tree
    assert steps[order[0]]["env"]["API_BASE_URL"]
