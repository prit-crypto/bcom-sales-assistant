"""Customer link: share token and when the customer opened it

Revision ID: 5e8d53428035
Revises: 1f0618b52a6e
Create Date: 2026-11-20 16:08:43.166066
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "5e8d53428035"
down_revision: str | None = "1f0618b52a6e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("proposals", sa.Column("share_token", sa.String(length=64), nullable=True))
    op.add_column("proposals", sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "proposals", sa.Column("view_count", sa.Integer(), server_default="0", nullable=False)
    )
    op.create_unique_constraint(op.f("uq_proposals_share_token"), "proposals", ["share_token"])


def downgrade() -> None:
    op.drop_constraint(op.f("uq_proposals_share_token"), "proposals", type_="unique")
    op.drop_column("proposals", "view_count")
    op.drop_column("proposals", "viewed_at")
    op.drop_column("proposals", "share_token")
