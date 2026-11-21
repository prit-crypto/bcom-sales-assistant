"""Real shipments from the customer's own invoice that show the saving most clearly (customer page and PDF)."""

from app.schemas.comparison import ComparisonResult
from app.schemas.invoice import InvoiceData
from app.schemas.public import SavingExample
from app.services.proposal.i18n import Language, date_text, service_text


def _place(city: str | None, country: str | None) -> str:
    return city or country or "?"


def saving_examples(
    invoice: InvoiceData, comparison: ComparisonResult, language: Language, limit: int = 2
) -> list[SavingExample]:
    """The compared shipments with the largest saving, each on a different route where possible."""
    shipments = {s.id: s for s in invoice.shipments}
    rows = sorted(
        (r for r in comparison.rows if r.status == "compared" and (r.saving or 0) > 0),
        key=lambda r: r.saving or 0,
        reverse=True,
    )
    examples: list[SavingExample] = []
    routes: set[str] = set()
    for row in rows:
        shipment = shipments.get(row.shipment_id)
        if shipment is None or row.current is None or row.proposed is None or row.saving is None:
            continue
        route = f"{_place(shipment.origin_city, shipment.origin_country)} → {_place(shipment.destination_city, shipment.destination_country)}"
        if route in routes:
            continue
        routes.add(route)
        weight = (
            f"{shipment.weight_kg:g} {'كغ' if language == 'ar' else 'kg'}"
            if shipment.weight_kg
            else ""
        )
        service = (
            service_text(row.service or "", language, row.service_label or "")
            if row.service
            else ""
        )
        detail = " · ".join(
            part
            for part in (
                service,
                weight,
                date_text(shipment.date, language) if shipment.date else "",
            )
            if part
        )
        examples.append(
            SavingExample(
                route=route,
                detail=detail,
                current=row.current,
                proposed=row.proposed,
                saving=row.saving,
            )
        )
        if len(examples) == limit:
            break
    return examples
