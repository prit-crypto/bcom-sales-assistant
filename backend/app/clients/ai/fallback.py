"""Tries a second AI reader when the first one is busy, rate-limited or failing."""

from app.clients.ai.base import AIProvider, SalesMessageFacts
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.schemas.api import ProviderInfo
from app.schemas.raw_invoice import RawInvoice
from app.services.invoice.upload import InvoiceFile

log = get_logger("bcom.ai.fallback")

# Failures worth trying elsewhere. A rejected key or an unreadable file would fail there too.
RETRYABLE = {"ai_busy", "ai_rate_limited", "ai_request_failed", "ai_timeout"}


class FallbackProvider:
    def __init__(self, primary: AIProvider, secondary: AIProvider) -> None:
        self.primary = primary
        self.secondary = secondary
        self.info: ProviderInfo = primary.info

    async def extract_invoice(self, file: InvoiceFile) -> RawInvoice:
        try:
            return await self.primary.extract_invoice(file)
        except AppError as error:
            if error.code not in RETRYABLE:
                raise
            log.warning(
                "primary reader failed, trying back-up",
                code=error.code,
                backup=self.secondary.info.id,
            )
        raw = await self.secondary.extract_invoice(file)
        raw.notes.append(
            f"{self.primary.info.label} was not available, so this invoice was read with "
            f"{self.secondary.info.label}. Please double-check the values."
        )
        return raw

    async def write_sales_message(self, facts: SalesMessageFacts) -> str:
        try:
            return await self.primary.write_sales_message(facts)
        except AppError as error:
            if error.code not in RETRYABLE:
                raise
            return await self.secondary.write_sales_message(facts)
