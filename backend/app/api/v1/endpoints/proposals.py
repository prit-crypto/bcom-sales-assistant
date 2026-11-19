import asyncio

from fastapi import APIRouter
from fastapi.responses import Response

from app.schemas.api import ProposalRequest
from app.services.proposal.render import render_proposal_pdf

router = APIRouter(prefix="/proposals", tags=["proposals"])


@router.post(
    "",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}, "description": "The proposal PDF"}},
)
async def create_proposal(body: ProposalRequest) -> Response:
    """Builds the customer proposal PDF. Numbers are recalculated here, never taken from the browser."""
    # PDF rendering is CPU-bound; keep it off the event loop.
    pdf = await asyncio.to_thread(render_proposal_pdf, body.invoice, body.partner)
    return Response(
        content=pdf.content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{pdf.reference}.pdf"',
            "Cache-Control": "no-store",
        },
    )
