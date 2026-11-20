"""Reading corrections, original readings and source files of saved proposals

Revision ID: 1f0618b52a6e
Revises: 79860e9ba8b6
Create Date: 2026-11-20 15:09:52.311020
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "1f0618b52a6e"
down_revision: str | None = "79860e9ba8b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reading_corrections",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("proposal_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("model", sa.String(length=80), nullable=True),
        sa.Column("courier", sa.String(length=120), nullable=True),
        sa.Column("shipment_id", sa.String(length=40), nullable=False),
        sa.Column("field", sa.String(length=30), nullable=False),
        sa.Column("before", sa.Text(), nullable=True),
        sa.Column("after", sa.Text(), nullable=True),
        sa.Column(
            "at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["proposals.id"],
            name=op.f("fk_reading_corrections_proposal_id_proposals"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reading_corrections")),
    )
    op.create_index(
        "ix_reading_corrections_courier_field",
        "reading_corrections",
        ["courier", "field"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reading_corrections_proposal_id"),
        "reading_corrections",
        ["proposal_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reading_corrections_provider"), "reading_corrections", ["provider"], unique=False
    )
    op.add_column(
        "proposals",
        sa.Column("source_files", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "proposals",
        sa.Column("original_invoice", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "proposals", sa.Column("reader", postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("proposals", "reader")
    op.drop_column("proposals", "original_invoice")
    op.drop_column("proposals", "source_files")
    op.drop_index(op.f("ix_reading_corrections_provider"), table_name="reading_corrections")
    op.drop_index(op.f("ix_reading_corrections_proposal_id"), table_name="reading_corrections")
    op.drop_index("ix_reading_corrections_courier_field", table_name="reading_corrections")
    op.drop_table("reading_corrections")
