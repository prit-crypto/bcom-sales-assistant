"""Rules for saved proposals: figures always recalculated here, checked status changes, a tidy history."""

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.models.proposal import Proposal, ProposalEvent
from app.repositories.correction import CorrectionRepository
from app.repositories.proposal import ProposalEventRepository, ProposalRepository
from app.schemas.api import PartnerInput, SavedPartner
from app.schemas.comparison import ComparisonResult, Scenario
from app.schemas.invoice import InvoiceData
from app.schemas.proposal import (
    ProposalCreate,
    ProposalDetail,
    ProposalEventOut,
    ProposalItem,
    ProposalStatus,
    ProposalUpdate,
)
from app.services.corrections import record_corrections
from app.services.pricing.comparison import compare_invoice
from app.services.proposal.render import make_reference

# Where a proposal may go next. A decided proposal can be reopened (back to sent).
TRANSITIONS: dict[str, set[str]] = {
    "draft": {"sent", "won", "lost"},
    "sent": {"draft", "won", "lost"},
    "won": {"sent"},
    "lost": {"sent"},
}

# Repeated autosaves of the same kind within this window update one history line instead of adding more.
COALESCE_WINDOW = timedelta(minutes=10)


def today() -> date:
    return datetime.now(ZoneInfo(get_settings().timezone)).date()


def not_found() -> AppError:
    return AppError(
        "This proposal no longer exists. It may have been deleted.",
        status_code=404,
        code="proposal_not_found",
    )


def require_partner(partner: SavedPartner) -> PartnerInput:
    """The partner details a PDF needs: the partner's own name and company must be filled in."""
    if not partner.partner_name or not partner.partner_company:
        raise AppError(
            "Add your name and company on the proposal step first: the PDF shows who prepared it.",
            status_code=422,
            code="partner_details_missing",
        )
    return PartnerInput.model_validate(partner.model_dump())


def parts(proposal: Proposal) -> tuple[InvoiceData, Scenario, SavedPartner]:
    return (
        InvoiceData.model_validate(proposal.invoice),
        Scenario.model_validate(proposal.scenario),
        SavedPartner.model_validate(proposal.partner_details),
    )


def _apply_figures(proposal: Proposal, comparison: ComparisonResult) -> None:
    summary = comparison.summary
    proposal.currency = summary.currency
    proposal.monthly_saving = summary.monthly_saving
    proposal.yearly_saving = summary.yearly_saving
    proposal.has_saving = summary.has_saving
    proposal.compared_shipments = summary.compared_shipments
    proposal.total_shipments = summary.total_shipments


def _item_fields(proposal: Proposal) -> dict[str, object]:
    return {
        "id": proposal.id,
        "reference": proposal.reference,
        "prospect_name": proposal.prospect_name,
        "status": proposal.status,
        "currency": proposal.currency,
        "monthly_saving": proposal.monthly_saving,
        "yearly_saving": proposal.yearly_saving,
        "has_saving": proposal.has_saving,
        "compared_shipments": proposal.compared_shipments,
        "total_shipments": proposal.total_shipments,
        "follow_up_on": proposal.follow_up_on,
        "follow_up_due": proposal.status == "sent"
        and proposal.follow_up_on is not None
        and proposal.follow_up_on <= today(),
        "created_at": proposal.created_at,
        "updated_at": proposal.updated_at,
        "sent_at": proposal.sent_at,
        "decided_at": proposal.decided_at,
    }


def to_item(proposal: Proposal) -> ProposalItem:
    return ProposalItem.model_validate(_item_fields(proposal))


def to_detail(proposal: Proposal, events: list[ProposalEvent]) -> ProposalDetail:
    invoice, scenario, partner = parts(proposal)
    return ProposalDetail.model_validate(
        {
            **_item_fields(proposal),
            "invoice": invoice,
            "scenario": scenario,
            "partner": partner,
            "message": proposal.message,
            "notes": proposal.notes,
            "lost_reason": proposal.lost_reason,
            "source_file_name": proposal.source_file_name,
            "source_files": proposal.source_files
            or ([proposal.source_file_name] if proposal.source_file_name else []),
            "share_path": f"/p/{proposal.share_token}" if proposal.share_token else None,
            "viewed_at": proposal.viewed_at,
            "view_count": proposal.view_count,
            "comparison": compare_invoice(invoice, scenario=scenario),
            "events": [ProposalEventOut(kind=e.kind, detail=e.detail, at=e.at) for e in events],
        }
    )


