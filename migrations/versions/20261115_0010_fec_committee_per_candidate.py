"""raw.fec_committee holds one row per committee, cycle and tracked candidate.

The key was (committee_id, cycle), with the candidate the list was fetched for beside it. A
joint fundraising committee can name several candidates, and with more members tracked two of
them can be tracked: the second one's row replaced the first's, so the first member's panel
lost the committee. The candidate joins the key (ADR 0023, FEC in batches).

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-15
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE raw.fec_committee DROP CONSTRAINT fec_committee_pkey")
    op.execute(
        "ALTER TABLE raw.fec_committee "
        "ADD CONSTRAINT fec_committee_pkey PRIMARY KEY (committee_id, cycle, candidate_id)"
    )


def downgrade() -> None:
    # The old key allows one candidate per committee and cycle: keep the first, as an upsert
    # in candidate order would have left it. The next identity read rewrites the rows anyway.
    op.execute(
        "DELETE FROM raw.fec_committee AS a USING raw.fec_committee AS b "
        "WHERE a.committee_id = b.committee_id AND a.cycle = b.cycle "
        "AND a.candidate_id > b.candidate_id"
    )
    op.execute("ALTER TABLE raw.fec_committee DROP CONSTRAINT fec_committee_pkey")
    op.execute(
        "ALTER TABLE raw.fec_committee "
        "ADD CONSTRAINT fec_committee_pkey PRIMARY KEY (committee_id, cycle)"
    )
