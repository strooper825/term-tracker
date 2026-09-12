"""Raw tables for Congress.gov bills, amendments, actions, and cosponsors (Phase 1b).

Keyed on (congress, bill_type, bill_number) where bill_type is the lower-case Congress.gov
type (hr, s, hres, sres, hjres, sjres, hconres, sconres, hamdt, samdt, suamdt). Payloads are
stored verbatim; transformation happens in dbt.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("bill_cosponsors", "bill_actions", "bill", "member_legislation")


def _key_columns() -> list[sa.Column]:
    return [
        sa.Column("congress", sa.Integer, primary_key=True),
        sa.Column("bill_type", sa.Text, primary_key=True),
        sa.Column("bill_number", sa.Text, primary_key=True),
    ]


def _payload_columns() -> list[sa.Column]:
    return [
        sa.Column("payload", JSONB, nullable=False, comment="Upstream record, verbatim"),
        sa.Column("source_url", sa.Text, nullable=False, comment="API URL the record came from"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "member_legislation",
        sa.Column("bioguide_id", sa.Text, primary_key=True),
        sa.Column("role", sa.Text, primary_key=True, comment="sponsor or cosponsor"),
        *_key_columns(),
        *_payload_columns(),
        sa.CheckConstraint("role IN ('sponsor', 'cosponsor')", name="ck_member_legislation_role"),
        schema="raw",
        comment="One row per item of /member/{bioguide}/sponsored-legislation and "
        "/cosponsored-legislation, current Congress only",
    )
    op.create_table(
        "bill",
        *_key_columns(),
        sa.Column("kind", sa.Text, nullable=False, comment="bill or amendment"),
        *_payload_columns(),
        sa.CheckConstraint("kind IN ('bill', 'amendment')", name="ck_bill_kind"),
        schema="raw",
        comment="Detail record from /bill/{c}/{t}/{n} or /amendment/{c}/{t}/{n}",
    )
    op.create_table(
        "bill_actions",
        *_key_columns(),
        *_payload_columns(),
        schema="raw",
        comment="Full actions list for one bill or amendment (payload is a JSON array)",
    )
    op.create_table(
        "bill_cosponsors",
        *_key_columns(),
        *_payload_columns(),
        schema="raw",
        comment="Full cosponsors list for one bill or amendment (payload is a JSON array)",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on these tables.
    for table in TABLES:
        op.execute(f"DROP TABLE IF EXISTS raw.{table} CASCADE")
