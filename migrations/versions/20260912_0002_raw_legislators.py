"""Raw tables for the congress-legislators source (Phase 1a).

One row per upstream record, keyed on the source's natural key, with the payload stored
verbatim as JSONB. Transformation happens in dbt (dbt/models/staging).

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _payload_columns() -> list[sa.Column]:
    return [
        sa.Column("payload", JSONB, nullable=False, comment="Upstream record, verbatim"),
        sa.Column("source_url", sa.Text, nullable=False, comment="File the record came from"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "legislator",
        sa.Column("bioguide_id", sa.Text, primary_key=True),
        *_payload_columns(),
        schema="raw",
        comment="legislators-current.yaml: one row per current member of Congress",
    )
    op.create_table(
        "committee",
        sa.Column("thomas_id", sa.Text, primary_key=True),
        *_payload_columns(),
        schema="raw",
        comment="committees-current.yaml: one row per top-level committee (subcommittees nested)",
    )
    op.create_table(
        "committee_membership",
        sa.Column("committee_id", sa.Text, primary_key=True),
        *_payload_columns(),
        schema="raw",
        comment="committee-membership-current.yaml: one row per committee or subcommittee, "
        "payload is the member list",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on these tables.
    for table in ("committee_membership", "committee", "legislator"):
        op.execute(f"DROP TABLE IF EXISTS raw.{table} CASCADE")
