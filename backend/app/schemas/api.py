"""Request and response bodies of the API endpoints."""

from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, Field

from app.core.config import ProviderId
from app.schemas.invoice import InvoiceData


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


RequiredText = Annotated[str, BeforeValidator(_strip), Field(min_length=1)]
OptionalText = Annotated[str, BeforeValidator(_strip)]


class ProviderInfo(BaseModel):
    """Public, non-secret description of the active AI provider."""

    id: ProviderId
    label: str
    model: str | None
    # Whether this provider can read images (photos of invoices).
    reads_images: bool


class ConfigResponse(BaseModel):
    provider: ProviderInfo | None
    # Set when the selected provider is not configured correctly.
    problem: str | None
    max_upload_mb: float


class ExtractResponse(BaseModel):
    provider: ProviderInfo
    invoice: InvoiceData


class PartnerInput(BaseModel):
    """Partner details entered on the proposal step."""

    partner_name: Annotated[RequiredText, Field(max_length=80)]
    partner_company: Annotated[RequiredText, Field(max_length=120)]
    partner_phone: Annotated[OptionalText, Field(max_length=30)] = ""
    partner_email: Annotated[OptionalText, Field(max_length=120)] = ""
    prospect_name: Annotated[RequiredText, Field(max_length=120)]
    validity_days: int = Field(ge=7, le=90)


class ProposalRequest(BaseModel):
    invoice: InvoiceData
    partner: PartnerInput


class MessageResponse(BaseModel):
    message: str
    # "ai" when written by the AI provider, "template" for the mock or the fallback.
    source: Literal["ai", "template"]
    notice: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
