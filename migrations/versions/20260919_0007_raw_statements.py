"""Raw table for official press-release feed items (Public statements tab, ADR 0015).

One row per feed item per member. ``guid`` is the feed's own item identifier; it is not
always a public URL (the Speaker's and Jeffries's feeds use admin-host ``?p=`` ids), so the
public link lives in the payload. Rows are only ever upserted, so a feed that later drops an
item does not erase it.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-19
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
        "statement",
        sa.Column("bioguide_id", sa.Text, primary_key=True),
        sa.Column("guid", sa.Text, primary_key=True),
        sa.Column("payload", JSONB, nullable=False, comment="Parsed feed item"),
        sa.Column("source_url", sa.Text, nullable=False, comment="Feed URL the item came from"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        schema="raw",
        comment="One press-release feed item of a tracked member (seed.statement_sources)",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on this table.
    op.execute("DROP TABLE IF EXISTS raw.statement CASCADE")
