"""raw.press_page: where a tracked member's press releases are, as found by the monthly probe.

One row per tracked member who has no hand-checked row in seed.statement_sources. The probe
(ingest.sources.press_pages, ADR 0023) tries a short list of known paths under the member's
official website and stores the first that answers with a press listing, or that none did.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "press_page",
        sa.Column("bioguide_id", sa.Text, primary_key=True),
        sa.Column(
            "payload",
            JSONB,
            nullable=False,
            comment="outcome (found, not_found, disallowed, unreachable), press_url, detail",
        ),
        sa.Column("source_url", sa.Text, nullable=False, comment="The official website probed"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        schema="raw",
        comment="Result of the latest press-page probe of a tracked member's official website",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on this table.
    op.execute("DROP TABLE IF EXISTS raw.press_page CASCADE")
