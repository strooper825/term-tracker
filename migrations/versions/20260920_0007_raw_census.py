"""Raw tables for the Constituency tab: Census boundary maps and ACS estimates (ADR 0015).

``raw.constituency_geometry`` holds one row per state and per House district, keyed by the
Congress the district lines belong to and the Census GEOID (``55`` a state, ``5501`` a
district, ``0200`` an at-large district, ``1198`` the District of Columbia's delegate). The
payload is finished SVG path data, not geometry: projection and simplification happen at
ingest (ingest/geometry.py), the one transform that cannot be written in dbt.

``raw.acs_estimate`` holds one row per state and district for an ACS 5-year release, keyed by
the last year of the release (2024 is 2020-2024). ``congress`` records which Congress's
districts that release describes, so a 2027 release on the 120th Congress's new lines can sit
beside this one without a district number meaning two things.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-20
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
        "constituency_geometry",
        sa.Column("congress", sa.Integer, primary_key=True, comment="Congress the lines belong to"),
        sa.Column("geoid", sa.Text, primary_key=True, comment="Census GEOID: state, or state + CD"),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("payload", JSONB, nullable=False, comment="Finished SVG path data, see ADR 0015"),
        sa.Column("source_url", sa.Text, nullable=False, comment="Census file the shape came from"),
        sa.Column(
            "source_modified",
            sa.Text,
            nullable=False,
            comment="Last-Modified of the three source zips when loaded; drives the skip check",
        ),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('state', 'district')", name="ck_constituency_geometry_kind"),
        schema="raw",
        comment="Map of one state or House district as SVG paths, from Census cartographic "
        "boundary files (1:500,000)",
    )
    op.create_table(
        "acs_estimate",
        sa.Column("acs_year", sa.Integer, primary_key=True, comment="Last year of the 5-year"),
        sa.Column("geoid", sa.Text, primary_key=True, comment="Census GEOID: state, or state + CD"),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("congress", sa.Integer, nullable=False, comment="Congress of the districts"),
        sa.Column("payload", JSONB, nullable=False, comment="API values verbatim, by dataset"),
        sa.Column("source_url", sa.Text, nullable=False, comment="Census API endpoint, no key"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('state', 'district')", name="ck_acs_estimate_kind"),
        schema="raw",
        comment="ACS 5-year estimates and margins of error for one state or district",
    )


def downgrade() -> None:
    # CASCADE: dbt staging views depend on these tables.
    op.execute("DROP TABLE IF EXISTS raw.acs_estimate CASCADE")
    op.execute("DROP TABLE IF EXISTS raw.constituency_geometry CASCADE")
