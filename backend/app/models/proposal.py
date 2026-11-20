"""Saved proposals (the pipeline) and their history."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Proposal(Base):
    __tablename__ = "proposals"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String(40))
    prospect_name: Mapped[str] = mapped_column(String(120))
    # draft → sent → won | lost (a decided proposal can be reopened)
    status: Mapped[str] = mapped_column(String(10), default="draft", index=True)
    # The reviewed invoice data (never the uploaded file), the what-if and the partner details as sent.
    invoice: Mapped[dict[str, Any]] = mapped_column(JSONB)
    scenario: Mapped[dict[str, Any]] = mapped_column(JSONB)
    partner_details: Mapped[dict[str, Any]] = mapped_column(JSONB)
    message: Mapped[str | None] = mapped_column(Text, default=None)
    source_file_name: Mapped[str | None] = mapped_column(String(255), default=None)

    # Recalculated by the server whenever the invoice or what-if change; kept here for the list.
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    monthly_saving: Mapped[float] = mapped_column(Float, default=0)
    yearly_saving: Mapped[float] = mapped_column(Float, default=0)
    has_saving: Mapped[bool] = mapped_column(Boolean, default=False)
    compared_shipments: Mapped[int] = mapped_column(Integer, default=0)
    total_shipments: Mapped[int] = mapped_column(Integer, default=0)

    follow_up_on: Mapped[date | None] = mapped_column(Date, default=None)
    lost_reason: Mapped[str | None] = mapped_column(String(200), default=None)
    notes: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class ProposalEvent(Base):
    """One line of a proposal's history: created, edited, sent, PDF downloaded…"""

    __tablename__ = "proposal_events"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("proposals.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(30))
    detail: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
