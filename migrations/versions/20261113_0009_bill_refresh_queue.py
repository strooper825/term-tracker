"""State for the incremental bill ingest (ADR 0023): a watermark and a queue.

``meta.ingest_cursor`` holds how far a source has asked its upstream "what changed": for
``congress_gov_bills`` one row of kind ``changed`` (the start of the last run whose listing of
changed bills and amendments was stored) and one of kind ``resweep`` (the start of the last run
that compared the whole list). It is written in the same transaction as the queue rows it
accounts for, so the two cannot disagree.

``meta.bill_refresh_queue`` holds bills and amendments known to need reading. A row is deleted
in the same transaction that stores the record it names, so a run that stops part-way leaves
exactly the unread ones behind for the next run.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ingest_cursor",
        sa.Column("source", sa.Text, primary_key=True, comment="Ingestion source name"),
        sa.Column("congress", sa.Integer, primary_key=True),
        sa.Column("kind", sa.Text, primary_key=True, comment="changed or resweep"),
        sa.Column(
            "changed_through",
            sa.DateTime(timezone=True),
            nullable=False,
            comment="Start of the run whose listing this row accounts for",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("kind IN ('changed', 'resweep')", name="ck_ingest_cursor_kind"),
        schema="meta",
        comment="How far a source has asked its upstream what changed (ADR 0023)",
    )
    op.create_table(
        "bill_refresh_queue",
        sa.Column("congress", sa.Integer, primary_key=True),
        sa.Column("bill_type", sa.Text, primary_key=True),
        sa.Column("bill_number", sa.Text, primary_key=True),
        sa.Column("kind", sa.Text, nullable=False, comment="bill or amendment"),
        sa.Column(
            "reason",
            sa.Text,
            nullable=False,
            comment="changed, new, resweep (found by the full comparison) or backfill",
        ),
        sa.Column(
            "priority",
            sa.SmallInteger,
            nullable=False,
            comment="0 changed and new, 1 resweep, 2 backfill; lowest is read first",
        ),
        sa.Column(
            "enqueued_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text, nullable=True),
        sa.CheckConstraint("kind IN ('bill', 'amendment')", name="ck_bill_refresh_queue_kind"),
        sa.CheckConstraint(
            "reason IN ('changed', 'new', 'resweep', 'backfill')",
            name="ck_bill_refresh_queue_reason",
        ),
        schema="meta",
        comment="Bills and amendments known to need reading from Congress.gov (ADR 0023)",
    )
    op.create_index(
        "ix_bill_refresh_queue_order",
        "bill_refresh_queue",
        ["congress", "priority", "enqueued_at"],
        schema="meta",
    )


def downgrade() -> None:
    op.drop_index("ix_bill_refresh_queue_order", table_name="bill_refresh_queue", schema="meta")
    op.drop_table("bill_refresh_queue", schema="meta")
    op.drop_table("ingest_cursor", schema="meta")
