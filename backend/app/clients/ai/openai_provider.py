"""OpenAI invoice reader and message writer (Responses API)."""

import base64
import logging

import openai
from openai.types.responses import (
    ResponseInputFileParam,
    ResponseInputImageParam,
    ResponseInputParam,
    ResponseTextConfigParam,
)

from app.clients.ai.base import SalesMessageFacts
from app.clients.ai.parse_output import parse_raw_invoice_json
from app.clients.ai.prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    SALES_MESSAGE_SYSTEM_PROMPT,
    build_extraction_user_prompt,
    build_sales_message_prompt,
)
from app.core.exceptions import AppError
from app.schemas.api import ProviderInfo
from app.schemas.raw_invoice import INVOICE_JSON_SCHEMA, RawInvoice
from app.services.invoice.upload import InvoiceFile

log = logging.getLogger("bcom.openai")

LABEL = "OpenAI"


def _to_app_error(error: Exception) -> AppError:
    if isinstance(error, openai.APITimeoutError):
        return AppError(
            "OpenAI took too long to answer. Please try again.", status_code=504, code="ai_timeout"
        )
    if isinstance(error, openai.APIStatusError):
        if error.status_code == 429:
            return AppError(
                "OpenAI rate limit or quota reached. Check your plan and try again.",
                status_code=429,
                code="ai_rate_limited",
            )
        if error.status_code in (401, 403):
            return AppError(
                "OpenAI rejected the API key. Check OPENAI_API_KEY in .env.",
                status_code=502,
                code="ai_auth_failed",
            )
        if error.status_code == 404:
            return AppError(
                "OpenAI model not found. Check OPENAI_MODEL in .env.",
                status_code=502,
                code="ai_model_not_found",
            )
    log.error("request failed: %r", error)
    return AppError(
        "OpenAI could not process the request. Please try again.",
        status_code=502,
        code="ai_request_failed",
    )


def _file_input(file: InvoiceFile) -> ResponseInputFileParam | ResponseInputImageParam:
    """PDFs go in as a file, photos as an image, both inline as base64 data URLs."""
    data_url = f"data:{file.mime_type};base64,{base64.b64encode(file.data).decode()}"
    if file.mime_type == "application/pdf":
        return {"type": "input_file", "filename": file.file_name, "file_data": data_url}
    return {"type": "input_image", "image_url": data_url, "detail": "high"}


class OpenAIProvider:
    def __init__(self, api_key: str, model: str, timeout_seconds: float) -> None:
        # One attempt per call: the SDK's own retries could push the request past the time limit.
        self._client = openai.AsyncOpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=1)
        self._model = model
        self.info = ProviderInfo(id="openai", label=LABEL, model=model, reads_images=True)

    async def extract_invoice(self, file: InvoiceFile) -> RawInvoice:
        try:
            request_input: ResponseInputParam = [
                {
                    "role": "user",
                    "content": [
                        _file_input(file),
                        {"type": "input_text", "text": build_extraction_user_prompt(file.hints)},
                    ],
                }
            ]
            text_format: ResponseTextConfigParam = {
                "format": {
                    "type": "json_schema",
                    "name": "courier_invoice",
                    "strict": True,
                    "schema": INVOICE_JSON_SCHEMA,
                }
            }
            response = await self._client.responses.create(
                model=self._model,
                instructions=EXTRACTION_SYSTEM_PROMPT,
                input=request_input,
                text=text_format,
            )
        except openai.OpenAIError as error:
            raise _to_app_error(error) from error
        return parse_raw_invoice_json(response.output_text, LABEL)

    async def write_sales_message(self, facts: SalesMessageFacts) -> str:
        try:
            response = await self._client.responses.create(
                model=self._model,
                instructions=SALES_MESSAGE_SYSTEM_PROMPT,
                input=build_sales_message_prompt(facts),
            )
        except openai.OpenAIError as error:
            raise _to_app_error(error) from error
        text = response.output_text.strip()
        if not text:
            raise AppError(
                "OpenAI returned an empty message. Please try again.",
                status_code=502,
                code="ai_empty_response",
            )
        return text
