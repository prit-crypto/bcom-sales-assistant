"""Data access for partners' corrections to readings."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import delete, func, select

from app.models.correction import ReadingCorrection
from app.models.proposal import Proposal
from app.repositories.base import BaseRepository


class CorrectionRepository(BaseRepository[ReadingCorrection]):
    model = ReadingCorrection

    async def replace_for(self, proposal_id: uuid.UUID, rows: list[ReadingCorrection]) -> None:
        await self.db.execute(
            delete(ReadingCorrection).where(ReadingCorrection.proposal_id == proposal_id)
        )
        self.db.add_all(rows)
        await self.db.flush()

    async def since(
        self, moment: datetime, providers: Sequence[str] | None = None
    ) -> Sequence[ReadingCorrection]:
        statement = select(ReadingCorrection).where(ReadingCorrection.at >= moment)
        if providers is not None:
            statement = statement.where(ReadingCorrection.provider.in_(providers))
        return (
            (await self.db.execute(statement.order_by(ReadingCorrection.at.desc()))).scalars().all()
        )

    async def reading_totals(self) -> list[tuple[str, str | None, int, int]]:
        """Per reader (provider, model): how many saved readings, and how many shipments they held."""
        provider = Proposal.reader["provider"].astext
        model = Proposal.reader["model"].astext
        shipments = func.jsonb_array_length(Proposal.original_invoice["shipments"])
        statement = (
            select(provider, model, func.count(), func.coalesce(func.sum(shipments), 0))
            .where(Proposal.reader.is_not(None), Proposal.original_invoice.is_not(None))
            .group_by(provider, model)
        )
        return [
            (row[0], row[1], int(row[2]), int(row[3]))
            for row in (await self.db.execute(statement)).all()
        ]
