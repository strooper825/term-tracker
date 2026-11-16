"""Raw tables for what is inside an annual financial disclosure (ADR 0028).

``raw.annual_report_page`` holds one row per annual-disclosure report this site opened, keyed like
``raw.annual_disclosure`` by ``(source, doc_id)``. ``status`` is ``parsed`` (every part read),
``paper`` (page images: nothing to read) or ``failed`` (``error`` says why). The payload is the
report's header and, per part, its title, column headings, row count, or the filer's answer when
the part has no table.

``raw.annual_report_row`` holds one row per table row of a ``parsed`` report, keyed by
``(source, doc_id, part, row_index)``. ``part`` is the report's own part number ("3", "4a") or
"comments"; the payload is every cell as printed, with the notes eFD nests under it.

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "annual_report_page",
        sa.Column("source", sa.Text, primary_key=True),
        sa.Column("doc_id", sa.Text, primary_key=True),
        sa.Column("bioguide_id", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, comment="parsed, paper or failed"),
        sa.Column("error", sa.Text, comment="Why a failed report did not read"),
        sa.Column("payload", JSONB, nullable=False, comment="Header and per-part summary"),
        sa.Column("source_url", sa.Text, nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('parsed', 'paper', 'failed')", name="ck_annual_report_page_status"
        ),
        schema="raw",
        comment="One annual-disclosure report this site opened, and what reading it gave",
    )
    op.create_table(
        "annual_report_row",
        sa.Column("source", sa.Text, primary_key=True),
        sa.Column("doc_id", sa.Text, primary_key=True),
        sa.Column("part", sa.Text, primary_key=True, comment='"3", "4a", "comments"'),
        sa.Column("row_index", sa.Integer, primary_key=True, comment="Order in the part, from 1"),
        sa.Column("bioguide_id", sa.Text, nullable=False),
        sa.Column("payload", JSONB, nullable=False, comment="Cells as printed, with their notes"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        schema="raw",
        comment="One table row of a parsed annual-disclosure report",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on these tables.
    op.execute("DROP TABLE IF EXISTS raw.annual_report_row CASCADE")
    op.execute("DROP TABLE IF EXISTS raw.annual_report_page CASCADE")
