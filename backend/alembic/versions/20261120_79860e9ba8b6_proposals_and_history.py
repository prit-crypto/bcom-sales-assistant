"""Saved proposals and their history

Revision ID: 79860e9ba8b6
Revises:
Create Date: 2026-11-20 12:37:41.908738
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "79860e9ba8b6"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "proposals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reference", sa.String(length=40), nullable=False),
        sa.Column("prospect_name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("invoice", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("scenario", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("partner_details", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("source_file_name", sa.String(length=255), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("monthly_saving", sa.Float(), nullable=False),
        sa.Column("yearly_saving", sa.Float(), nullable=False),
        sa.Column("has_saving", sa.Boolean(), nullable=False),
        sa.Column("compared_shipments", sa.Integer(), nullable=False),
        sa.Column("total_shipments", sa.Integer(), nullable=False),
        sa.Column("follow_up_on", sa.Date(), nullable=True),
        sa.Column("lost_reason", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposals")),
    )
    op.create_index(op.f("ix_proposals_status"), "proposals", ["status"], unique=False)
    op.create_index(op.f("ix_proposals_updated_at"), "proposals", ["updated_at"], unique=False)
    op.create_table(
        "proposal_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("proposal_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["proposals.id"],
            name=op.f("fk_proposal_events_proposal_id_proposals"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposal_events")),
    )
    op.create_index(
        op.f("ix_proposal_events_proposal_id"), "proposal_events", ["proposal_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_proposal_events_proposal_id"), table_name="proposal_events")
    op.drop_table("proposal_events")
    op.drop_index(op.f("ix_proposals_updated_at"), table_name="proposals")
    op.drop_index(op.f("ix_proposals_status"), table_name="proposals")
    op.drop_table("proposals")
