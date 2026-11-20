"""Combines 2–3 invoices from consecutive months into one, for a steadier monthly average.

The comparison needs nothing special: monthly figures already scale by the billing period, which becomes
the earliest start to the latest end. Periods must not overlap (the same shipments would count twice).
"""

from datetime import date, timedelta

from app.core.exceptions import AppError
from app.schemas.invoice import InvoiceData, Shipment
from app.utils.formatting import format_date

MAX_INVOICES = 3
# A longer gap between two periods makes the average too low: the partner is warned.
GAP_WARNING_DAYS = 7


def _period(invoice: InvoiceData) -> tuple[date, date]:
    assert invoice.period_start and invoice.period_end
    return date.fromisoformat(invoice.period_start), date.fromisoformat(invoice.period_end)


def _distinct(values: list[str | None]) -> list[str]:
    seen: list[str] = []
    for value in values:
        if value and value.strip().lower() not in [s.lower() for s in seen]:
            seen.append(value.strip())
    return seen


def combine_invoices(invoices: list[InvoiceData]) -> InvoiceData:
    if not 2 <= len(invoices) <= MAX_INVOICES:
        raise AppError(
            f"Combine 2 or {MAX_INVOICES} invoices.", status_code=422, code="combine_count"
        )
    missing = [
        i + 1
        for i, invoice in enumerate(invoices)
        if not (invoice.period_start and invoice.period_end)
    ]
    if missing:
        months = ", ".join(str(m) for m in missing)
        raise AppError(
            f"Invoice {months} has no billing period. Enter it on the shipments step first, so the months can be put in order.",
            status_code=422,
            code="combine_period_missing",
        )
    currencies = _distinct([invoice.currency or "AED" for invoice in invoices])
    if len(currencies) > 1:
        raise AppError(
            f"These invoices are in different currencies ({', '.join(currencies)}), so they can't be combined.",
            status_code=422,
            code="combine_currency",
        )

    ordered = sorted(invoices, key=lambda invoice: _period(invoice)[0])
    warnings: list[str] = []
    for earlier, later in zip(ordered, ordered[1:], strict=False):
        earlier_start, earlier_end = _period(earlier)
        later_start, _ = _period(later)
        if later_start <= earlier_end:
            raise AppError(
                f"Two invoices cover the same dates ({format_date(later.period_start)} is inside "
                f"{format_date(earlier.period_start)} – {format_date(earlier.period_end)}). "
                "Combine invoices from different months.",
                status_code=422,
                code="combine_overlap",
            )
        gap = (later_start - earlier_end - timedelta(days=1)).days
        if gap > GAP_WARNING_DAYS:
            warnings.append(
                f"There are {gap} days between two of the invoices with no shipments, so the monthly average "
                "is lower than it should be. Add the missing month for a fairer figure."
            )

    for label, names in (
        ("customer", _distinct([i.customer_name for i in ordered])),
        ("courier", _distinct([i.carrier_name for i in ordered])),
    ):
        if len(names) > 1:
            warnings.append(
                f"The invoices name different {label}s ({', '.join(names)}). Check they belong together."
            )

    shipments: list[Shipment] = []
    for month, invoice in enumerate(ordered, start=1):
        shipments.extend(
            s.model_copy(update={"id": f"m{month}-{s.id}"[:40]}) for s in invoice.shipments
        )
        warnings.extend(f"Month {month}: {warning}" for warning in invoice.warnings)

    subtotals = [invoice.printed_subtotal for invoice in ordered]
    first, last = ordered[0], ordered[-1]
    return InvoiceData(
        carrier_name=first.carrier_name,
        customer_name=first.customer_name,
        invoice_number=" + ".join(i.invoice_number or "?" for i in ordered)[:80],
        invoice_date=last.invoice_date,
        period_start=first.period_start,
        period_end=last.period_end,
        currency=currencies[0] if ordered[0].currency else None,
        printed_subtotal=round(sum(s for s in subtotals if s is not None), 2)
        if all(s is not None for s in subtotals)
        else None,
        shipments=shipments,
        warnings=warnings[:100],
    )
