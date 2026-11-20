"""Result of comparing an invoice with the BCOM rate card."""

from typing import Annotated, Literal

from pydantic import AfterValidator, Field

from app.schemas.base import ApiModel
from app.schemas.invoice import InvoiceData, RequiredShipmentField, ServiceLevel

ShipmentStatus = Literal["compared", "missing_data", "not_eligible", "excluded"]
ZoneId = Literal["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"]
CheckKind = Literal["total_mismatch", "duplicate_waybill", "weight_outlier", "charge_outlier"]
VOLUME_FACTORS = (0.8, 1.0, 1.2, 1.5, 2.0)


def _check_volume(value: float) -> float:
    if value not in VOLUME_FACTORS:
        raise ValueError(f"volume_factor must be one of {VOLUME_FACTORS}")
    return value


# Monthly volume compared with this invoice: 0.8 = 20% fewer shipments, 2 = twice as many.
VolumeFactor = Annotated[float, AfterValidator(_check_volume)]


class InvoiceCheck(ApiModel):
    """Something on the invoice worth a second look (see app/services/invoice/checks.py)."""

    kind: CheckKind
    message: str
    # Lines involved; empty for invoice-level checks such as the totals.
    shipment_ids: list[str] = []


class Scenario(ApiModel):
    """A "what if" the partner tries with the prospect. The default is like for like."""

    # Monthly volume compared with this invoice: 0.8 = 20% fewer shipments, 2 = twice as many.
    volume_factor: VolumeFactor = 1.0
    # Price international Express shipments as BCOM Economy (slower, cheaper).
    economy_for_non_urgent: bool = False

    @property
    def is_like_for_like(self) -> bool:
        return self.volume_factor == 1 and not self.economy_for_non_urgent


class TransitTradeoff(ApiModel):
    """What the prospect gives up when a region's Express shipments move to Economy."""

    zone_label: str
    express: str
    economy: str
    shipments: int


class ShipmentComparison(ApiModel):
    shipment_id: str
    status: ShipmentStatus
    # Why the shipment was not compared (None when compared).
    reason: str | None = None
    missing_fields: list[RequiredShipmentField] = []
    current: float | None = None
    proposed: float | None = None
    saving: float | None = None
    zone: ZoneId | None = None
    zone_label: str | None = None
    service: ServiceLevel | None = None
    # The BCOM service priced: differs from `service` when the what-if moves Express to Economy.
    proposed_service: ServiceLevel | None = None
    service_label: str | None = None
    billed_weight_kg: float | None = None
    transit_time: str | None = None


class GroupTotal(ApiModel):
    key: str
    label: str
    shipments: int = 0
    current: float = 0
    proposed: float = 0
    saving: float = 0


class StatusCounts(ApiModel):
    compared: int = 0
    missing_data: int = 0
    not_eligible: int = 0
    excluded: int = 0


class CurrencyConversion(ApiModel):
    """How an invoice in another currency was turned into AED."""

    currency: str
    # AED per 1 unit of `currency`.
    rate: float
    # Total of the invoice lines in the original currency.
    original_spend: float


class ComparisonSummary(ApiModel):
    currency: str
    total_shipments: int
    compared_shipments: int
    # Compared shipments as a % of all shipments on the invoice.
    shipment_coverage_pct: float
    # Sum of all charges on the invoice (rows with a charge).
    invoice_spend: float
    # Current spend of the compared shipments only.
    current_spend: float
    proposed_spend: float
    saving: float
    saving_pct: float
    # Compared spend as a % of the whole invoice spend.
    spend_coverage_pct: float
    # Days in the billing period printed on the invoice; None when it is not known.
    period_days: int | None
    # Multiplier that turns the invoice period into one month.
    monthly_factor: float
    monthly_current: float
    monthly_proposed: float
    # Estimated saving per month, rounded to whole currency units (negative = BCOM costs more).
    monthly_saving: int
    yearly_saving: int
    # True only when BCOM is cheaper overall, so there is a saving to propose.
    has_saving: bool
    status_counts: StatusCounts
    # Compared shipments where BCOM is more expensive than the current courier.
    higher_priced_shipments: int
    by_zone: list[GroupTotal]
    by_service: list[GroupTotal]
    top_lanes: list[GroupTotal]
    assumptions: list[str]
    # Set when the invoice was in another currency and converted to AED for the comparison.
    converted_from: CurrencyConversion | None = None
    # The what-if this summary was calculated with, and the like-for-like saving for comparison.
    scenario: Scenario = Field(default_factory=Scenario)
    like_for_like_monthly_saving: int = 0
    transit_tradeoffs: list[TransitTradeoff] = []
    checks: list[InvoiceCheck] = []


class ComparisonResult(ApiModel):
    rows: list[ShipmentComparison]
    summary: ComparisonSummary


class ComparisonRequest(ApiModel):
    invoice: InvoiceData
    scenario: Scenario = Field(default_factory=Scenario)


class CheckRequest(ApiModel):
    invoice: InvoiceData


class CheckResponse(ApiModel):
    checks: list[InvoiceCheck]
