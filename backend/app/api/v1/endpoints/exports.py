import asyncio

from fastapi import APIRouter
from fastapi.responses import Response

from app.schemas.comparison import ComparisonRequest
from app.services.export import build_workbook, export_file_name
from app.services.pricing.comparison import compare_invoice

router = APIRouter(prefix="/exports", tags=["exports"])

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.post(
    "/comparison",
    response_class=Response,
    responses={
        200: {"content": {XLSX_TYPE: {}}, "description": "The comparison as an Excel workbook"}
    },
)
async def export_comparison(body: ComparisonRequest) -> Response:
    """The comparison (with any what-if) as an Excel workbook. Numbers are recalculated here."""
    comparison = compare_invoice(body.invoice, scenario=body.scenario)
    content = await asyncio.to_thread(build_workbook, body.invoice, comparison)
    return Response(
        content=content,
        media_type=XLSX_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{export_file_name(body.invoice)}"',
            "Cache-Control": "no-store",
        },
    )
