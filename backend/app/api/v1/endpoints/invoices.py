import hashlib
import json
import time
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, File, Response, UploadFile

from app.clients.ai.factory import get_ai_provider
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.rate_limit import rate_limited
from app.schemas.api import ExtractResponse
from app.schemas.comparison import CheckRequest, CheckResponse
from app.services.invoice.cache import extraction_cache
from app.services.invoice.checks import check_invoice
from app.services.invoice.normalize import normalize_invoice
from app.services.invoice.spreadsheet import parse_spreadsheet
from app.services.invoice.upload import SPREADSHEETS, read_invoice_upload

log = get_logger("bcom.invoices")

router = APIRouter(prefix="/invoices", tags=["invoices"])

SAMPLE_HASHES = Path(__file__).resolve().parents[3] / "assets" / "sample_hashes.json"


@lru_cache
def sample_hashes() -> frozenset[str]:
    return frozenset(json.loads(SAMPLE_HASHES.read_text()).values())


@router.post("/extract", dependencies=[Depends(rate_limited("extract"))])
async def extract_invoice(
    response: Response, file: UploadFile | None = File(default=None)
) -> ExtractResponse:
    """Reads an uploaded courier invoice and returns clean, editable data.

    PDFs and photos go to the active AI provider; CSV and Excel statements are read directly, without AI.
    The same file read again by the same provider and model comes from the cache (header `X-Cache: hit`).
    """
    settings = get_settings()
    upload = await read_invoice_upload(file, settings.max_upload_mb)
    if (
        settings.allow_only_sample_files
        and hashlib.sha256(upload.data).hexdigest() not in sample_hashes()
    ):
        raise AppError(
            "This demo server only accepts the sample invoices, to keep real customer data off the free AI tier.",
            status_code=403,
            code="samples_only",
        )
    provider = get_ai_provider()

    if upload.mime_type in SPREADSHEETS:
        started = time.perf_counter()
        invoice = normalize_invoice(parse_spreadsheet(upload))
        log.info(
            "invoice_read",
            provider="spreadsheet",
            file_type=upload.mime_type,
            shipments=len(invoice.shipments),
            duration_ms=round((time.perf_counter() - started) * 1000),
        )
        return ExtractResponse(provider=provider.info, invoice=invoice)

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
        uncertain=sum(len(s.uncertain_fields) for s in invoice.shipments),
        duration_ms=round((time.perf_counter() - started) * 1000),
    )
    return ExtractResponse(provider=provider.info, invoice=invoice)


@router.post("/check")
async def check(body: CheckRequest) -> CheckResponse:
    """Sanity checks on the reviewed invoice (totals, duplicates, outliers). No AI, instant."""
    return CheckResponse(checks=check_invoice(body.invoice))
