import logging

from fastapi import APIRouter, Depends

from app.clients.ai.factory import get_ai_provider
from app.core.exceptions import AppError
from app.core.rate_limit import rate_limited
from app.schemas.api import MessageResponse, ProposalRequest
from app.services.pricing.comparison import compare_invoice
from app.services.whatsapp import build_sales_message_facts, render_template_message

log = logging.getLogger("bcom.messages")

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("", dependencies=[Depends(rate_limited("messages"))])
async def create_message(body: ProposalRequest) -> MessageResponse:
    """Writes the WhatsApp message. Numbers are recalculated here, never taken from the browser."""
    summary = compare_invoice(body.invoice).summary
    if not summary.has_saving:
        raise AppError(
            "BCOM is not cheaper than the current courier for these shipments, so there is no saving to message about.",
            status_code=422,
            code="no_saving",
        )

    facts = build_sales_message_facts(summary, body.partner)
    provider = get_ai_provider()
    if provider.info.id == "mock":
        return MessageResponse(message=render_template_message(facts), source="template")

    try:
        return MessageResponse(message=await provider.write_sales_message(facts), source="ai")
    except AppError as error:
        # The message is not critical: fall back to the template so the demo can continue.
        log.warning("AI message failed (%s), using the template", error.code)
        return MessageResponse(
            message=render_template_message(facts),
            source="template",
            notice=f"{provider.info.label} could not write the message, so the standard template was used.",
        )
