"""No-AI provider: reads only our sample invoice format and uses a fixed message template."""

import asyncio

from app.clients.ai.base import SalesMessageFacts
from app.core.exceptions import AppError
from app.schemas.api import ProviderInfo
from app.schemas.raw_invoice import RawInvoice
from app.services.invoice.mock_parser import parse_sample_invoice_text
from app.services.invoice.pdf_text import extract_pdf_pages
from app.services.invoice.upload import InvoiceFile
from app.services.whatsapp import render_template_message


class MockProvider:
    info = ProviderInfo(id="mock", label="Mock (no AI)", model=None, reads_images=False)

    async def extract_invoice(self, file: InvoiceFile) -> RawInvoice:
        if file.mime_type != "application/pdf":
            raise AppError(
                "Mock mode reads only the sample PDF invoices. To read photos, set AI_PROVIDER to gemini or openai.",
                status_code=422,
                code="mock_unsupported_file",
            )
        pages = await asyncio.to_thread(extract_pdf_pages, file.data)
        raw = parse_sample_invoice_text(pages)
        if not raw.shipments:
            raise AppError(
                "Mock mode could not find shipment lines. It only reads the bundled sample invoices. To read other invoices, set AI_PROVIDER to gemini or openai.",
                status_code=422,
                code="mock_unknown_format",
            )
        return raw

    async def write_sales_message(self, facts: SalesMessageFacts) -> str:
        return render_template_message(facts)
