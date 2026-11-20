"""Compares every shipment on an invoice with the BCOM rate card and summarises the result."""

from collections.abc import Mapping
from datetime import date

from app.core.config import get_settings
from app.schemas.comparison import (
    ComparisonResult,
    ComparisonSummary,
    CurrencyConversion,
    GroupTotal,
    Scenario,
    ShipmentComparison,
    StatusCounts,
    TransitTradeoff,
    ZoneId,
)
from app.schemas.invoice import InvoiceData, ServiceLevel, Shipment
from app.services.invoice.checks import check_invoice
from app.services.invoice.validation import FIELD_LABELS, get_missing_fields
from app.services.pricing.calculator import NotEligible, quote_shipment
from app.services.pricing.rate_card import (
    MAX_WEIGHT_KG,
    ORIGIN_COUNTRY,
    RATE_CARD_CURRENCY,
    RATES,
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


def _priced_service(shipment: Shipment, economy_for_non_urgent: bool) -> ServiceLevel | None:
    """The BCOM service to price: Economy instead of Express for international shipments when the
    what-if asks for it (UAE domestic stays as it is)."""
    if (
        economy_for_non_urgent
        and shipment.service == "express"
        and shipment.destination_country
        and shipment.destination_country != ORIGIN_COUNTRY
    ):
        return "economy"
    return shipment.service


def _compare_shipment(
    shipment: Shipment, currency_ok: bool, economy_for_non_urgent: bool = False
) -> ShipmentComparison:
    priced = _priced_service(shipment, economy_for_non_urgent)
    base = ShipmentComparison(
        shipment_id=shipment.id,
        status="compared",
        current=shipment.charge,
        service=shipment.service,
        proposed_service=priced,
        service_label=SERVICE_LABELS[priced] if priced else None,
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
    assert priced is not None
    quote = quote_shipment(
        origin_country=shipment.origin_country,
        destination_country=shipment.destination_country,
        weight_kg=shipment.weight_kg,
        service=priced,
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


def _conversion_assumption(conversion: CurrencyConversion) -> str:
    peg = " (the UAE dirham's fixed peg)" if conversion.currency == "USD" else ""
    return (
        f"Amounts on the invoice are in {conversion.currency} and were converted at "
        f"{conversion.rate:g} {RATE_CARD_CURRENCY} per {conversion.currency}{peg} before comparing."
    )


def _scenario_assumptions(scenario: Scenario, switched: int) -> list[str]:
    lines: list[str] = []
    if scenario.economy_for_non_urgent:
        lines.append(
            f"What if: {switched} international Express shipment{'s' if switched != 1 else ''} priced as BCOM Economy, "
            "which is cheaper but slower (see delivery times). The current charges stay as invoiced."
        )
    if scenario.volume_factor != 1:
        change = round((scenario.volume_factor - 1) * 100)
        lines.append(
            f"What if: monthly volume {'+' if change > 0 else '−'}{abs(change)}% compared with this invoice, "
            "with the same mix of routes and services."
        )
    return lines


def compare_invoice(
    invoice: InvoiceData,
    fx_rates: Mapping[str, float] | None = None,
    scenario: Scenario | None = None,
) -> ComparisonResult:
    """Compares the invoice with the rate card. Amounts in another currency are converted to AED first
    when a rate for it is configured (`fx_rates`, defaulting to the FX_RATES_TO_AED setting)."""
    scenario = scenario or Scenario()
    rates = get_settings().fx_rates_to_aed if fx_rates is None else fx_rates
    currency = (invoice.currency or RATE_CARD_CURRENCY).upper()
    rate = None if currency == RATE_CARD_CURRENCY else rates.get(currency)
    currency_ok = currency == RATE_CARD_CURRENCY or rate is not None

    conversion: CurrencyConversion | None = None
    shipments = invoice.shipments
    if rate is not None:
        conversion = CurrencyConversion(
            currency=currency,
            rate=rate,
            original_spend=round_money(sum(shipment.charge or 0 for shipment in shipments)),
        )
        shipments = [
            shipment.model_copy(
                update={
                    "charge": None
                    if shipment.charge is None
                    else round_money(shipment.charge * rate)
                }
            )
            for shipment in shipments
        ]

    rows = [
        _compare_shipment(shipment, currency_ok, scenario.economy_for_non_urgent)
        for shipment in shipments
    ]

    switched_rows = [
        row for row in rows if row.status == "compared" and row.proposed_service != row.service
    ]
    counts = StatusCounts()
    zones: dict[str, GroupTotal] = {}
    services: dict[str, GroupTotal] = {}
    lanes: dict[str, GroupTotal] = {}
    current_spend = 0.0
    proposed_spend = 0.0
    higher_priced = 0

    for row, shipment in zip(rows, shipments, strict=True):
        setattr(counts, row.status, getattr(counts, row.status) + 1)
        if row.status != "compared":
            continue
        assert row.zone and row.service
        current_spend += row.current or 0
        proposed_spend += row.proposed or 0
        if (row.saving or 0) < 0:
            higher_priced += 1
        _add_to_group(zones, row.zone, zone_label(row.zone), row)
        priced = row.proposed_service or row.service
        _add_to_group(services, priced, SERVICE_LABELS[priced], row)
        lane = _lane_label(shipment)
        _add_to_group(lanes, lane.lower(), lane, row)

    invoice_spend = round_money(sum(shipment.charge or 0 for shipment in shipments))
    current_spend = round_money(current_spend)
    proposed_spend = round_money(proposed_spend)
    saving = round_money(current_spend - proposed_spend)
    period_days = get_period_days(invoice)
    monthly_factor = get_monthly_factor(period_days)
    # Whole dirhams: these are estimates, and yearly must equal monthly x 12 exactly as shown.
    # The what-if volume scales the monthly figures only (same mix of routes and services).
    monthly_scale = monthly_factor * scenario.volume_factor
    monthly_saving = int(round_half_up(saving * monthly_scale))

    assumptions = [
        "BCOM prices come from the sample rate card set up in this tool, to be replaced with BCOM's live rates. Rates are all-in including fuel surcharge, and exclude 5% VAT and customs duties.",
        "Current charges are taken from the invoice, excluding VAT.",
        "Weights are the chargeable weights on the invoice, rounded up to the next 0.5 kg.",
        f"Only shipments sent from the UAE, up to {MAX_WEIGHT_KG} kg, to destinations on the rate card are compared. Services are matched like for like (express to express, economy to economy).",
        _period_assumption(period_days, monthly_factor),
        *_scenario_assumptions(scenario, len(switched_rows)),
        "Future savings assume the coming months look like this invoice. Yearly saving = monthly saving x 12.",
    ]
    if invoice.currency is None:
        assumptions.append(
            f"The invoice currency was not found, so the amounts are assumed to be in {RATE_CARD_CURRENCY}."
        )
    elif conversion is not None:
        assumptions.append(_conversion_assumption(conversion))
    elif not currency_ok:
        assumptions.append(
            f"The invoice currency is {currency} and no exchange rate is set for it, so no shipments could be compared with the {RATE_CARD_CURRENCY} rate card."
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
        monthly_current=round_money(current_spend * monthly_scale),
        monthly_proposed=round_money(proposed_spend * monthly_scale),
        monthly_saving=monthly_saving,
        yearly_saving=monthly_saving * 12,
        has_saving=counts.compared > 0 and monthly_saving > 0,
        status_counts=counts,
        higher_priced_shipments=higher_priced,
        by_zone=[zones[zone_id] for zone_id in ZONE_IDS if zone_id in zones],
        by_service=list(services.values()),
        top_lanes=sorted(lanes.values(), key=lambda group: group.current, reverse=True)[:TOP_LANES],
        assumptions=assumptions,
        converted_from=conversion,
        scenario=scenario,
        # Same volume, like-for-like services: what the Economy switch is compared against.
        like_for_like_monthly_saving=(
            compare_invoice(
                invoice, rates, Scenario(volume_factor=scenario.volume_factor)
            ).summary.monthly_saving
            if scenario.economy_for_non_urgent
            else monthly_saving
        ),
        transit_tradeoffs=_transit_tradeoffs(switched_rows),
        checks=check_invoice(invoice),
    )
    return ComparisonResult(rows=rows, summary=summary)


def _transit_tradeoffs(switched_rows: list[ShipmentComparison]) -> list[TransitTradeoff]:
    counts: dict[ZoneId, int] = {}
    for row in switched_rows:
        if row.zone:
            counts[row.zone] = counts.get(row.zone, 0) + 1
    return [
        TransitTradeoff(
            zone_label=zone_label(zone),
            express=RATES[zone]["express"].transit_time,
            economy=RATES[zone]["economy"].transit_time,
            shipments=counts[zone],
        )
        for zone in ZONE_IDS
        if zone in counts
    ]
