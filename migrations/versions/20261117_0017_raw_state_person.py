"""Raw table for state legislators and governors from openstates/people (ADR 0035).

``raw.state_person`` holds one row per person file kept from the repository (a legislative or
governor role held on or after 2025-01-01), keyed by the Open States person id. ``folder`` is the
repository folder the file was in (legislature, executive or retired). The payload is the YAML
file as JSON; ``source_url`` names the commit's tarball.

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-17
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "state_person",
        sa.Column("person_id", sa.Text, primary_key=True, comment="ocd-person/<uuid>"),
        sa.Column("state", sa.Text, nullable=False, comment="Postal abbreviation, upper case"),
        sa.Column("folder", sa.Text, nullable=False, comment="legislature, executive or retired"),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("source_url", sa.Text, nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        schema="raw",
        comment="A state legislator or governor, from openstates/people",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on this table.
    op.execute("DROP TABLE IF EXISTS raw.state_person CASCADE")
