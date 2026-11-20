"""Reports for the team (not partner screens)."""

from fastapi import APIRouter

from app.api.deps import DbSession
from app.repositories.correction import CorrectionRepository
from app.schemas.insights import ReadingReport
from app.services.corrections import reading_report

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/reading")
async def reading(db: DbSession) -> ReadingReport:
    """How often partners corrected each reader's work, the most corrected fields by courier, and the
    hints the AI now gets on new reads. Built from saved proposals."""
    return await reading_report(CorrectionRepository(db))
