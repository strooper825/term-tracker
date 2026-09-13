"""Raw tables for OpenFEC candidates, committees, and committee totals (Phase 2).

One row per FEC candidate id of a tracked member, one per committee linked to the member's
current-office candidate in a cycle, and one per (principal committee, cycle) totals record.
Payloads are stored verbatim; transformation happens in dbt.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("fec_committee_totals", "fec_committee", "fec_candidate")


def _payload_columns() -> list[sa.Column]:
    return [
        sa.Column("payload", JSONB, nullable=False, comment="Upstream record, verbatim"),
        sa.Column("source_url", sa.Text, nullable=False, comment="API URL the record came from"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "fec_candidate",
        sa.Column("candidate_id", sa.Text, primary_key=True),
        sa.Column(
            "bioguide_id",
            sa.Text,
            nullable=False,
            comment="Tracked member whose congress-legislators id.fec lists this candidate",
        ),
        *_payload_columns(),
        schema="raw",
        comment="/candidate/{id}/ record for every FEC candidate id of a tracked member",
    )
    op.create_index("ix_fec_candidate_bioguide_id", "fec_candidate", ["bioguide_id"], schema="raw")
    op.create_table(
        "fec_committee",
        sa.Column("committee_id", sa.Text, primary_key=True),
        sa.Column("cycle", sa.Integer, primary_key=True),
        sa.Column(
            "candidate_id",
            sa.Text,
            nullable=False,
            comment="Current-office candidate the committee list was fetched for",
        ),
        *_payload_columns(),
        schema="raw",
        comment="Item of /candidate/{id}/committees/?cycle=: every committee linked to the "
        "candidate in the cycle (principal, authorized, joint, leadership PAC)",
    )
    op.create_table(
        "fec_committee_totals",
        sa.Column("committee_id", sa.Text, primary_key=True),
        sa.Column("cycle", sa.Integer, primary_key=True),
        *_payload_columns(),
        schema="raw",
        comment="/committee/{id}/totals/?cycle= record of the principal campaign committee",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on these tables.
    for table in TABLES:
        op.execute(f"DROP TABLE IF EXISTS raw.{table} CASCADE")
