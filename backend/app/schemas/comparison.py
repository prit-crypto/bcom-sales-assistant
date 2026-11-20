"""Result of comparing an invoice with the BCOM rate card."""

from typing import Literal

from app.schemas.base import ApiModel
from app.schemas.invoice import InvoiceData, RequiredShipmentField, ServiceLevel

ShipmentStatus = Literal["compared", "missing_data", "not_eligible", "excluded"]
ZoneId = Literal["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"]


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


class ComparisonResult(ApiModel):
    rows: list[ShipmentComparison]
    summary: ComparisonSummary


class ComparisonRequest(ApiModel):
    invoice: InvoiceData
