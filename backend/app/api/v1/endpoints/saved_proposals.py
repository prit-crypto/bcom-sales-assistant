"""Saved proposals: the pipeline of drafts, sent, won and lost proposals, with their history."""

import asyncio
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import Proposals
from app.api.v1.endpoints.exports import XLSX_TYPE
from app.core.config import get_settings
from app.core.rate_limit import rate_limited
from app.models.proposal import Proposal
from app.schemas.proposal import (
    EmailDraft,
    EmailRequest,
    ProposalCreate,
    ProposalDetail,
    ProposalEventCreate,
    ProposalList,
    ProposalStatus,
    ProposalUpdate,
)
from app.schemas.public import ShareLink
from app.services import email as mail
from app.services.export import build_workbook, export_file_name
from app.services.pricing.comparison import compare_invoice
from app.services.proposal.render import render_proposal_pdf
from app.services.proposals import parts, to_item, today
from app.services.sharing import link_path, link_url, new_token, valid_until

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


async def _ensure_link(service: Proposals, proposal: Proposal) -> str:
    if not proposal.share_token:
        proposal.share_token = new_token()
        await service.events.record(proposal.id, "link_created")
    return proposal.share_token


@router.post("/{proposal_id}/share")
async def create_link(proposal_id: uuid.UUID, service: Proposals) -> ShareLink:
    """The customer's link, made the first time (later calls return the same link)."""
    proposal = await service.get(proposal_id)
    token = await _ensure_link(service, proposal)
    return ShareLink(token=token, path=link_path(token))


@router.delete("/{proposal_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def turn_off_link(proposal_id: uuid.UUID, service: Proposals) -> Response:
    """Turns the customer's link off: the old address stops working. A new link can be made later."""
    proposal = await service.get(proposal_id)
    if proposal.share_token:
        proposal.share_token = None
        await service.events.record(proposal.id, "link_turned_off")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{proposal_id}/email-draft")
async def email_draft(proposal_id: uuid.UUID, service: Proposals) -> EmailDraft:
    """The subject and message the email form starts with, in the customer's language."""
    proposal = await service.get(proposal_id)
    _, _, partner = parts(proposal)
    subject, message = mail.draft(
        partner,
        proposal.monthly_saving,
        proposal.yearly_saving,
        proposal.currency,
        valid_until(proposal).isoformat(),
    )
    return EmailDraft(
        to="", subject=subject, message=message, email_enabled=get_settings().email_enabled
    )


@router.post("/{proposal_id}/email", dependencies=[Depends(rate_limited("email"))])
async def send_email(
    proposal_id: uuid.UUID, body: EmailRequest, service: Proposals
) -> ProposalDetail:
    """Emails the proposal (PDF attached, customer link added when asked). A draft becomes sent."""
    if not get_settings().email_enabled:
        raise mail.email_off()
    proposal = await service.get(proposal_id)
    invoice, scenario, partner = parts(proposal)
    text = body.message.rstrip()
    if body.include_link:
        text += "\n\n" + mail.link_paragraph(
            link_url(await _ensure_link(service, proposal)), partner.language
        )
    attachment = None
    if body.attach_pdf:
        rendered = await asyncio.to_thread(
            render_proposal_pdf, invoice, partner, scenario, None, proposal.reference
        )
        attachment = (f"{rendered.reference}.pdf", rendered.content)
    message = mail.build_message(
        to=body.to,
        cc=body.cc,
        reply_to=partner.partner_email or None,
        subject=body.subject,
        text=text,
        rtl=partner.language == "ar",
        attachment=attachment,
    )
    await asyncio.to_thread(mail.deliver, message)
    await service.events.record(
        proposal.id, "emailed", {"to": body.to, "cc": len(body.cc), "pdf": body.attach_pdf}
    )
    if proposal.status == "draft" and proposal.has_saving:
        await service.update(proposal, ProposalUpdate(status="sent"))
    return await service.detail(proposal)
