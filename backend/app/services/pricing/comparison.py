"""Compares every shipment on an invoice with the BCOM rate card and summarises the result."""

from datetime import date

from app.schemas.comparison import (
    ComparisonResult,
    ComparisonSummary,
    GroupTotal,
    ShipmentComparison,
    StatusCounts,
)
from app.schemas.invoice import InvoiceData, Shipment
from app.services.invoice.validation import FIELD_LABELS, get_missing_fields
from app.services.pricing.calculator import NotEligible, quote_shipment
from app.services.pricing.rate_card import (
    MAX_WEIGHT_KG,
    RATE_CARD_CURRENCY,
    SERVICE_LABELS,
    ZONE_IDS,
    zone_label,
)
from app.utils.formatting import round_half_up, round_money

TOP_LANES = 8


def _pct(part: float, whole: float) -> float:
    return round_money(part / whole * 100) if whole > 0 else 0


def _parse_iso(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def get_period_days(invoice: InvoiceData) -> int | None:
    """Days in the billing period printed on the invoice, or None when it is not known.

    Shipment dates are deliberately NOT used as a fallback: two shipments on the same day would make
    a 1-day "period" and multiply the monthly saving by 30.
    """
    start = _parse_iso(invoice.period_start)
    end = _parse_iso(invoice.period_end)
    if start is None or end is None or end < start:
        return None
    return (end - start).days + 1


def get_monthly_factor(period_days: int | None) -> float:
    """Scales the invoice period to one month. Unknown, or 25–35 days, counts as one month."""
    if period_days is None or 25 <= period_days <= 35:
        return 1
    return 30 / period_days


def _compare_shipment(shipment: Shipment, currency_ok: bool) -> ShipmentComparison:
    base = ShipmentComparison(
        shipment_id=shipment.id,
        status="compared",
        current=shipment.charge,
        service=shipment.service,
        service_label=SERVICE_LABELS[shipment.service] if shipment.service else None,
    )

    if not shipment.included:
        return base.model_copy(update={"status": "excluded", "reason": "Excluded by the partner"})

    missing = get_missing_fields(shipment)
    if missing:
        names = ", ".join(FIELD_LABELS[field] for field in missing)
        return base.model_copy(
            update={
                "status": "missing_data",
                "reason": f"Missing {names}",
                "missing_fields": missing,
            }
        )

    if not currency_ok:
        return base.model_copy(
            update={
                "status": "not_eligible",
                "reason": f"Invoice is not in {RATE_CARD_CURRENCY}; the sample rate card is in {RATE_CARD_CURRENCY}",
            }
        )

    # get_missing_fields guarantees these are set.
    assert shipment.origin_country and shipment.destination_country
    assert shipment.weight_kg is not None and shipment.service and shipment.charge is not None
    quote = quote_shipment(
        origin_country=shipment.origin_country,
        destination_country=shipment.destination_country,
        weight_kg=shipment.weight_kg,
        service=shipment.service,
    )
    if isinstance(quote, NotEligible):
        return base.model_copy(update={"status": "not_eligible", "reason": quote.reason})

    return base.model_copy(
        update={
            "proposed": quote.price,
            "saving": round_money(shipment.charge - quote.price),
            "zone": quote.zone,
            "zone_label": zone_label(quote.zone),
            "billed_weight_kg": quote.billed_weight_kg,
            "transit_time": quote.transit_time,
        }
    )


def _add_to_group(
    groups: dict[str, GroupTotal], key: str, label: str, row: ShipmentComparison
) -> None:
    group = groups.setdefault(key, GroupTotal(key=key, label=label))
    group.shipments += 1
    group.current = round_money(group.current + (row.current or 0))
    group.proposed = round_money(group.proposed + (row.proposed or 0))
    group.saving = round_money(group.saving + (row.saving or 0))


def _lane_label(shipment: Shipment) -> str:
    origin = shipment.origin_city or shipment.origin_country or "?"
    destination = shipment.destination_city or shipment.destination_country or "?"
    return f"{origin} to {destination}"


def _period_assumption(period_days: int | None, monthly_factor: float) -> str:
    if period_days is None:
        return (
            "The billing period is not on the invoice, so it is treated as one month of shipping. "
            "If it covers a different length of time, enter the period to correct the monthly figures."
        )
    if monthly_factor == 1:
        return f"The invoice covers {period_days} days and is treated as one month of shipping."
    return f"The invoice covers {period_days} days; figures are scaled to a 30-day month."


def compare_invoice(invoice: InvoiceData) -> ComparisonResult:
    currency = (invoice.currency or RATE_CARD_CURRENCY).upper()
    currency_ok = currency == RATE_CARD_CURRENCY
    rows = [_compare_shipment(shipment, currency_ok) for shipment in invoice.shipments]

    counts = StatusCounts()
    zones: dict[str, GroupTotal] = {}
    services: dict[str, GroupTotal] = {}
    lanes: dict[str, GroupTotal] = {}
    current_spend = 0.0
    proposed_spend = 0.0
    higher_priced = 0

    for row, shipment in zip(rows, invoice.shipments, strict=True):
        setattr(counts, row.status, getattr(counts, row.status) + 1)
        if row.status != "compared":
            continue
        assert row.zone and row.service
        current_spend += row.current or 0
        proposed_spend += row.proposed or 0
        if (row.saving or 0) < 0:
            higher_priced += 1
        _add_to_group(zones, row.zone, zone_label(row.zone), row)
        _add_to_group(services, row.service, SERVICE_LABELS[row.service], row)
        lane = _lane_label(shipment)
        _add_to_group(lanes, lane.lower(), lane, row)

    invoice_spend = round_money(sum(shipment.charge or 0 for shipment in invoice.shipments))
    current_spend = round_money(current_spend)
    proposed_spend = round_money(proposed_spend)
    saving = round_money(current_spend - proposed_spend)
    period_days = get_period_days(invoice)
    monthly_factor = get_monthly_factor(period_days)
    # Whole dirhams: these are estimates, and yearly must equal monthly x 12 exactly as shown.
    monthly_saving = int(round_half_up(saving * monthly_factor))

    assumptions = [
        "BCOM prices come from the sample rate card set up in this tool, to be replaced with BCOM's live rates. Rates are all-in including fuel surcharge, and exclude 5% VAT and customs duties.",
        "Current charges are taken from the invoice, excluding VAT.",
        "Weights are the chargeable weights on the invoice, rounded up to the next 0.5 kg.",
        f"Only shipments sent from the UAE, up to {MAX_WEIGHT_KG} kg, to destinations on the rate card are compared. Services are matched like for like (express to express, economy to economy).",
        _period_assumption(period_days, monthly_factor),
        "Future savings assume the coming months look like this invoice. Yearly saving = monthly saving x 12.",
    ]
    if invoice.currency is None:
        assumptions.append(
            f"The invoice currency was not found, so the amounts are assumed to be in {RATE_CARD_CURRENCY}."
        )
    elif not currency_ok:
        assumptions.append(
            f"The invoice currency is {currency}, so no shipments could be compared with the {RATE_CARD_CURRENCY} rate card."
        )

    summary = ComparisonSummary(
        currency=RATE_CARD_CURRENCY,
        total_shipments=len(rows),
        compared_shipments=counts.compared,
        shipment_coverage_pct=_pct(counts.compared, len(rows)),
        invoice_spend=invoice_spend,
        current_spend=current_spend,
        proposed_spend=proposed_spend,
        saving=saving,
        saving_pct=_pct(saving, current_spend),
        spend_coverage_pct=_pct(current_spend, invoice_spend),
        period_days=period_days,
        monthly_factor=monthly_factor,
        monthly_current=round_money(current_spend * monthly_factor),
        monthly_proposed=round_money(proposed_spend * monthly_factor),
        monthly_saving=monthly_saving,
        yearly_saving=monthly_saving * 12,
        has_saving=counts.compared > 0 and monthly_saving > 0,
        status_counts=counts,
        higher_priced_shipments=higher_priced,
        by_zone=[zones[zone_id] for zone_id in ZONE_IDS if zone_id in zones],
        by_service=list(services.values()),
        top_lanes=sorted(lanes.values(), key=lambda group: group.current, reverse=True)[:TOP_LANES],
        assumptions=assumptions,
    )
    return ComparisonResult(rows=rows, summary=summary)
