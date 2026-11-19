"""Deterministic BCOM price for one shipment. No AI: the same input always gives the same price."""

import math
from dataclasses import dataclass

from app.schemas.comparison import ZoneId
from app.schemas.invoice import ServiceLevel
from app.services.pricing.rate_card import (
    MAX_WEIGHT_KG,
    ORIGIN_COUNTRY,
    RATES,
    STEP_PRICING_LIMIT_KG,
    find_zone,
)
from app.utils.formatting import round_money


@dataclass(frozen=True)
class Quote:
    zone: ZoneId
    service: ServiceLevel
    billed_weight_kg: float
    price: float
    transit_time: str


@dataclass(frozen=True)
class NotEligible:
    reason: str


def round_up_to_half_kg(weight_kg: float) -> float:
    """Rounds a weight up to the next 0.5 kg, as couriers bill it."""
    return math.ceil(weight_kg * 2) / 2


def quote_shipment(
    *, origin_country: str, destination_country: str, weight_kg: float, service: ServiceLevel
) -> Quote | NotEligible:
    origin = origin_country.upper()
    destination = destination_country.upper()

    if origin != ORIGIN_COUNTRY:
        return NotEligible("Not sent from the UAE (imports are not on the sample rate card)")
    if not math.isfinite(weight_kg) or weight_kg <= 0:
        return NotEligible("Weight must be more than 0 kg")
    if weight_kg > MAX_WEIGHT_KG:
        return NotEligible(f"Over {MAX_WEIGHT_KG} kg – needs a freight quote")

    zone = find_zone(destination)
    if zone is None:
        return NotEligible(f"Destination {destination} is not on the sample rate card")

    rate = RATES[zone.id][service]
    billed = round_up_to_half_kg(weight_kg)

    if billed <= STEP_PRICING_LIMIT_KG:
        price = rate.first_half_kg + ((billed - 0.5) / 0.5) * rate.additional_half_kg
    else:
        price_at_limit = (
            rate.first_half_kg + ((STEP_PRICING_LIMIT_KG - 0.5) / 0.5) * rate.additional_half_kg
        )
        extra_kg = math.ceil(billed) - STEP_PRICING_LIMIT_KG
        price = price_at_limit + extra_kg * rate.per_kg_above_limit

    return Quote(
        zone=zone.id,
        service=service,
        billed_weight_kg=billed,
        price=round_money(price),
        transit_time=rate.transit_time,
    )
