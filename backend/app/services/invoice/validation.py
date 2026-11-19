"""Which fields a shipment still needs before it can be priced."""

import re

from app.schemas.invoice import REQUIRED_SHIPMENT_FIELDS, RequiredShipmentField, Shipment

_COUNTRY = re.compile(r"^[A-Z]{2}$")

FIELD_LABELS: dict[RequiredShipmentField, str] = {
    "origin_country": "origin country",
    "destination_country": "destination country",
    "weight_kg": "weight",
    "service": "service",
    "charge": "charge",
}


def is_country_code(value: str | None) -> bool:
    return value is not None and bool(_COUNTRY.match(value))


def get_missing_fields(shipment: Shipment) -> list[RequiredShipmentField]:
    """Required fields that are still empty (or, for countries, not a 2-letter code)."""
    missing: list[RequiredShipmentField] = []
    for field in REQUIRED_SHIPMENT_FIELDS:
        value = getattr(shipment, field)
        if field in ("origin_country", "destination_country"):
            if not is_country_code(value):
                missing.append(field)
        elif value is None:
            missing.append(field)
    return missing
