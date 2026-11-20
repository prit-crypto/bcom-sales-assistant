"""Google Gemini invoice reader and message writer."""

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from google import genai
from google.genai import errors, types

from app.clients.ai.base import SalesMessageFacts
from app.clients.ai.parse_output import parse_raw_invoice_json
from app.clients.ai.prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    SALES_MESSAGE_SYSTEM_PROMPT,
    build_extraction_user_prompt,
    build_sales_message_prompt,
)
from app.core.config import GeminiThinkingLevel
from app.core.exceptions import AppError
from app.schemas.api import ProviderInfo
from app.schemas.raw_invoice import INVOICE_JSON_SCHEMA, RawInvoice
from app.services.invoice.upload import InvoiceFile

log = logging.getLogger("bcom.gemini")

LABEL = "Google Gemini"
# Waits before retrying the same model when Gemini is busy (503) or fails (500).
RETRY_DELAYS_SECONDS = (2.0, 5.0)

_THINKING: dict[str, types.ThinkingLevel] = {
    "minimal": types.ThinkingLevel.MINIMAL,
    "low": types.ThinkingLevel.LOW,
    "medium": types.ThinkingLevel.MEDIUM,
    "high": types.ThinkingLevel.HIGH,
}


@dataclass(frozen=True)
class GeminiSettings:
    api_key: str
    model: str
    # Used when the main model stays busy or out of quota; None = no fallback.
    fallback_model: str | None
    thinking_level: GeminiThinkingLevel
    request_timeout_seconds: float
    total_timeout_seconds: float


def _status_of(error: BaseException) -> int:
    code = getattr(error, "code", None)
    return code if isinstance(code, int) else 0


def _is_temporary(status: int) -> bool:
    """Busy (503), server error (500) and quota (429) are worth trying again or on another model."""
    return status in (429, 500, 503)


def _busy() -> AppError:
    return AppError(
        "The AI reader is busy right now. Wait a minute and try again.",
        status_code=503,
        code="ai_busy",
    )


def _to_app_error(error: BaseException | None) -> AppError:
    if error is None or isinstance(error, TimeoutError):
        return _busy()
    status = _status_of(error)
    log.error("request failed: %r", error)
    if status in (500, 503):
        return _busy()
    if status == 429:
        return AppError(
            "The AI reader's usage limit was reached. Wait a minute and try again.",
            status_code=429,
            code="ai_rate_limited",
        )
    if status in (401, 403):
        return AppError(
            "Gemini rejected the API key. Check GEMINI_API_KEY in .env.",
            status_code=502,
            code="ai_auth_failed",
        )
    if status == 404:
        return AppError(
            "Gemini model not found. Check GEMINI_MODEL in .env.",
            status_code=502,
            code="ai_model_not_found",
        )
    return AppError(
        "Gemini could not process the request. Please try again.",
        status_code=502,
        code="ai_request_failed",
    )


class GeminiProvider:
    def __init__(self, settings: GeminiSettings) -> None:
        self._settings = settings
        self._client = genai.Client(
            api_key=settings.api_key,
            http_options=types.HttpOptions(timeout=int(settings.request_timeout_seconds * 1000)),
        )
        self._models = [
            settings.model,
            *([settings.fallback_model] if settings.fallback_model else []),
        ]
        self._thinking = (
            None
            if settings.thinking_level == "default"
            else types.ThinkingConfig(thinking_level=_THINKING[settings.thinking_level])
        )
        self.info = ProviderInfo(id="gemini", label=LABEL, model=settings.model, reads_images=True)

    async def _generate(
        self, contents: Any, config: types.GenerateContentConfig
    ) -> tuple[str | None, str]:
        """Calls Gemini, retrying the main model while it is busy, then trying the fallback model.

        Never runs longer than `total_timeout_seconds` in all, so a slow day ends in a clear "busy"
        message instead of the request being cut off by the hosting platform.
        """
        deadline = time.monotonic() + self._settings.total_timeout_seconds
        last_error: BaseException | None = None
        for model in self._models:
            for attempt in range(len(RETRY_DELAYS_SECONDS) + 1):
                remaining = deadline - time.monotonic()
                if remaining <= 1:
                    raise _to_app_error(last_error)
                try:
                    async with asyncio.timeout(remaining):
                        response = await self._client.aio.models.generate_content(
                            model=model, contents=contents, config=config
                        )
                    return response.text, model
                except (errors.APIError, TimeoutError) as error:
                    last_error = error
                    status = _status_of(error)
                    if isinstance(error, errors.APIError) and not _is_temporary(status):
                        raise _to_app_error(error) from error
                    log.warning(
                        "%s returned %s (attempt %d)", model, status or "timeout", attempt + 1
                    )
                    # Quota (429) and timeouts will not clear in seconds: go to the fallback model.
                    if status == 429 or isinstance(error, TimeoutError):
                        break
                    if attempt == len(RETRY_DELAYS_SECONDS):
                        break
                    delay = RETRY_DELAYS_SECONDS[attempt]
                    if deadline - time.monotonic() <= delay + 1:
                        break
                    await asyncio.sleep(delay)
        raise _to_app_error(last_error)

    async def extract_invoice(self, file: InvoiceFile) -> RawInvoice:
        text, model = await self._generate(
            [
                types.Part.from_bytes(data=file.data, mime_type=file.mime_type),
                build_extraction_user_prompt(file.hints),
            ],
            types.GenerateContentConfig(
                system_instruction=EXTRACTION_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_json_schema=INVOICE_JSON_SCHEMA,
                temperature=0,
                thinking_config=self._thinking,
            ),
        )
        raw = parse_raw_invoice_json(text, LABEL)
        if model != self._settings.model:
            raw.notes.append(
                f"{self._settings.model} was busy, so this invoice was read with {model}. Please double-check the values."
            )
        return raw

    async def write_sales_message(self, facts: SalesMessageFacts) -> str:
        text, _ = await self._generate(
            build_sales_message_prompt(facts),
            types.GenerateContentConfig(
                system_instruction=SALES_MESSAGE_SYSTEM_PROMPT,
                temperature=0.4,
                thinking_config=self._thinking,
            ),
        )
        message = (text or "").strip()
        if not message:
            raise AppError(
                "Gemini returned an empty message. Please try again.",
                status_code=502,
                code="ai_empty_response",
            )
        return message
