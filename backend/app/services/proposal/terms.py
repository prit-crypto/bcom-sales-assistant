"""SAMPLE commercial conditions for the demo proposal. Not BCOM's real terms."""

from app.schemas.invoice import ServiceLevel
from app.services.pricing.rate_card import MAX_WEIGHT_KG


def commercial_conditions(valid_until: str) -> list[str]:
    return [
        f"Rates are valid until {valid_until}.",
        "Prices are in AED, include fuel surcharge at today's level and exclude 5% VAT, customs duties and taxes.",
        "Fuel surcharge is reviewed monthly; rates may change if fuel costs move significantly.",
        "Shipments are billed on the greater of actual or volumetric weight (L x W x H in cm / 5000), rounded up to the next 0.5 kg.",
        f"Single shipments over {MAX_WEIGHT_KG} kg, dangerous goods and oversized items are quoted separately as freight.",
        "Payment terms: 15 days from invoice date on an approved credit account.",
        "The saving shown is an estimate based on the invoice provided; actual savings depend on future volumes and destinations.",
    ]


SERVICE_DESCRIPTIONS: dict[ServiceLevel, str] = {
    "express": "Time-definite door-to-door delivery with live tracking.",
    "economy": "Lower-cost delivery for shipments that are not urgent, with live tracking.",
}
