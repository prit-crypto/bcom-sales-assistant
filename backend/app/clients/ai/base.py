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


class AIProvider(Protocol):
    info: ProviderInfo

    async def extract_invoice(self, file: InvoiceFile) -> RawInvoice:
        """Reads a courier invoice into the shared raw schema."""
        ...

    async def write_sales_message(self, facts: SalesMessageFacts) -> str:
        """Writes a WhatsApp message from pre-computed facts."""
        ...
