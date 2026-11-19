from fastapi import APIRouter

from app.schemas.comparison import ComparisonRequest, ComparisonResult
from app.services.pricing.comparison import compare_invoice

router = APIRouter(prefix="/comparisons", tags=["comparisons"])


@router.post("")
async def create_comparison(body: ComparisonRequest) -> ComparisonResult:
    """Compares the reviewed invoice with the BCOM rate card."""
    return compare_invoice(body.invoice)
