"""Data access for saved proposals and their history."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date
from typing import Any

from sqlalchemy import func, or_, select

from app.models.proposal import Proposal, ProposalEvent
from app.repositories.base import BaseRepository


class ProposalRepository(BaseRepository[Proposal]):
    model = Proposal

    async def search(
        self, *, status: str | None, query: str | None, limit: int = 200
    ) -> Sequence[Proposal]:
        statement = select(Proposal).order_by(Proposal.updated_at.desc()).limit(limit)
        if status:
            statement = statement.where(Proposal.status == status)
        if query:
            pattern = f"%{query.strip()}%"
            statement = statement.where(
                or_(Proposal.prospect_name.ilike(pattern), Proposal.reference.ilike(pattern))
            )
        return (await self.db.execute(statement)).scalars().all()

    async def due_for_follow_up(self, today: date) -> int:
        statement = select(func.count()).where(
            Proposal.status == "sent", Proposal.follow_up_on <= today
        )
        return int((await self.db.execute(statement)).scalar_one())


class ProposalEventRepository(BaseRepository[ProposalEvent]):
    model = ProposalEvent

    async def record(
        self, proposal_id: uuid.UUID, kind: str, detail: dict[str, Any] | None = None
    ) -> ProposalEvent:
        return await self.add(
            ProposalEvent(proposal_id=proposal_id, kind=kind, detail=detail or {})
        )

    async def for_proposal(self, proposal_id: uuid.UUID) -> Sequence[ProposalEvent]:
        statement = (
            select(ProposalEvent)
            .where(ProposalEvent.proposal_id == proposal_id)
            .order_by(ProposalEvent.at.desc(), ProposalEvent.id.desc())
        )
        return (await self.db.execute(statement)).scalars().all()
