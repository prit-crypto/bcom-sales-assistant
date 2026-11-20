"""The read flow shared by `/invoices/extract` and its live-progress stream.

Reports each stage through `on_stage` (the stream sends them to the browser; the plain endpoint ignores them):
checked → reading → cleaning → checking. Spreadsheets are read without AI; AI reads use the cache.
"""

import hashlib
import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.clients.ai.factory import get_ai_provider
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.schemas.api import ProviderInfo
from app.schemas.invoice import InvoiceData
from app.services.invoice.cache import extraction_cache
from app.services.invoice.checks import check_invoice
from app.services.invoice.normalize import normalize_invoice
from app.services.invoice.spreadsheet import parse_spreadsheet
from app.services.invoice.timing import read_times
from app.services.invoice.upload import SPREADSHEETS, InvoiceFile

log = get_logger("bcom.invoices")

SAMPLE_HASHES = Path(__file__).resolve().parents[2] / "assets" / "sample_hashes.json"

StageCallback = Callable[[str, dict[str, Any]], Awaitable[None]]


async def _ignore(_stage: str, _detail: dict[str, Any]) -> None:
    return None


@lru_cache
def sample_hashes() -> frozenset[str]:
    return frozenset(json.loads(SAMPLE_HASHES.read_text()).values())


@dataclass
class ReadResult:
    provider: ProviderInfo
    invoice: InvoiceData
    # True / False for AI reads (cache hit or not); None for spreadsheets
    cache_hit: bool | None


async def read_invoice(upload: InvoiceFile, on_stage: StageCallback = _ignore) -> ReadResult:
    settings = get_settings()
    if (
        settings.allow_only_sample_files
        and hashlib.sha256(upload.data).hexdigest() not in sample_hashes()
    ):
        raise AppError(
            "This demo server only accepts the sample invoices, to keep real customer data off the free AI tier.",
            status_code=403,
            code="samples_only",
        )
    await on_stage("checked", {"file_type": upload.mime_type})
    provider = get_ai_provider()

    if upload.mime_type in SPREADSHEETS:
        started = time.perf_counter()
        await on_stage("reading", {"label": "Reading the spreadsheet", "typical_seconds": None})
        raw = parse_spreadsheet(upload)
        await on_stage("cleaning", {})
        invoice = normalize_invoice(raw)
        await _checking(invoice, on_stage)
        log.info(
            "invoice_read",
            provider="spreadsheet",
            file_type=upload.mime_type,
            shipments=len(invoice.shipments),
            duration_ms=round((time.perf_counter() - started) * 1000),
        )
        return ReadResult(provider=provider.info, invoice=invoice, cache_hit=None)

    key = extraction_cache.key(upload.data, provider.info.id, provider.info.model, upload.hints)
    cached = extraction_cache.get(key, settings.extract_cache_ttl_seconds)
    if cached is not None:
        await on_stage(
            "reading", {"label": "Read before: using the earlier reading", "typical_seconds": None}
        )
        await _checking(cached, on_stage)
        log.info(
            "invoice_read", provider=provider.info.id, cache="hit", shipments=len(cached.shipments)
        )
        return ReadResult(provider=provider.info, invoice=cached, cache_hit=True)

    timing_key = read_times.key(provider.info.id, provider.info.model)
    await on_stage(
        "reading",
        {
            "label": f"{provider.info.label} is reading the invoice",
            "typical_seconds": read_times.typical(timing_key),
        },
    )
    started = time.perf_counter()
    raw = await provider.extract_invoice(upload)
    elapsed = time.perf_counter() - started
    read_times.record(timing_key, elapsed)
    await on_stage("cleaning", {})
    invoice = normalize_invoice(raw)
    extraction_cache.put(key, invoice, settings.extract_cache_size)
    await _checking(invoice, on_stage)
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
        hints=len(upload.hints),
        duration_ms=round(elapsed * 1000),
    )
    return ReadResult(provider=provider.info, invoice=invoice, cache_hit=False)


async def _checking(invoice: InvoiceData, on_stage: StageCallback) -> None:
    await on_stage(
        "checking", {"shipments": len(invoice.shipments), "checks": len(check_invoice(invoice))}
    )
