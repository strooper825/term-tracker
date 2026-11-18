"""Raw table for state legislative committees from openstates/people (ADR 0035).

``raw.state_committee`` holds one row per committee file in the repository
(``data/{state}/committees/``), keyed by the Open States organization id. The payload is the
YAML file as JSON: the committee's name, its chamber (upper, lower, or legislature for a joint
committee) and its members, each with a role and, usually, the member's Open States person id.
It is loaded from the same tarball as ``raw.state_person``.

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-18
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "state_committee",
        sa.Column("committee_id", sa.Text, primary_key=True, comment="ocd-organization/<uuid>"),
        sa.Column("state", sa.Text, nullable=False, comment="Postal abbreviation, upper case"),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("source_url", sa.Text, nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        schema="raw",
        comment="A state legislative committee and its members, from openstates/people",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on this table.
    op.execute("DROP TABLE IF EXISTS raw.state_committee CASCADE")
