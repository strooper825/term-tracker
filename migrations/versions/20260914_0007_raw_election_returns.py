"""Raw table for MIT Election Data and Science Lab constituency returns (ADR 0008).

One row per contest (office, year, state, district, stage, special) from the committed U.S.
House and U.S. Senate snapshots under data/mit_election_lab/. The payload is the contest's
rows from the file, verbatim; transformation happens in dbt.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "election_return_contest",
        sa.Column("office", sa.Text, primary_key=True, comment="house or senate"),
        sa.Column("year", sa.Integer, primary_key=True),
        sa.Column("state_po", sa.Text, primary_key=True, comment="Postal abbreviation"),
        sa.Column(
            "district",
            sa.Text,
            primary_key=True,
            comment="House district as published (0 at large); 'statewide' for the Senate",
        ),
        sa.Column(
            "stage", sa.Text, primary_key=True, comment="Lower-cased stage: gen, pri, runoff, ..."
        ),
        sa.Column("special", sa.Boolean, primary_key=True),
        sa.Column(
            "payload", JSONB, nullable=False, comment="The contest's rows from the file, verbatim"
        ),
        sa.Column(
            "file_md5",
            sa.Text,
            nullable=False,
            comment="MD5 of the snapshot file, equal to the checksum Dataverse publishes",
        ),
        sa.Column(
            "dataset_version", sa.Text, nullable=False, comment="Dataverse version, e.g. 15.0"
        ),
        sa.Column("source_url", sa.Text, nullable=False, comment="Dataverse dataset version page"),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            comment="When the snapshot was downloaded from Dataverse",
        ),
        schema="raw",
        comment="MIT Election Lab constituency returns, one row per contest",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on this table.
    op.execute("DROP TABLE IF EXISTS raw.election_return_contest CASCADE")
