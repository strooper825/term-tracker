"""The openstates/people source (ADR 0035): reading the repository tarball and loading
raw.state_person."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import Engine, text

from ingest.db import connect
from ingest.shape import SourceShapeError
from ingest.sources import openstates_people as src
from tests.fixtures.openstates_people import (
    FIXTURE_COMMITTEES,
    FIXTURE_PEOPLE,
    SHA,
    fixture_fetch,
    tarball,
)


def test_latest_commit_reads_the_sha():
    assert src.latest_commit(lambda url: json.dumps({"sha": SHA}).encode()) == SHA


def test_latest_commit_refuses_an_answer_without_one():
    with pytest.raises(SourceShapeError, match="no commit sha"):
        src.latest_commit(lambda url: b'{"message": "rate limited"}')


def test_read_people_keeps_recent_roles_in_scope_only():
    retired_long_ago = {
        "id": "ocd-person/00000000-0000-0000-0000-000000000001",
        "name": "Long Gone",
        "roles": [
            {"type": "lower", "district": "1", "jurisdiction": "x", "end_date": "2019-01-01"}
        ],
    }
    lieutenant = {
        "id": "ocd-person/00000000-0000-0000-0000-000000000002",
        "name": "Lieutenant Only",
        "roles": [{"type": "lt_governor", "jurisdiction": "x", "start_date": "2023-01-01"}],
    }
    guam = {
        "id": "ocd-person/00000000-0000-0000-0000-000000000003",
        "name": "Out Of Scope",
        "roles": [{"type": "legislature", "district": "1", "jurisdiction": "x"}],
    }
    extra = [
        ("CA", "retired", retired_long_ago),
        ("CA", "executive", lieutenant),
        ("GU", "legislature", guam),
    ]
    kept = list(src.read_people(tarball(extra)))
    ids = {p["id"] for _, _, p in kept}
    assert len(kept) == FIXTURE_PEOPLE
    assert not ids & {p["id"] for _, _, p in extra}
    assert {folder for _, folder, _ in kept} == {"legislature", "executive", "retired"}


def test_read_committees_reads_the_committee_folder_only():
    committees = list(src.read_committees(tarball()))
    assert len(committees) == FIXTURE_COMMITTEES
    assert {state for state, _ in committees} == {"ca"}
    budget = next(c for _, c in committees if c["name"] == "Budget and Fiscal Review")
    assert budget["members"][0]["role"] == "Chair" and "person_id" not in budget["members"][2]


def test_read_people_refuses_a_file_without_roles_shape():
    broken = {"id": "not-an-ocd-id", "name": "X", "roles": [{"type": "upper", "jurisdiction": "x"}]}
    with pytest.raises(SourceShapeError):
        list(src.read_people(tarball([("CA", "legislature", broken)])))


@pytest.mark.integration
def test_load_replaces_the_table_and_skips_a_commit_already_loaded(migrated_engine: Engine):
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO raw.state_person (person_id, state, folder, payload, source_url, "
                "fetched_at) VALUES ('ocd-person/stale', 'CA', 'legislature', '{}', 'x', now()) "
                "ON CONFLICT DO NOTHING"
            )
        conn.commit()
        loaded = src.load(
            conn, fetch=fixture_fetch, minimum=1, minimum_committees=1, full_refresh=True
        )
        assert loaded == FIXTURE_PEOPLE
        again = src.load(conn, fetch=fixture_fetch, minimum=1, minimum_committees=1)
        assert again == 0
    with migrated_engine.connect() as conn:
        count = conn.execute(text("SELECT count(*) FROM raw.state_person")).scalar_one()
        stale = conn.execute(
            text("SELECT count(*) FROM raw.state_person WHERE person_id = 'ocd-person/stale'")
        ).scalar_one()
        last = conn.execute(
            text(
                "SELECT status, rows_loaded, source_url FROM meta.ingest_run WHERE source = "
                ":s ORDER BY id DESC LIMIT 1"
            ),
            {"s": src.SOURCE},
        ).one()
    assert count == FIXTURE_PEOPLE and stale == 0
    with migrated_engine.connect() as conn:
        committees = conn.execute(text("SELECT count(*) FROM raw.state_committee")).scalar_one()
    assert committees == FIXTURE_COMMITTEES
    assert last.status == "success" and last.rows_loaded == 0 and last.source_url.endswith(SHA)


@pytest.mark.integration
def test_load_refuses_too_few_people_and_keeps_the_table(migrated_engine: Engine):
    with connect() as conn:
        src.load(conn, fetch=fixture_fetch, minimum=1, minimum_committees=1, full_refresh=True)
        with pytest.raises(SourceShapeError, match="expected at least"):
            src.load(conn, fetch=fixture_fetch, full_refresh=True)
    with migrated_engine.connect() as conn:
        assert (
            conn.execute(text("SELECT count(*) FROM raw.state_person")).scalar_one()
            == FIXTURE_PEOPLE
        )


@pytest.mark.integration
def test_load_refuses_too_few_committees(migrated_engine: Engine):
    with connect() as conn:
        with pytest.raises(SourceShapeError, match="committees; expected at least"):
            src.load(conn, fetch=fixture_fetch, minimum=1, full_refresh=True)
