"""Raw tables for roll-call votes (Phase 1c).

House votes come from the Congress.gov /house-vote endpoints (one row per roll call from the
session list, one row per roll call holding every member position). Senate votes come from
senate.gov LIS XML (one row per session menu, one row per roll call with every senator's
position), converted to JSON verbatim.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("senate_vote", "senate_vote_menu", "house_vote_members", "house_vote")


def _payload_columns() -> list[sa.Column]:
    return [
        sa.Column("payload", JSONB, nullable=False, comment="Upstream record, verbatim"),
        sa.Column("source_url", sa.Text, nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "house_vote",
        sa.Column("congress", sa.Integer, primary_key=True),
        sa.Column("session", sa.Integer, primary_key=True),
        sa.Column("roll_number", sa.Integer, primary_key=True),
        *_payload_columns(),
        schema="raw",
        comment="Item of /house-vote/{congress}/{session}",
    )
    op.create_table(
        "house_vote_members",
        sa.Column("congress", sa.Integer, primary_key=True),
        sa.Column("session", sa.Integer, primary_key=True),
        sa.Column("roll_number", sa.Integer, primary_key=True),
        *_payload_columns(),
        schema="raw",
        comment="/house-vote/{congress}/{session}/{roll}/members: houseRollCallVoteMemberVotes "
        "object with every member position under results[]",
    )
    op.create_table(
        "senate_vote_menu",
        sa.Column("congress", sa.Integer, primary_key=True),
        sa.Column("session", sa.Integer, primary_key=True),
        *_payload_columns(),
        schema="raw",
        comment="senate.gov vote_menu_{congress}_{session}.xml as JSON",
    )
    op.create_table(
        "senate_vote",
        sa.Column("congress", sa.Integer, primary_key=True),
        sa.Column("session", sa.Integer, primary_key=True),
        sa.Column("vote_number", sa.Integer, primary_key=True),
        *_payload_columns(),
        schema="raw",
        comment="senate.gov vote_{congress}_{session}_{number}.xml as JSON, every senator position "
        "under members.member[]",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on these tables.
    for table in TABLES:
        op.execute(f"DROP TABLE IF EXISTS raw.{table} CASCADE")
