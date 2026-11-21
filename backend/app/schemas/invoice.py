"""Invoice data after normalisation: what the API returns from extraction and accepts back after the
partner has reviewed it. The same models validate requests, so limits live here."""

import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field

from app.schemas.base import ApiModel

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

EditableField = Literal[
    "date",
    "reference",
    "origin_city",
    "origin_country",
    "destination_city",
    "destination_country",
    "weight_kg",
    "pieces",
    "service",
    "charge",
]
EDITABLE_FIELDS: tuple[EditableField, ...] = (
    "date",
    "reference",
    "origin_city",
    "origin_country",
    "destination_city",
    "destination_country",
    "weight_kg",
    "pieces",
    "service",
    "charge",
)

# Limits shared by request validation (below) and by the normalisation of reader output, so a value a
# reader returns can never be rejected later by the API.
MAX_SHORT_TEXT = 80
MAX_LONG_TEXT = 120
MAX_WEIGHT_KG = 100_000
MAX_PIECES = 100_000
MAX_CHARGE = 10_000_000
MAX_SUBTOTAL = 1_000_000_000
MAX_SHIPMENTS = 2000
MAX_WARNINGS = 100
MAX_WARNING_LENGTH = 500

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


# The length limit sits on the text itself, so an empty (None) value is accepted, not checked for length.
Text80 = Annotated[
    Annotated[str, Field(max_length=MAX_SHORT_TEXT)] | None, BeforeValidator(_blank_to_none)
]
Text120 = Annotated[
    Annotated[str, Field(max_length=MAX_LONG_TEXT)] | None, BeforeValidator(_blank_to_none)
]
IsoDate = Annotated[str | None, BeforeValidator(_blank_to_none), AfterValidator(_check_iso_date)]
CountryCode = Annotated[
    Annotated[str, Field(max_length=3)] | None,
    BeforeValidator(_blank_to_none),
    AfterValidator(_country_or_none),
]


class Shipment(ApiModel):
    """One shipment line from a prospect's courier invoice."""

    id: str = Field(min_length=1, max_length=40)
    date: IsoDate = None
    reference: Text80 = None
    origin_city: Text80 = None
    origin_country: CountryCode = None
    destination_city: Text80 = None
    destination_country: CountryCode = None
    weight_kg: Annotated[float | None, Field(gt=0, le=MAX_WEIGHT_KG)] = None
    pieces: Annotated[int | None, Field(gt=0, le=MAX_PIECES)] = None
    service: ServiceLevel | None = None
    charge: Annotated[float | None, Field(gt=0, le=MAX_CHARGE)] = None
    # The partner can exclude a row from the comparison.
    included: bool = True
    # Values the reader could not read clearly; cleared by the screen once the partner edits them.
    uncertain_fields: list[EditableField] = Field(default_factory=list, max_length=10)


class InvoiceData(ApiModel):
    """Everything read from one invoice."""

    carrier_name: Text120 = None
    customer_name: Text120 = None
    invoice_number: Text80 = None
    invoice_date: IsoDate = None
    period_start: IsoDate = None
    period_end: IsoDate = None
    currency: Annotated[str | None, Field(pattern=r"^[A-Z]{3}$")] = None
    # Total of the shipment lines excluding VAT, as printed on the invoice (for the totals check).
    printed_subtotal: Annotated[float | None, Field(ge=0, le=MAX_SUBTOTAL)] = None
    shipments: list[Shipment] = Field(default_factory=list, max_length=MAX_SHIPMENTS)
    # Notes about things the reader could not read or was unsure about.
    warnings: list[Annotated[str, Field(max_length=MAX_WARNING_LENGTH)]] = Field(
        default_factory=list, max_length=MAX_WARNINGS
    )
