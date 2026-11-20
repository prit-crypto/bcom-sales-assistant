"""Saved proposals: the pipeline of drafts, sent, won and lost proposals, with their history."""

import asyncio
import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import Proposals
from app.api.v1.endpoints.exports import XLSX_TYPE
from app.schemas.proposal import (
    ProposalCreate,
    ProposalDetail,
    ProposalEventCreate,
    ProposalList,
    ProposalStatus,
    ProposalUpdate,
)
from app.services.export import build_workbook, export_file_name
from app.services.pricing.comparison import compare_invoice
from app.services.proposal.render import render_proposal_pdf
from app.services.proposals import parts, to_item, today

router = APIRouter(prefix="/proposals", tags=["saved proposals"])


@router.get("")
async def list_proposals(
    service: Proposals,
    status_filter: Annotated[ProposalStatus | None, Query(alias="status")] = None,
    q: Annotated[
        str | None, Query(max_length=120, description="Prospect name or reference")
    ] = None,
) -> ProposalList:
    """Newest change first, with the count of sent proposals due for a follow-up."""
    items = await service.proposals.search(status=status_filter, query=q)
    due = await service.proposals.due_for_follow_up(today())
    return ProposalList(items=[to_item(p) for p in items], follow_up_due=due)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_proposal(body: ProposalCreate, service: Proposals) -> ProposalDetail:
    """Saves a draft from the reviewed invoice. The figures are calculated here."""
    return await service.detail(await service.create(body))


@router.get("/{proposal_id}")
async def get_proposal(proposal_id: uuid.UUID, service: Proposals) -> ProposalDetail:
    return await service.detail(await service.get(proposal_id))


@router.patch("/{proposal_id}")
async def update_proposal(
    proposal_id: uuid.UUID, body: ProposalUpdate, service: Proposals
) -> ProposalDetail:
    """Autosave and status changes. Only the fields sent are changed; figures are recalculated."""
    proposal = await service.update(await service.get(proposal_id), body)
    return await service.detail(proposal)


@router.delete("/{proposal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_proposal(proposal_id: uuid.UUID, service: Proposals) -> Response:
    """Deletes the proposal, its data and its history. It can't be undone."""
    await service.proposals.delete(await service.get(proposal_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{proposal_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}, "description": "The proposal PDF"}},
)
async def proposal_pdf(proposal_id: uuid.UUID, service: Proposals) -> Response:
    """The proposal PDF, built again from the saved data."""
    proposal = await service.get(proposal_id)
    invoice, scenario, partner = parts(proposal)
    pdf = await asyncio.to_thread(
        render_proposal_pdf, invoice, partner, scenario, None, proposal.reference
    )
    await service.events.record(proposal.id, "pdf_downloaded")
    return Response(
        content=pdf.content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{pdf.reference}.pdf"',
            "Cache-Control": "no-store",
        },
    )


@router.get(
    "/{proposal_id}/excel",
    response_class=Response,
    responses={200: {"content": {XLSX_TYPE: {}}, "description": "The comparison as Excel"}},
)
async def proposal_excel(proposal_id: uuid.UUID, service: Proposals) -> Response:
    """The comparison as an Excel workbook, built again from the saved data."""
    proposal = await service.get(proposal_id)
    invoice, scenario, _ = parts(proposal)
    content = await asyncio.to_thread(
        build_workbook, invoice, compare_invoice(invoice, scenario=scenario)
    )
    await service.events.record(proposal.id, "excel_downloaded")
    return Response(
        content=content,
        media_type=XLSX_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{export_file_name(invoice)}"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/{proposal_id}/events", status_code=status.HTTP_204_NO_CONTENT)
async def record_event(
    proposal_id: uuid.UUID, body: ProposalEventCreate, service: Proposals
) -> Response:
    """Adds a line to the history: PDF or Excel downloaded, message copied, WhatsApp opened."""
    proposal = await service.get(proposal_id)
    await service.events.record(proposal.id, body.kind)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
