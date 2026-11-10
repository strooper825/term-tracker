"""The tracked Congress is one number in two places; they must agree (ADR 0021)."""

from __future__ import annotations

from pathlib import Path

import yaml

from api.config import Settings

ROOT = Path(__file__).resolve().parent.parent
DBT = ROOT / "dbt"


def _dbt_vars() -> dict:
    return yaml.safe_load((DBT / "dbt_project.yml").read_text(encoding="utf-8"))["vars"]


def test_ingest_and_mart_track_the_same_congress() -> None:
    # The ingest fetches Settings.current_congress and the mart keeps only the dbt var's
    # Congress, so a mismatch builds an empty site without a single error.
    default = Settings.model_fields["current_congress"].default
    assert default == _dbt_vars()["current_congress"]


def test_congress_dates_are_derived_not_configured() -> None:
    # Two date vars used to sit beside the number and had to be edited with it.
    assert not [name for name in _dbt_vars() if name.startswith("current_congress_")]
    macro = (DBT / "macros/congress_dates.sql").read_text(encoding="utf-8")
    assert "1789 + 2 * (var('current_congress') | int - 1)" in macro
    models = "".join(p.read_text(encoding="utf-8") for p in (DBT / "models").rglob("*.sql"))
    assert "current_congress_start" not in models and "current_congress_end" not in models


def test_bill_and_vote_staging_is_scoped_to_the_tracked_congress() -> None:
    # raw keeps every Congress loaded. Without the filter the rehearsal of the 120th counted the
    # 119th's 4,592 bills as its own and kept a page for each.
    for name in (
        "stg_bills",
        "stg_bill_actions",
        "stg_bill_cosponsors",
        "stg_bill_summaries",
        "stg_member_legislation",
        "stg_house_roll_calls",
        "stg_house_member_votes",
        "stg_senate_roll_calls",
        "stg_senate_member_votes",
    ):
        sql = (DBT / "models/staging" / f"{name}.sql").read_text(encoding="utf-8")
        assert "congress = {{ var('current_congress') }}" in sql, name


WORKFLOWS = ROOT / ".github/workflows"


def _workflow(name: str) -> tuple[dict, dict]:
    workflow = yaml.safe_load((WORKFLOWS / name).read_text(encoding="utf-8"))
    return workflow, workflow[True]  # YAML parses `on` as True


def test_an_archive_build_cannot_land_on_the_live_site() -> None:
    workflow, triggers = _workflow("deploy.yml")
    # only archive.yml can ask for an archive: a plain dispatch of deploy.yml has no such input,
    # and the nightly's call passes none
    assert "archive_congress" not in triggers["workflow_dispatch"]["inputs"]
    assert triggers["workflow_call"]["inputs"]["archive_congress"]["default"] == ""
    ingest, _ = _workflow("ingest.yml")
    assert ingest["jobs"]["deploy"]["with"] == {"deploy_target": "auto"}

    job = workflow["jobs"]["deploy"]
    # its own Vercel project, and no fallback to the live one when that secret is missing
    assert job["env"]["VERCEL_PROJECT_ID"] == (
        "${{ inputs.archive_congress && secrets.VERCEL_ARCHIVE_PROJECT_ID"
        " || secrets.VERCEL_PROJECT_ID }}"
    )
    assert job["env"]["NEXT_PUBLIC_ARCHIVE_OF"] == "${{ inputs.archive_congress }}"
    # an archive does not link to archives; the live site reads them from a repository variable
    assert (
        job["env"]["NEXT_PUBLIC_ARCHIVES"]
        == "${{ !inputs.archive_congress && vars.ARCHIVES || '' }}"
    )

    names = [step.get("name", "") for step in job["steps"]]
    check = names.index("Archive: check the mart is still this Congress")
    assert names.index("Start the API against the managed database") < check
    assert check < names.index("Build the site (Vercel prebuilt output)")
    step = job["steps"][check]
    assert step["if"] == "inputs.archive_congress"
    assert 'if [ "$built" != "$ARCHIVE_CONGRESS" ]' in step["run"] and "exit 1" in step["run"]
    assert "NEXT_PUBLIC_ARCHIVE_AS_OF=" in step["run"]  # the banner's date is the build's date
    assert "unavailable" in step["run"]  # a refused source frozen into the archive is announced


def test_the_archive_workflow_builds_the_site_and_keeps_a_dump() -> None:
    workflow, triggers = _workflow("archive.yml")
    assert set(triggers) == {"workflow_dispatch"}  # by hand only, never on a schedule
    assert triggers["workflow_dispatch"]["inputs"]["archive_congress"]["required"] is True
    site = workflow["jobs"]["site"]
    assert site["uses"] == "./.github/workflows/deploy.yml" and site["secrets"] == "inherit"
    assert site["with"]["archive_congress"] == "${{ inputs.archive_congress }}"

    dump = workflow["jobs"]["dump"]
    assert dump["needs"] == "site"  # no dump of a Congress whose archive did not deploy
    assert dump["permissions"] == {"contents": "write"}
    script = " ".join(step["run"] for step in dump["steps"])
    for schema in ("raw", "seed", "meta", "mart"):
        assert f"--schema={schema}" in script
    assert "gh release upload" in script


def _permissions(block: dict) -> dict:
    return block.get("permissions") or {}


def test_no_called_workflow_asks_for_more_than_its_caller_grants() -> None:
    """A called workflow's job may not exceed the calling job's permissions, and GitHub rejects
    the whole calling run at startup when one does, even a job that would have been skipped.
    A `contents: write` job in deploy.yml did that to every ingest.yml run on 2026-11-10."""
    rank = {"none": 0, "read": 1, "write": 2}
    checked = 0
    for path in WORKFLOWS.glob("*.yml"):
        caller = yaml.safe_load(path.read_text(encoding="utf-8"))
        for job_name, job in caller["jobs"].items():
            uses = job.get("uses", "")
            if not uses.startswith("./.github/workflows/"):
                continue
            granted = _permissions(job) or _permissions(caller)
            assert granted, f"{path.name}:{job_name} must state its permissions"
            called = yaml.safe_load((ROOT / uses[2:]).read_text(encoding="utf-8"))
            for inner_name, inner in called["jobs"].items():
                wanted = _permissions(inner) or _permissions(called)
                for scope, level in wanted.items():
                    assert rank[level] <= rank[granted.get(scope, "none")], (
                        f"{uses} job {inner_name} asks for {scope}: {level}, "
                        f"but {path.name}:{job_name} grants {granted.get(scope, 'none')}"
                    )
                checked += 1
    assert checked >= 2  # ingest.yml -> deploy.yml and archive.yml -> deploy.yml
