import time

from fastapi import APIRouter, Depends, File, Response, UploadFile

from app.clients.ai.factory import get_ai_provider
from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.rate_limit import rate_limited
from app.schemas.api import ExtractResponse
from app.services.invoice.cache import extraction_cache
from app.services.invoice.normalize import normalize_invoice
from app.services.invoice.upload import read_invoice_upload

log = get_logger("bcom.invoices")

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.post("/extract", dependencies=[Depends(rate_limited("extract"))])
async def extract_invoice(
    response: Response, file: UploadFile | None = File(default=None)
) -> ExtractResponse:
    """Reads an uploaded courier invoice with the active provider and returns clean, editable data.

    The same file read again by the same provider and model comes from the cache (header `X-Cache: hit`).
    """
    settings = get_settings()
    upload = await read_invoice_upload(file, settings.max_upload_mb)
    provider = get_ai_provider()
    key = extraction_cache.key(upload.data, provider.info.id, provider.info.model)

    cached = extraction_cache.get(key, settings.extract_cache_ttl_seconds)
    if cached is not None:
        response.headers["X-Cache"] = "hit"
        log.info(
            "invoice_read", provider=provider.info.id, cache="hit", shipments=len(cached.shipments)
        )
        return ExtractResponse(provider=provider.info, invoice=cached)

    started = time.perf_counter()
    raw = await provider.extract_invoice(upload)
    invoice = normalize_invoice(raw)
    extraction_cache.put(key, invoice, settings.extract_cache_size)
    response.headers["X-Cache"] = "miss"
    # Counts and timings only: no customer names or amounts in the logs.
    log.info(
        "invoice_read",
        provider=provider.info.id,
        model=provider.info.model,
        cache="miss",
        file_type=upload.mime_type,
        file_kb=round(len(upload.data) / 1024),
        shipments=len(invoice.shipments),
        warnings=len(invoice.warnings),
        duration_ms=round((time.perf_counter() - started) * 1000),
    )
    return ExtractResponse(provider=provider.info, invoice=invoice)
