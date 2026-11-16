"""Raw table for annual financial disclosures, both chambers, listed not read (ADR 0027).

``raw.annual_disclosure`` holds one row per annual report, amendment, new filer report,
termination report or due-date extension a tracked member filed since the tracked Congress began,
keyed by ``(source, doc_id)``: ``house_clerk`` with the Clerk's DocID, or ``senate_efd`` with
eFD's report UUID. ``covers_year`` is the calendar year the report covers (the Clerk index's
year; the year in an eFD title, null for a paper report or a report dated by day). The payload is
the index row or the search row as published.

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "annual_disclosure",
        sa.Column("source", sa.Text, primary_key=True, comment="house_clerk or senate_efd"),
        sa.Column("doc_id", sa.Text, primary_key=True, comment="Clerk DocID or eFD report UUID"),
        sa.Column("bioguide_id", sa.Text, nullable=False),
        sa.Column(
            "kind",
            sa.Text,
            nullable=False,
            comment="annual, amendment, new_filer, termination or extension",
        ),
        sa.Column("covers_year", sa.Integer, comment="Calendar year the report covers"),
        sa.Column("filing_date", sa.Date, nullable=False),
        sa.Column("payload", JSONB, nullable=False, comment="Index or search row as published"),
        sa.Column("source_url", sa.Text, nullable=False, comment="The report"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "source IN ('house_clerk', 'senate_efd')", name="ck_annual_disclosure_source"
        ),
        sa.CheckConstraint(
            "kind IN ('annual', 'amendment', 'new_filer', 'termination', 'extension')",
            name="ck_annual_disclosure_kind",
        ),
        schema="raw",
        comment="One annual-disclosure filing of a tracked member, listed and linked",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on this table.
    op.execute("DROP TABLE IF EXISTS raw.annual_disclosure CASCADE")
