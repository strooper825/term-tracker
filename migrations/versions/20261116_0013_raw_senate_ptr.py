"""Raw tables for Senate Periodic Transaction Reports from eFD (ADR 0026).

``raw.senate_ptr_report`` holds one row per periodic transaction report a tracked senator
submitted since the tracked Congress began, keyed by eFD's report UUID. ``status`` says what
reading it gave: ``parsed`` (an electronic report; its table was read), ``paper`` (page images:
nothing to read) or ``failed`` (an electronic report whose table did not read back whole;
``error`` says why). The payload is the search row (name, office, title, filed date, the date
the report is for, the amendment number) plus what the reader found in the report's header.
``supersedes`` is the report an amendment replaces, matched by the rows they share, and
``supersedes_note`` says how it was decided or why it was not.

``raw.senate_ptr_transaction`` holds one row per transaction of a ``parsed`` report, keyed by
``(report_id, row_number)``, every cell as the page prints it.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "senate_ptr_report",
        sa.Column("report_id", sa.Text, primary_key=True, comment="eFD report UUID"),
        sa.Column("bioguide_id", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, comment="parsed, paper or failed"),
        sa.Column("error", sa.Text, comment="Why a failed report did not read"),
        sa.Column("supersedes", sa.Text, comment="The report this amendment replaces"),
        sa.Column("supersedes_note", sa.Text, comment="How that was decided, or why not"),
        sa.Column("payload", JSONB, nullable=False, comment="Search row plus report header"),
        sa.Column("source_url", sa.Text, nullable=False, comment="The report page on eFD"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('parsed', 'paper', 'failed')", name="ck_senate_ptr_report_status"
        ),
        schema="raw",
        comment="One Senate Periodic Transaction Report of a tracked senator (eFD search)",
    )
    op.create_table(
        "senate_ptr_transaction",
        sa.Column("report_id", sa.Text, primary_key=True),
        sa.Column("row_number", sa.Integer, primary_key=True, comment="The report's # column"),
        sa.Column("bioguide_id", sa.Text, nullable=False),
        sa.Column("payload", JSONB, nullable=False, comment="Cells of the row as printed"),
        sa.Column("source_url", sa.Text, nullable=False, comment="The report page on eFD"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        schema="raw",
        comment="One transaction row of a parsed Senate PTR",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on these tables.
    op.execute("DROP TABLE IF EXISTS raw.senate_ptr_transaction CASCADE")
    op.execute("DROP TABLE IF EXISTS raw.senate_ptr_report CASCADE")
