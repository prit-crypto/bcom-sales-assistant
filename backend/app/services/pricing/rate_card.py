"""FICTIONAL BCOM rate card used for the POC only.

Prices are in AED, all-in (fuel surcharge included), excluding 5% VAT and duties.
"""

from dataclasses import dataclass

from app.schemas.comparison import ZoneId
from app.schemas.invoice import ServiceLevel

RATE_CARD_CURRENCY = "AED"
ORIGIN_COUNTRY = "AE"
MAX_WEIGHT_KG = 70
# Weights up to this limit are priced per 0.5 kg step; above it, per whole kg.
STEP_PRICING_LIMIT_KG = 30

ZONE_IDS: tuple[ZoneId, ...] = ("Z1", "Z2", "Z3", "Z4", "Z5", "Z6")


@dataclass(frozen=True)
class Zone:
    id: ZoneId
    label: str
    countries: frozenset[str]


ZONES: tuple[Zone, ...] = (
    Zone("Z1", "UAE domestic", frozenset({"AE"})),
    Zone("Z2", "GCC", frozenset({"SA", "OM", "QA", "BH", "KW"})),
    Zone(
        "Z3",
        "Middle East & South Asia",
        frozenset({"EG", "JO", "LB", "IQ", "IN", "PK", "BD", "LK", "NP"}),
    ),
    Zone(
        "Z4",
        "Europe",
        frozenset(
            {"GB", "IE", "DE", "FR", "IT", "ES", "NL", "BE", "CH", "AT"}
            | {"SE", "DK", "NO", "PL", "PT", "GR", "TR"}
        ),
    ),
    Zone("Z5", "North America", frozenset({"US", "CA"})),
    Zone(
        "Z6",
        "Asia Pacific",
        frozenset({"CN", "HK", "SG", "MY", "TH", "JP", "KR", "AU", "NZ", "PH", "ID", "VN"}),
    ),
)


@dataclass(frozen=True)
class ServiceRate:
    first_half_kg: float  # price for the first 0.5 kg
    additional_half_kg: float  # each further 0.5 kg up to STEP_PRICING_LIMIT_KG
    per_kg_above_limit: float  # each whole kg above STEP_PRICING_LIMIT_KG
    transit_time: str


SERVICE_LABELS: dict[ServiceLevel, str] = {"express": "BCOM Express", "economy": "BCOM Economy"}

RATES: dict[ZoneId, dict[ServiceLevel, ServiceRate]] = {
    "Z1": {
        "express": ServiceRate(18, 2.5, 4, "Next day"),
        "economy": ServiceRate(14, 1.8, 3, "1–2 days"),
    },
    "Z2": {
        "express": ServiceRate(62, 11, 18, "1–2 days"),
        "economy": ServiceRate(42, 7.5, 12, "3–4 days"),
    },
    "Z3": {
        "express": ServiceRate(85, 16, 26, "2–3 days"),
        "economy": ServiceRate(58, 11, 18, "4–6 days"),
    },
    "Z4": {
        "express": ServiceRate(120, 22, 36, "2–3 days"),
        "economy": ServiceRate(82, 15, 25, "5–7 days"),
    },
    "Z5": {
        "express": ServiceRate(140, 26, 42, "3–4 days"),
        "economy": ServiceRate(96, 18, 29, "6–8 days"),
    },
    "Z6": {
        "express": ServiceRate(110, 20, 32, "2–4 days"),
        "economy": ServiceRate(75, 14, 22, "5–8 days"),
    },
}


def find_zone(country_code: str) -> Zone | None:
    code = country_code.upper()
    return next((zone for zone in ZONES if code in zone.countries), None)


def zone_label(zone_id: ZoneId) -> str:
    return next((zone.label for zone in ZONES if zone.id == zone_id), zone_id)
