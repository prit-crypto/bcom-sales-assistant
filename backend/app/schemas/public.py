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
