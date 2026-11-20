"""The interface every invoice reader (mock, Gemini, OpenAI) implements."""

from dataclasses import dataclass, field
from typing import Protocol

from app.schemas.api import ProviderInfo
from app.schemas.raw_invoice import RawInvoice
from app.services.invoice.upload import InvoiceFile


@dataclass(frozen=True)
class SalesMessageFacts:
    """The only numbers and names a WhatsApp message may use. Money values are pre-formatted."""

    prospect_name: str
    partner_name: str
    partner_company: str
    monthly_saving: str
    yearly_saving: str
    saving_percent: str
    compared_shipments: int
    total_shipments: int
    proposal_validity_days: int
    top_saving_routes: list[str] = field(default_factory=list)
    # "en" or "ar": the language of the message.
    language: str = "en"
    # Where the prospect can book the call; empty when the partner gave none.
    booking_url: str = ""
    # Set when the what-if moves non-urgent parcels to Economy: monthly_saving is then the like-for-like
    # figure and this the saving with Economy.
    economy_monthly_saving: str | None = None
    # What-if volume change, e.g. "+20%"; empty when the estimate uses the invoice's own volume.
    volume_change: str = ""


class AIProvider(Protocol):
    info: ProviderInfo

    async def extract_invoice(self, file: InvoiceFile) -> RawInvoice:
        """Reads a courier invoice into the shared raw schema."""
        ...

    async def write_sales_message(self, facts: SalesMessageFacts) -> str:
        """Writes a WhatsApp message from pre-computed facts."""
        ...