class ProposalService:
    def __init__(
        self,
        proposals: ProposalRepository,
        events: ProposalEventRepository,
        corrections: CorrectionRepository,
    ) -> None:
        self.proposals = proposals
        self.events = events
        self.corrections = corrections

    async def _learn(self, proposal: Proposal) -> None:
        """Keeps the record of what the partner corrected in the first reading up to date."""
        if proposal.original_invoice is None or proposal.reader is None:
            return
        await record_corrections(
            self.corrections,
            proposal.id,
            InvoiceData.model_validate(proposal.original_invoice),
            InvoiceData.model_validate(proposal.invoice),
            proposal.reader,
        )

    async def get(self, proposal_id: uuid.UUID) -> Proposal:
        proposal = await self.proposals.get(proposal_id)
        if proposal is None:
            raise not_found()
        return proposal

    async def detail(self, proposal: Proposal) -> ProposalDetail:
        return to_detail(proposal, list(await self.events.for_proposal(proposal.id)))

    async def create(self, body: ProposalCreate) -> Proposal:
        comparison = compare_invoice(body.invoice, scenario=body.scenario)
        if comparison.summary.compared_shipments == 0:
            raise AppError(
                "No shipments could be compared, so there is nothing to save as a proposal yet.",
                status_code=422,
                code="nothing_to_propose",
            )
        proposal_id = uuid.uuid4()
        proposal = Proposal(
            id=proposal_id,
            # Unique per saved proposal: the same invoice can be compared more than once.
            reference=f"{make_reference(body.invoice, today())}-{proposal_id.hex[:4].upper()}",
            prospect_name=body.partner.prospect_name,
            status="draft",
            invoice=body.invoice.model_dump(mode="json"),
            scenario=body.scenario.model_dump(mode="json"),
            partner_details=body.partner.model_dump(mode="json"),
            source_file_name=body.source_file_name,
            source_files=body.source_files or None,
            original_invoice=body.original_invoice.model_dump(mode="json")
            if body.original_invoice
            else None,
            reader=body.reader.model_dump(mode="json") if body.reader else None,
            notes="",
        )
        _apply_figures(proposal, comparison)
        await self.proposals.add(proposal)
        await self._learn(proposal)
        await self.events.record(proposal.id, "created", {"file": body.source_file_name})
        return proposal

    async def update(self, proposal: Proposal, body: ProposalUpdate) -> Proposal:
        changed = body.model_fields_set
        if "invoice" in changed and body.invoice is not None:
            proposal.invoice = body.invoice.model_dump(mode="json")
            await self._note(proposal, "shipments_edited")
            await self._learn(proposal)
        if "scenario" in changed and body.scenario is not None:
            proposal.scenario = body.scenario.model_dump(mode="json")
            await self._note(proposal, "scenario_changed", body.scenario.model_dump(mode="json"))
        if "partner" in changed and body.partner is not None:
            proposal.partner_details = body.partner.model_dump(mode="json")
            proposal.prospect_name = body.partner.prospect_name
            await self._note(proposal, "details_changed")
        if changed & {"invoice", "scenario"}:
            invoice, scenario, _ = parts(proposal)
            _apply_figures(proposal, compare_invoice(invoice, scenario=scenario))
        if "message" in changed:
            proposal.message = body.message
            await self._note(proposal, "message_saved")
        if "notes" in changed and body.notes is not None and body.notes != proposal.notes:
            proposal.notes = body.notes
            await self._note(proposal, "notes_changed")
        if "follow_up_on" in changed and body.follow_up_on != proposal.follow_up_on:
            proposal.follow_up_on = body.follow_up_on
            await self.events.record(
                proposal.id,
                "follow_up_set",
                {"on": body.follow_up_on.isoformat() if body.follow_up_on else None},
            )
        if "status" in changed and body.status is not None and body.status != proposal.status:
            await self._change_status(proposal, body.status, body)
        elif "lost_reason" in changed and proposal.status == "lost":
            proposal.lost_reason = body.lost_reason or None
        # The list is ordered by last change; touch it even when only JSON columns changed.
        proposal.updated_at = datetime.now(UTC)
        return proposal

    async def _change_status(
        self, proposal: Proposal, status: ProposalStatus, body: ProposalUpdate
    ) -> None:
        previous = proposal.status
        if status not in TRANSITIONS[previous]:
            raise AppError(
                f"A {previous} proposal can't be marked as {status}.",
                status_code=422,
                code="status_not_allowed",
            )
        if status == "sent" and not proposal.has_saving:
            raise AppError(
                "BCOM is not cheaper for these shipments, so this proposal can't be sent.",
                status_code=422,
                code="no_saving",
            )
        now = datetime.now(UTC)
        proposal.status = status
        if status == "sent":
            proposal.decided_at = None
            proposal.lost_reason = None
            if previous == "draft":
                proposal.sent_at = now
            if "follow_up_on" not in body.model_fields_set:
                proposal.follow_up_on = today() + timedelta(days=get_settings().follow_up_days)
        elif status in ("won", "lost"):
            proposal.decided_at = now
            proposal.follow_up_on = None
            proposal.lost_reason = (body.lost_reason or None) if status == "lost" else None
        else:  # back to draft
            proposal.sent_at = None
            proposal.follow_up_on = None
        detail: dict[str, object] = {"from": previous, "to": status}
        if proposal.lost_reason:
            detail["reason"] = proposal.lost_reason
        await self.events.record(proposal.id, "status_changed", detail)

    async def _note(
        self, proposal: Proposal, kind: str, detail: dict[str, object] | None = None
    ) -> None:
        """Autosave happens often: fold repeats of the same change into the latest history line."""
        history = await self.events.for_proposal(proposal.id)
        latest = history[0] if history else None
        now = datetime.now(UTC)
        if latest is not None and latest.kind == kind and now - latest.at < COALESCE_WINDOW:
            latest.at = now
            latest.detail = detail or {}
            return
        await self.events.record(proposal.id, kind, detail)
