import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import replace
from typing import Any

from fastapi import APIRouter, Depends, File, Response, UploadFile
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession
from app.clients.ai.factory import get_ai_provider
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.rate_limit import rate_limited
from app.repositories.correction import CorrectionRepository
from app.schemas.api import CombineRequest, ExtractResponse
from app.schemas.comparison import CheckRequest, CheckResponse
from app.schemas.invoice import InvoiceData
from app.services.corrections import reading_hints
from app.services.invoice.checks import check_invoice
from app.services.invoice.combine import combine_invoices
from app.services.invoice.extract import read_invoice
from app.services.invoice.upload import SPREADSHEETS, InvoiceFile, read_invoice_upload

log = get_logger("bcom.invoices")

router = APIRouter(prefix="/invoices", tags=["invoices"])

# While the AI works, a comment line this often keeps proxies from closing the stream.
HEARTBEAT_SECONDS = 5.0


async def _with_hints(upload: InvoiceFile, db: DbSession) -> InvoiceFile:
    """Adds lessons from partners' corrections for AI reads. Reading never fails because of them."""
    if (
        not get_settings().reading_hints
        or upload.mime_type in SPREADSHEETS
        or get_ai_provider().info.id == "mock"
    ):
        return upload
    try:
        return replace(upload, hints=await reading_hints(CorrectionRepository(db)))
    except Exception:
        await db.rollback()
        log.warning("reading_hints_unavailable")
        return upload


@router.post("/extract", dependencies=[Depends(rate_limited("extract"))])
async def extract_invoice(
    response: Response, db: DbSession, file: UploadFile | None = File(default=None)
) -> ExtractResponse:
    """Reads an uploaded courier invoice and returns clean, editable data.

    PDFs and photos go to the active AI provider; CSV and Excel statements are read directly, without AI.
    The same file read again by the same provider and model comes from the cache (header `X-Cache: hit`).
    """
    upload = await _with_hints(await read_invoice_upload(file, get_settings().max_upload_mb), db)
    result = await read_invoice(upload)
    if result.cache_hit is not None:
        response.headers["X-Cache"] = "hit" if result.cache_hit else "miss"
    return ExtractResponse(provider=result.provider, invoice=result.invoice)


def _event(name: str, data: dict[str, Any]) -> str:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post(
    "/extract/stream",
    dependencies=[Depends(rate_limited("extract"))],
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": (
                "Server-sent events: `stage` ({stage, ...}) for received, checked, reading, cleaning and "
                "checking; then `done` (the same body as /extract) or `error` ({code, message})."
            ),
        }
    },
)
async def extract_invoice_stream(
    db: DbSession, file: UploadFile | None = File(default=None)
) -> StreamingResponse:
    """The same read as `/extract`, reporting each stage as it happens (live progress on the upload screen)."""
    # Reading the upload happens before the stream starts, so a bad file is an ordinary error response.
    upload = await _with_hints(await read_invoice_upload(file, get_settings().max_upload_mb), db)
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def on_stage(stage: str, detail: dict[str, Any]) -> None:
        await queue.put(_event("stage", {"stage": stage, **detail}))

    async def run() -> None:
        try:
            result = await read_invoice(upload, on_stage)
            body = ExtractResponse(provider=result.provider, invoice=result.invoice)
            await queue.put(_event("done", body.model_dump(mode="json")))
        except AppError as error:
            await queue.put(_event("error", {"code": error.code, "message": error.message}))
        except Exception:
            log.exception("stream_read_failed")
            await queue.put(
                _event(
                    "error",
                    {
                        "code": "internal_error",
                        "message": "Something went wrong. Please try again.",
                    },
                )
            )
        finally:
            await queue.put(None)

    async def events() -> AsyncIterator[str]:
        yield _event("stage", {"stage": "received", "file_name": upload.file_name})
        task = asyncio.create_task(run())
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
                except TimeoutError:
                    yield ": still reading\n\n"
                    continue
                if item is None:
                    break
                yield item
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.post("/check")
async def check(body: CheckRequest) -> CheckResponse:
    """Sanity checks on the reviewed invoice (totals, duplicates, outliers). No AI, instant."""
    return CheckResponse(checks=check_invoice(body.invoice))


@router.post("/combine")
async def combine(body: CombineRequest) -> InvoiceData:
    """Combines 2–3 invoices from consecutive months into one, for a steadier monthly average.
    Refused when periods overlap or are missing, or the currencies differ."""
    return combine_invoices(body.invoices)
