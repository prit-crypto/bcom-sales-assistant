"""Parses and validates the JSON an AI provider returned."""

import json
import logging

from pydantic import ValidationError

from app.core.exceptions import AppError
from app.schemas.raw_invoice import RawInvoice

log = logging.getLogger("bcom.ai")


def parse_raw_invoice_json(text: str | None, provider_label: str) -> RawInvoice:
    if not text:
        raise AppError(
            f"{provider_label} returned an empty answer. Please try again.",
            status_code=502,
            code="ai_empty_response",
        )
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AppError(
            f"{provider_label} returned data that is not valid JSON. Please try again.",
            status_code=502,
            code="ai_bad_json",
        ) from exc
    try:
        return RawInvoice.model_validate(data)
    except ValidationError as exc:
        log.warning("%s returned an unexpected shape: %s", provider_label, exc.errors()[:5])
        raise AppError(
            f"{provider_label} returned data in an unexpected shape. Please try again.",
            status_code=502,
            code="ai_bad_shape",
        ) from exc
