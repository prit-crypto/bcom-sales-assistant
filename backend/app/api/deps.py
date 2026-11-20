"""Shared FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.repositories.correction import CorrectionRepository
from app.repositories.proposal import ProposalEventRepository, ProposalRepository
from app.services.proposals import ProposalService

# scope="function": the transaction commits before the response is sent. Otherwise the browser could read
# right after a change and see only part of it (e.g. the history line but not the new value).
DbSession = Annotated[AsyncSession, Depends(get_db, scope="function")]


def proposal_service(db: DbSession) -> ProposalService:
    return ProposalService(
        ProposalRepository(db), ProposalEventRepository(db), CorrectionRepository(db)
    )


Proposals = Annotated[ProposalService, Depends(proposal_service)]
