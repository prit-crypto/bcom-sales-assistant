"""The customer's link: an unguessable token per proposal, what the customer sees, and accepting online."""

import secrets
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.models.proposal import Proposal
from app.schemas.public import (
    PublicGroup,
    PublicPartner,
    PublicProposal,
    PublicService,
    PublicStatus,
)
from app.services.pricing.comparison import compare_invoice
from app.services.proposal.examples import saving_examples
from app.services.proposal.i18n import assumptions, conditions, date_text
from app.services.proposal.render import relabel, service_rows
from app.services.proposals import ProposalService, parts, today


def new_token() -> str:
    return secrets.token_urlsafe(32)


def link_path(token: str) -> str:
    return f"/p/{token}"


def link_url(token: str) -> str:
    return f"{get_settings().public_app_url.rstrip('/')}{link_path(token)}"


def not_found() -> AppError:
    # The same answer for a wrong, old or turned-off link: nothing to learn by guessing.
    return AppError(
        "This proposal link doesn't work any more. Ask your BCOM partner for a new one.",
        status_code=404,
        code="link_not_found",
    )


def _local_date(moment: datetime) -> date:
    return moment.astimezone(ZoneInfo(get_settings().timezone)).date()


def valid_until(proposal: Proposal) -> date:
    _, _, partner = parts(proposal)
    start = proposal.sent_at or proposal.created_at
    return _local_date(start) + timedelta(days=partner.validity_days)


def public_status(proposal: Proposal) -> PublicStatus:
    if proposal.status == "won":
        return "accepted"
    if proposal.status == "lost" or not proposal.has_saving:
        return "closed"
    if today() > valid_until(proposal):
        return "expired"
    return "open"


def public_view(proposal: Proposal, accepted_by: str | None = None) -> PublicProposal:
    invoice, scenario, partner = parts(proposal)
    comparison = compare_invoice(invoice, scenario=scenario)
    summary = comparison.summary
    language = partner.language
    until = valid_until(proposal)
    return PublicProposal(
        reference=proposal.reference,
        prospect_name=proposal.prospect_name,
        language=language,
        currency=summary.currency,
        monthly_saving=summary.monthly_saving,
        yearly_saving=summary.yearly_saving,
        saving_pct=summary.saving_pct,
        monthly_current=summary.monthly_current,
        monthly_proposed=summary.monthly_proposed,
        compared_shipments=summary.compared_shipments,
        total_shipments=summary.total_shipments,
        period=f"{date_text(invoice.period_start, language)} – {date_text(invoice.period_end, language)}"
        if invoice.period_start and invoice.period_end
        else "",
        examples=saving_examples(invoice, comparison, language),
        regions=[
            PublicGroup(
                label=g.label,
                shipments=g.shipments,
                current=g.current,
                proposed=g.proposed,
                saving=g.saving,
            )
            for g in relabel(summary.by_zone, language, lanes=False)
        ],
        services=[
            PublicService(
                title=str(row["title"]),
                description=str(row["description"]),
                shipments=row["group"].shipments,  # type: ignore[attr-defined]
                saving=row["group"].saving,  # type: ignore[attr-defined]
            )
            for row in service_rows(summary.by_service, language)
        ],
        assumptions=assumptions(summary, invoice.currency is not None, language),
        conditions=conditions(until.isoformat(), language),
        valid_until=until,
        status=public_status(proposal),
        accepted_by=accepted_by if proposal.status == "won" else None,
        accepted_at=proposal.decided_at if proposal.status == "won" else None,
        partner=PublicPartner(
            name=partner.partner_name,
            company=partner.partner_company,
            phone=partner.partner_phone,
            email=partner.partner_email,
            booking_url=partner.booking_url,
            logo=partner.partner_logo,
        ),
    )


async def accept(service: ProposalService, proposal: Proposal, name: str, note: str) -> None:
    status = public_status(proposal)
    if status == "accepted":
        raise AppError(
            "This proposal has already been accepted.", status_code=409, code="already_accepted"
        )
    if status == "closed":
        raise AppError(
            "This proposal is no longer on offer. Ask your BCOM partner for a new one.",
            status_code=409,
            code="proposal_closed",
        )
    if status == "expired":
        raise AppError(
            "These rates have expired. Ask your BCOM partner for an updated proposal.",
            status_code=410,
            code="proposal_expired",
        )
    now = datetime.now(UTC)
    if proposal.status == "draft":
        proposal.sent_at = now
    proposal.status = "won"
    proposal.decided_at = now
    proposal.follow_up_on = None
    proposal.lost_reason = None
    proposal.updated_at = now
    detail: dict[str, object] = {"name": name}
    if note:
        detail["note"] = note
    await service.events.record(proposal.id, "accepted_online", detail)


async def record_view(service: ProposalService, proposal: Proposal) -> None:
    """The first opening goes into the history; later ones are only counted."""
    proposal.view_count += 1
    if proposal.viewed_at is None:
        proposal.viewed_at = datetime.now(UTC)
        await service.events.record(proposal.id, "customer_opened")
