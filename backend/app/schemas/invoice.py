"""Invoice data after normalisation: what the API returns from extraction and accepts back after the
partner has reviewed it. The same models validate requests, so limits live here."""

import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, Field

ServiceLevel = Literal["express", "economy"]
SERVICE_LEVELS: tuple[ServiceLevel, ...] = ("express", "economy")

RequiredShipmentField = Literal[
    "origin_country", "destination_country", "weight_kg", "service", "charge"
]
REQUIRED_SHIPMENT_FIELDS: tuple[RequiredShipmentField, ...] = (
    "origin_country",
    "destination_country",
    "weight_kg",
    "service",
    "charge",
)

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_COUNTRY = re.compile(r"^[A-Z]{2}$")


def _blank_to_none(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _country_or_none(value: str | None) -> str | None:
    # Half-typed codes from the editor are treated as missing (same rule as get_missing_fields).
    return value if value is not None and _COUNTRY.match(value) else None


def _check_iso_date(value: str | None) -> str | None:
    if value is not None and not _ISO_DATE.match(value):
        raise ValueError("date must be YYYY-MM-DD")
    return value


Text80 = Annotated[str | None, BeforeValidator(_blank_to_none), Field(max_length=80)]
Text120 = Annotated[str | None, BeforeValidator(_blank_to_none), Field(max_length=120)]
IsoDate = Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_check_iso_date)]
CountryCode = Annotated[
    str | None,
    BeforeValidator(_blank_to_none),
    Field(max_length=3),
    AfterValidator(_country_or_none),
]


class Shipment(BaseModel):
    """One shipment line from a prospect's courier invoice."""

    id: str = Field(min_length=1, max_length=40)
    date: IsoDate = None
    reference: Text80 = None
    origin_city: Text80 = None
    origin_country: CountryCode = None
    destination_city: Text80 = None
    destination_country: CountryCode = None
    weight_kg: Annotated[float | None, Field(gt=0, le=100_000)] = None
    pieces: Annotated[int | None, Field(gt=0, le=100_000)] = None
    service: ServiceLevel | None = None
    charge: Annotated[float | None, Field(gt=0, le=10_000_000)] = None
    # The partner can exclude a row from the comparison.
    included: bool = True


class InvoiceData(BaseModel):
    """Everything read from one invoice."""

    carrier_name: Text120 = None
    customer_name: Text120 = None
    invoice_number: Text80 = None
    invoice_date: IsoDate = None
    period_start: IsoDate = None
    period_end: IsoDate = None
    currency: Annotated[str | None, Field(pattern=r"^[A-Z]{3}$")] = None
    shipments: list[Shipment] = Field(default_factory=list, max_length=2000)
    # Notes about things the reader could not read or was unsure about.
    warnings: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list, max_length=100
    )
