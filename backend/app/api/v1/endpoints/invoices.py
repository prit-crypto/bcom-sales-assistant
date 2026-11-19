from fastapi import APIRouter, File, UploadFile

from app.clients.ai.factory import get_ai_provider
from app.core.config import get_settings
from app.schemas.api import ExtractResponse
from app.services.invoice.normalize import normalize_invoice
from app.services.invoice.upload import read_invoice_upload

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.post("/extract")
async def extract_invoice(file: UploadFile | None = File(default=None)) -> ExtractResponse:
    """Reads an uploaded courier invoice with the active provider and returns clean, editable data."""
    upload = await read_invoice_upload(file, get_settings().max_upload_mb)
    provider = get_ai_provider()
    raw = await provider.extract_invoice(upload)
    return ExtractResponse(provider=provider.info, invoice=normalize_invoice(raw))
