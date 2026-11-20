"""What the customer opens from their link. Reached by the link's token only, never by a proposal id."""

import asyncio

from fastapi import APIRouter, Depends, Path, Response

from app.api.deps import Proposals
from app.core.rate_limit import rate_limited
from app.models.proposal import Proposal
from app.schemas.public import AcceptRequest, PublicProposal
from app.services.proposal.render import render_proposal_pdf
from app.services.proposals import ProposalService, parts
from app.services.sharing import accept, not_found, public_view, record_view

router = APIRouter(prefix="/public/proposals", tags=["customer link"])

Token = Path(min_length=20, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


async def _by_token(service: ProposalService, token: str) -> Proposal:
    proposal = await service.proposals.by_token(token)
    if proposal is None:
        raise not_found()
    return proposal


async def _accepted_by(service: ProposalService, proposal: Proposal) -> str | None:
    for event in await service.events.for_proposal(proposal.id):
        if event.kind == "accepted_online":
            return str(event.detail.get("name") or "") or None
    return None


@router.get("/{token}", dependencies=[Depends(rate_limited("public"))])
async def view(service: Proposals, token: str = Token) -> PublicProposal:
    """The proposal as the customer sees it. The first opening is noted in the partner's history."""
    proposal = await _by_token(service, token)
    await record_view(service, proposal)
    return public_view(proposal, await _accepted_by(service, proposal))


@router.get(
    "/{token}/pdf",
    response_class=Response,
    dependencies=[Depends(rate_limited("public"))],
    responses={200: {"content": {"application/pdf": {}}, "description": "The proposal PDF"}},
)
async def pdf(service: Proposals, token: str = Token) -> Response:
    proposal = await _by_token(service, token)
    invoice, scenario, partner = parts(proposal)
    rendered = await asyncio.to_thread(
        render_proposal_pdf, invoice, partner, scenario, None, proposal.reference
    )
    return Response(
        content=rendered.content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{rendered.reference}.pdf"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/{token}/accept", dependencies=[Depends(rate_limited("accept"))])
async def accept_proposal(
    body: AcceptRequest, service: Proposals, token: str = Token
) -> PublicProposal:
    """The customer accepts: the proposal becomes Won and the partner sees who accepted, with their note."""
    proposal = await _by_token(service, token)
    await accept(service, proposal, body.name, body.note)
    return public_view(proposal, body.name)
