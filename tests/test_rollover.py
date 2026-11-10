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


def _deploy_workflow() -> tuple[dict, dict, str]:
    raw = (ROOT / ".github/workflows/deploy.yml").read_text(encoding="utf-8")
    workflow = yaml.safe_load(raw)
    return workflow, workflow[True], raw  # YAML parses `on` as True


def test_an_archive_build_cannot_land_on_the_live_site() -> None:
    workflow, triggers, raw = _deploy_workflow()
    inputs = triggers["workflow_dispatch"]["inputs"]
    assert inputs["archive_congress"]["default"] == ""
    # only a manual dispatch can archive: the nightly's call has no such input
    assert "archive_congress" not in triggers["workflow_call"]["inputs"]

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


def test_the_archive_keeps_a_database_dump_on_a_release() -> None:
    workflow, _, _ = _deploy_workflow()
    dump = workflow["jobs"]["archive-dump"]
    assert dump["needs"] == "deploy" and dump["if"] == "inputs.archive_congress"
    assert dump["permissions"] == {"contents": "write"}
    assert workflow["permissions"] == {"contents": "read"}  # every other job stays read-only
    script = " ".join(step["run"] for step in dump["steps"])
    for schema in ("raw", "seed", "meta", "mart"):
        assert f"--schema={schema}" in script
    assert "gh release upload" in script
