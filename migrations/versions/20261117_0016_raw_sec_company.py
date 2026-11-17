"""Raw table for the industry of each traded company (ADR 0032).

``raw.sec_company`` holds one row per ticker a tracked member's trades name and the SEC lists,
keyed by the normalised ticker (upper case, ``-`` for a class separator). ``sic`` is the
company's Standard Industrial Classification code, null for a filer the SEC gives none (a fund,
a trust). The payload keeps the fields read from the company's submissions file.

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-17
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sec_company",
        sa.Column("ticker", sa.Text, primary_key=True, comment="Normalised: BRK-B, not BRK.B"),
        sa.Column("cik", sa.Text, nullable=False, comment="Central Index Key, ten digits"),
        sa.Column("company", sa.Text, nullable=False),
        sa.Column("sic", sa.Text, comment="Four-digit SIC code; null when the SEC gives none"),
        sa.Column("sic_description", sa.Text),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("source_url", sa.Text, nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        schema="raw",
        comment="A traded company's industry, from the SEC's submissions file",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on this table.
    op.execute("DROP TABLE IF EXISTS raw.sec_company CASCADE")
