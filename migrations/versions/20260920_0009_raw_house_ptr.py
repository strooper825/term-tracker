"""Raw tables for the Stock trades tab: House Periodic Transaction Reports (ADR 0018).

``raw.house_ptr_filing`` holds one row per PTR (index ``FilingType`` ``P``) a tracked House
member filed since the tracked Congress began, keyed by the Clerk's ``DocID``. ``status`` says
what reading the PDF gave: ``parsed`` (it has a text layer and its transaction table was read),
``scanned`` (paper form photographed to an image: no text, so no trades can be read without OCR),
or ``failed`` (text present but the table did not parse; ``error`` says why). The payload is the
index row plus what the reader found in the PDF header.

``raw.house_ptr_transaction`` holds one row per transaction table row of a ``parsed`` filing,
keyed by ``(doc_id, row_number)``. The payload keeps every cell as the PDF prints it; dates,
amounts, codes and tickers are read out of those strings in dbt. ``source_url`` is the PDF with
``#page=N`` so a trade can be checked against the page it came from.

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-20
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "house_ptr_filing",
        sa.Column("doc_id", sa.Text, primary_key=True, comment="Clerk DocID"),
        sa.Column("bioguide_id", sa.Text, nullable=False),
        sa.Column("year", sa.Integer, nullable=False, comment="Index year, also the PDF folder"),
        sa.Column("status", sa.Text, nullable=False, comment="parsed, scanned or failed"),
        sa.Column("error", sa.Text, comment="Why a failed filing did not parse"),
        sa.Column("payload", JSONB, nullable=False, comment="Index row plus PDF header facts"),
        sa.Column("source_url", sa.Text, nullable=False, comment="The PTR PDF"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('parsed', 'scanned', 'failed')", name="ck_house_ptr_filing_status"
        ),
        schema="raw",
        comment="One House Periodic Transaction Report of a tracked member (Clerk filing index)",
    )
    op.create_table(
        "house_ptr_transaction",
        sa.Column("doc_id", sa.Text, primary_key=True),
        sa.Column("row_number", sa.Integer, primary_key=True, comment="Order in the PDF, from 1"),
        sa.Column("bioguide_id", sa.Text, nullable=False),
        sa.Column("payload", JSONB, nullable=False, comment="Cells of the row as printed"),
        sa.Column("source_url", sa.Text, nullable=False, comment="PDF URL with #page=N"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        schema="raw",
        comment="One transaction row of a parsed House PTR",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on these tables.
    op.execute("DROP TABLE IF EXISTS raw.house_ptr_transaction CASCADE")
    op.execute("DROP TABLE IF EXISTS raw.house_ptr_filing CASCADE")
