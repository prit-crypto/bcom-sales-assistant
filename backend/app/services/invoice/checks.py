"""Sanity checks on an invoice that catch what neither the reader nor the partner noticed.

- Do the lines add up to the subtotal printed on the invoice? If not, a line was probably skipped or misread.
- Does a waybill number appear twice?
- Is a weight wildly out of line with the rest (120 typed as 1200)?
- Is a charge per kg far from what the same service costs on the rest of the invoice?

No AI: plain arithmetic on the reviewed data, so it is instant and runs again after every edit.
"""

from collections import defaultdict
from statistics import median

from app.schemas.comparison import InvoiceCheck
from app.schemas.invoice import InvoiceData, Shipment
from app.utils.formatting import format_money_exact, round_money

# The lines may differ from the printed subtotal by rounding; more than this is worth a look.
_TOTAL_TOLERANCE_AED = 1.0
_TOTAL_TOLERANCE_SHARE = 0.005
_WEIGHT_OUTLIER_FACTOR = 10
_CHARGE_PER_KG_FACTOR = 4
# Outlier checks need a few comparable lines to know what "normal" is.
_MIN_LINES_FOR_OUTLIERS = 4


def _label(shipment: Shipment) -> str:
    return shipment.reference or shipment.id


def _total_check(invoice: InvoiceData) -> InvoiceCheck | None:
    if invoice.printed_subtotal is None or not invoice.shipments:
        return None
    lines_total = round_money(sum(s.charge or 0 for s in invoice.shipments))
    difference = round_money(lines_total - invoice.printed_subtotal)
    tolerance = max(_TOTAL_TOLERANCE_AED, invoice.printed_subtotal * _TOTAL_TOLERANCE_SHARE)
    if abs(difference) <= tolerance:
        return None
    currency = invoice.currency or "AED"
    hint = (
        "A line may be missing or a charge misread."
        if difference < 0
        else "A charge may be misread or a line counted twice."
    )
    return InvoiceCheck(
        kind="total_mismatch",
        message=(
            f"The lines add up to {format_money_exact(lines_total, currency)}, but the invoice subtotal says "
            f"{format_money_exact(invoice.printed_subtotal, currency)}. {hint}"
        ),
        shipment_ids=[],
    )


def _duplicate_checks(invoice: InvoiceData) -> list[InvoiceCheck]:
    by_reference: dict[str, list[Shipment]] = defaultdict(list)
    for shipment in invoice.shipments:
        if shipment.reference:
            by_reference["".join(shipment.reference.split()).upper()].append(shipment)
    return [
        InvoiceCheck(
            kind="duplicate_waybill",
            message=f"Waybill {group[0].reference} appears {len(group)} times. Untick the extra line if it is a duplicate.",
            shipment_ids=[s.id for s in group],
        )
        for group in by_reference.values()
        if len(group) > 1
    ]


def _weight_checks(invoice: InvoiceData) -> list[InvoiceCheck]:
    weights = [s.weight_kg for s in invoice.shipments if s.weight_kg]
    if len(weights) < _MIN_LINES_FOR_OUTLIERS:
        return []
    typical = median(weights)
    return [
        InvoiceCheck(
            kind="weight_outlier",
            message=(
                f"{_label(s)} weighs {s.weight_kg:g} kg, over {_WEIGHT_OUTLIER_FACTOR}× the typical "
                f"{typical:g} kg on this invoice. Check it was read correctly."
            ),
            shipment_ids=[s.id],
        )
        for s in invoice.shipments
        if s.weight_kg and s.weight_kg > typical * _WEIGHT_OUTLIER_FACTOR
    ]


def _per_kg(shipment: Shipment) -> float:
    # Small parcels cost more per kg (first-half-kg pricing); counting them as at least 1 kg keeps
    # a 0.5 kg letter from looking like an outlier next to 20 kg boxes.
    return (shipment.charge or 0) / max(shipment.weight_kg or 1, 1)


def _charge_checks(invoice: InvoiceData) -> list[InvoiceCheck]:
    """Compares charge per kg only between like shipments: same service, origin and destination country.
    (Mixing UAE domestic with international, or exports with imports, flags normal lines.)"""
    checks: list[InvoiceCheck] = []
    groups: dict[tuple[str, str, str], list[Shipment]] = defaultdict(list)
    for s in invoice.shipments:
        if s.service and s.weight_kg and s.charge and s.origin_country and s.destination_country:
            groups[(s.service, s.origin_country, s.destination_country)].append(s)
    for (service, origin, destination), shipments in groups.items():
        if len(shipments) < _MIN_LINES_FOR_OUTLIERS:
            continue
        typical = median(_per_kg(s) for s in shipments)
        for s in shipments:
            per_kg = _per_kg(s)
            if per_kg > typical * _CHARGE_PER_KG_FACTOR or per_kg < typical / _CHARGE_PER_KG_FACTOR:
                checks.append(
                    InvoiceCheck(
                        kind="charge_outlier",
                        message=(
                            f"{_label(s)} costs {per_kg:,.2f} per kg, far from the usual {typical:,.2f} per kg "
                            f"for {service} from {origin} to {destination} on this invoice. Check the weight and charge."
                        ),
                        shipment_ids=[s.id],
                    )
                )
    return checks


def check_invoice(invoice: InvoiceData) -> list[InvoiceCheck]:
    checks: list[InvoiceCheck] = []
    if (total := _total_check(invoice)) is not None:
        checks.append(total)
    checks += _duplicate_checks(invoice)
    checks += _weight_checks(invoice)
    checks += _charge_checks(invoice)
    return checks
