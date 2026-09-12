"""Initial schemas and the ingest_run table.

Creates the four schemas the pipeline writes to (raw, staging, mart, meta) and
meta.ingest_run, which records every ingestion run and backs /api/v1/meta/freshness.

Revision ID: 0001
Revises:
Create Date: 2026-09-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.schema import CreateSchema, DropSchema

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMAS = ("raw", "staging", "mart", "meta")


def upgrade() -> None:
    for schema in SCHEMAS:
        op.execute(CreateSchema(schema, if_not_exists=True))

    op.create_table(
        "ingest_run",
        sa.Column("id", sa.BigInteger, sa.Identity(), primary_key=True),
        sa.Column("source", sa.Text, nullable=False, comment="Ingestion source name"),
        sa.Column("source_url", sa.Text, nullable=True, comment="Base URL fetched"),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rows_loaded", sa.Integer, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.CheckConstraint(
            "status IN ('running', 'success', 'failed')", name="ck_ingest_run_status"
        ),
        schema="meta",
    )
    op.create_index(
        "ix_ingest_run_source_finished_at",
        "ingest_run",
        ["source", "finished_at"],
        schema="meta",
    )


def downgrade() -> None:
    op.drop_index("ix_ingest_run_source_finished_at", table_name="ingest_run", schema="meta")
    op.drop_table("ingest_run", schema="meta")
    # cascade: dbt-built objects (staging views, mart tables) live in these schemas too.
    for schema in reversed(SCHEMAS):
        op.execute(DropSchema(schema, cascade=True, if_exists=True))
