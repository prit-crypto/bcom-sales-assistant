"""Database tables. Imported here so Alembic and `Base.metadata` see every one."""

from app.models.correction import ReadingCorrection
from app.models.proposal import Proposal, ProposalEvent

__all__ = ["Proposal", "ProposalEvent", "ReadingCorrection"]
