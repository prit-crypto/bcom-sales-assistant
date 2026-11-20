"""Saved proposals: what the pipeline screens send and receive."""

import uuid
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BeforeValidator, Field

from app.schemas.api import SavedPartner
from app.schemas.base import ApiModel
from app.schemas.comparison import ComparisonResult, Scenario
from app.schemas.invoice import InvoiceData

ProposalStatus = Literal["draft", "sent", "won", "lost"]
EventKind = Literal["pdf_downloaded", "excel_downloaded", "message_copied", "whatsapp_opened"]


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


Notes = Annotated[str, BeforeValidator(_strip), Field(max_length=4000)]


class ReaderInput(ApiModel):
    """Who read the invoice: an AI provider and model, "mock", or "spreadsheet"."""

    provider: Annotated[str, Field(min_length=1, max_length=20)]
    model: Annotated[str, Field(max_length=80)] | None = None


FileName = Annotated[str, Field(max_length=255)]


class ProposalCreate(ApiModel):
    """Saved at "Compare with BCOM rates": the reviewed invoice, the what-if and the partner details.
    `original_invoice` (as first read) and `reader` let the app learn from the partner's corrections."""

    invoice: InvoiceData
    scenario: Scenario = Field(default_factory=Scenario)
    partner: SavedPartner
    source_file_name: FileName | None = None
    source_files: list[FileName] = Field(default_factory=list, max_length=3)
    original_invoice: InvoiceData | None = None
    reader: ReaderInput | None = None


class ProposalUpdate(ApiModel):
    """Any subset of the fields; only the ones sent are changed (send `follow_up_on: null` to clear it)."""

    invoice: InvoiceData | None = None
    scenario: Scenario | None = None
    partner: SavedPartner | None = None
    message: Annotated[str, Field(max_length=4000)] | None = None
    status: ProposalStatus | None = None
    follow_up_on: date | None = None
    lost_reason: Annotated[str, BeforeValidator(_strip), Field(max_length=200)] | None = None
    notes: Notes | None = None


class ProposalItem(ApiModel):
    """One row of the pipeline list. Figures are the server's own, recalculated on every change."""

    id: uuid.UUID
    reference: str
    prospect_name: str
    status: ProposalStatus
    currency: str
    monthly_saving: float
    yearly_saving: float
    has_saving: bool
    compared_shipments: int
    total_shipments: int
    follow_up_on: date | None
    # Sent, and the follow-up date has come
    follow_up_due: bool
    created_at: datetime
    updated_at: datetime
    sent_at: datetime | None
    decided_at: datetime | None


class ProposalList(ApiModel):
    items: list[ProposalItem]
    # Sent proposals whose follow-up date has come (for the badge), whatever the filter
    follow_up_due: int


class ProposalEventOut(ApiModel):
    kind: str
    detail: dict[str, Any]
    at: datetime


class ProposalDetail(ProposalItem):
    invoice: InvoiceData
    scenario: Scenario
    partner: SavedPartner
    message: str | None
    notes: str
    lost_reason: str | None
    source_file_name: str | None
    # Every invoice file in the proposal (several months can be combined)
    source_files: list[str]
    # The customer's link (/p/<token>) when there is one, and when the customer first opened it
    share_path: str | None
    viewed_at: datetime | None
    view_count: int
    comparison: ComparisonResult
    events: list[ProposalEventOut]


class ProposalEventCreate(ApiModel):
    kind: EventKind


_EMAIL = r"^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$"
EmailAddress = Annotated[str, BeforeValidator(_strip), Field(max_length=254, pattern=_EMAIL)]


class EmailDraft(ApiModel):
    """What the email form starts with; the partner can change everything."""

    to: str
    subject: str
    message: str
    email_enabled: bool


class EmailRequest(ApiModel):
    to: EmailAddress
    cc: list[EmailAddress] = Field(default_factory=list, max_length=5)
    subject: Annotated[str, BeforeValidator(_strip), Field(min_length=1, max_length=200)]
    message: Annotated[str, Field(min_length=1, max_length=5000)]
    attach_pdf: bool = True
    # Adds the customer's link (made if needed) at the end of the message
    include_link: bool = True
