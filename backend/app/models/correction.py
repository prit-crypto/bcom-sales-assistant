"""What partners corrected in a reading: one row per changed value, per saved proposal."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReadingCorrection(Base):
    __tablename__ = "reading_corrections"
    __table_args__ = (Index("ix_reading_corrections_courier_field", "courier", "field"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("proposals.id", ondelete="CASCADE"), index=True
    )
    # Who read it: "gemini", "openai", "mock" or "spreadsheet", and the model
    provider: Mapped[str] = mapped_column(String(20), index=True)
    model: Mapped[str | None] = mapped_column(String(80), default=None)
    # The current courier's name as read (hints are grouped by it)
    courier: Mapped[str | None] = mapped_column(String(120), default=None)
    shipment_id: Mapped[str] = mapped_column(String(40))
    field: Mapped[str] = mapped_column(String(30))
    before: Mapped[str | None] = mapped_column(Text, default=None)
    after: Mapped[str | None] = mapped_column(Text, default=None)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
