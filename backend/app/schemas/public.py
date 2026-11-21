"""What the customer sees through their link: the proposal's figures and wording, never shipment-level data."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field

from app.schemas.base import ApiModel

PublicStatus = Literal["open", "accepted", "expired", "closed"]


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


class PublicGroup(ApiModel):
    label: str
    shipments: int
    current: float
    proposed: float
    saving: float


class PublicService(ApiModel):
    title: str
    description: str
    shipments: int
    saving: float


class SavingExample(ApiModel):
    """One real shipment from the customer's invoice: what it cost and what it would cost with BCOM."""

    route: str
    # Service, weight and date, in the customer's language
    detail: str
    current: float
    proposed: float
    saving: float


class PublicPartner(ApiModel):
    name: str
    company: str
    phone: str
    email: str
    booking_url: str
    logo: str | None


class PublicProposal(ApiModel):
    reference: str
    prospect_name: str
    language: Literal["en", "ar"]
    currency: str
    monthly_saving: float
    yearly_saving: float
    saving_pct: float
    monthly_current: float
    monthly_proposed: float
    # What the estimate is based on: compared shipments of all on the invoice, over this billing period
    compared_shipments: int
    total_shipments: int
    period: str
    examples: list[SavingExample]
    regions: list[PublicGroup]
    services: list[PublicService]
    assumptions: list[str]
    conditions: list[str]
    valid_until: date
    # open: can be accepted; accepted: done; expired: past its validity; closed: no longer offered
    status: PublicStatus
    accepted_by: str | None
    accepted_at: datetime | None
    partner: PublicPartner


class AcceptRequest(ApiModel):
    name: Annotated[str, BeforeValidator(_strip), Field(min_length=1, max_length=80)]
    note: Annotated[str, BeforeValidator(_strip), Field(max_length=500)] = ""


class ShareLink(ApiModel):
    token: str
    # The page address on the frontend, e.g. /p/<token>
    path: str
