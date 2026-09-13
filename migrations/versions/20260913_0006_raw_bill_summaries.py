"""Raw table for Congress.gov CRS bill summaries (bill pages).

One row per bill, payload is the full ``summaries`` array (every version, not only the
latest), matching how ``raw.bill_actions`` and ``raw.bill_cosponsors`` store their lists. A
bill the Congressional Research Service has not summarised yet stores an empty array, which
is what stops the loader re-fetching it every night.

Amendments have no summaries endpoint (verified 2026-09-13: it answers 404), so only rows
with ``raw.bill.kind = 'bill'`` ever appear here.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bill_summaries",
        sa.Column("congress", sa.Integer, primary_key=True),
        sa.Column("bill_type", sa.Text, primary_key=True),
        sa.Column("bill_number", sa.Text, primary_key=True),
        sa.Column("payload", JSONB, nullable=False, comment="Upstream record, verbatim"),
        sa.Column("source_url", sa.Text, nullable=False, comment="API URL the record came from"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        schema="raw",
        comment="Full CRS summaries list for one bill (payload is a JSON array, empty when "
        "the bill has no summary yet)",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on this table.
    op.execute("DROP TABLE IF EXISTS raw.bill_summaries CASCADE")
