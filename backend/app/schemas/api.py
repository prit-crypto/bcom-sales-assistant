"""Request and response bodies of the API endpoints."""

import base64
import binascii
import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field

from app.core.config import ProviderId
from app.schemas.base import ApiModel
from app.schemas.comparison import Scenario
from app.schemas.invoice import InvoiceData

Language = Literal["en", "ar"]
MAX_LOGO_BYTES = 300 * 1024
_LOGO = re.compile(r"^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$")
_URL = re.compile(r"^https://[^\s<>\"']{3,300}$")


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


RequiredText = Annotated[str, BeforeValidator(_strip), Field(min_length=1)]
OptionalText = Annotated[str, BeforeValidator(_strip)]


def _check_logo(value: str | None) -> str | None:
    """A PNG or JPEG data URL, at most 300 KB, whose bytes really are that image type."""
    if value is None:
        return None
    match = _LOGO.match(value)
    if not match:
        raise ValueError("the logo must be a PNG or JPEG image")
    try:
        data = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("the logo could not be read") from exc
    if len(data) > MAX_LOGO_BYTES:
        raise ValueError("the logo must be 300 KB or smaller")
    is_png = data.startswith(b"\x89PNG")
    is_jpeg = data.startswith(b"\xff\xd8\xff")
    if not (is_png if match.group(1) == "png" else is_jpeg):
        raise ValueError("the logo file is not the image type it claims to be")
    return value


def _check_url(value: str) -> str:
    if value and not _URL.match(value):
        raise ValueError("the booking link must start with https://")
    return value


class ProviderInfo(ApiModel):
    """Public, non-secret description of the active AI provider."""

    id: ProviderId
    label: str
    model: str | None
    # Whether this provider can read images (photos of invoices).
    reads_images: bool


class ConfigResponse(ApiModel):
    provider: ProviderInfo | None
    # Set when the selected provider is not configured correctly.
    problem: str | None
    max_upload_mb: float
    # Shown on the upload screen when invoices must not contain real customer data (free AI tier).
    privacy_notice: str | None = None
    # Only the bundled sample invoices can be uploaded on this server.
    samples_only: bool = False


class ExtractResponse(ApiModel):
    provider: ProviderInfo
    invoice: InvoiceData


class PartnerInput(ApiModel):
    """Partner details entered on the proposal step."""

    partner_name: Annotated[RequiredText, Field(max_length=80)]
    partner_company: Annotated[RequiredText, Field(max_length=120)]
    partner_phone: Annotated[OptionalText, Field(max_length=30)] = ""
    partner_email: Annotated[OptionalText, Field(max_length=120)] = ""
    prospect_name: Annotated[RequiredText, Field(max_length=120)]
    validity_days: int = Field(ge=7, le=90)
    # Language of what the customer receives: the proposal PDF and the WhatsApp message.
    language: Language = "en"
    # Optional link where the prospect can book a call (Calendly, Google, Microsoft Bookings…).
    booking_url: Annotated[OptionalText, Field(max_length=300), AfterValidator(_check_url)] = ""
    # Optional partner logo for the PDF header, as a PNG/JPEG data URL.
    partner_logo: Annotated[
        Annotated[str, Field(max_length=420_000)] | None, AfterValidator(_check_logo)
    ] = None


class ProposalRequest(ApiModel):
    invoice: InvoiceData
    partner: PartnerInput
    scenario: Scenario = Field(default_factory=Scenario)


class MessageResponse(ApiModel):
    message: str
    # "ai" when written by the AI provider, "template" for the mock or the fallback.
    source: Literal["ai", "template"]
    notice: str | None = None


class HealthResponse(ApiModel):
    status: Literal["ok"] = "ok"


class ReadinessResponse(ApiModel):
    status: Literal["ok", "unavailable"]
    database: Literal["ok", "unreachable"]
