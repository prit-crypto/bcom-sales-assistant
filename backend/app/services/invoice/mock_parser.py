"""Rule-based reader for OUR sample invoice format only (fictional "SwiftLine Express").

Used by the `mock` provider so the whole app can be built and tested without any AI or cost.
It is deliberately strict: any other invoice layout returns no shipments.
"""

import re

from app.schemas.raw_invoice import RawInvoice, RawShipment

_DATE = r"\d{2} [A-Z][a-z]{2} \d{4}"
_PLACE = r"([A-Za-z][A-Za-z .'-]*?), ([A-Z]{2})"
_SERVICE = r"(Express Worldwide|Economy Select|Domestic Express|Domestic Economy)"

_ROW = re.compile(
    rf"({_DATE}) (SWL \d{{4}} \d{{4}} \d{{2}}) {_PLACE} {_PLACE} {_SERVICE} (\d+) "
    rf"(\d+(?:\.\d+)?|—|-) ([\d,]+\.\d{{2}})"
)
_PERIOD = re.compile(rf"Billing Period: ({_DATE}) - ({_DATE})")
_CARRIER = re.compile(r"^([^\n·]+?\bLLC) · ", re.MULTILINE)
_CUSTOMER = re.compile(r"BILL TO\s*\n\s*(.+)", re.IGNORECASE)
_INVOICE_NO = re.compile(r"Invoice No: (\S+)")
_INVOICE_DATE = re.compile(rf"Invoice Date: ({_DATE})")
_CURRENCY = re.compile(r"Currency: ([A-Z]{3})")


def _first(pattern: re.Pattern[str], text: str) -> str | None:
    match = pattern.search(text)
    return match.group(1).strip() if match else None


def parse_sample_invoice_text(pages: list[str]) -> RawInvoice:
    full_text = "\n".join(pages)
    # Collapse all whitespace (including line breaks inside table cells) to single spaces.
    flat = re.sub(r"\s+", " ", full_text)

    shipments = [
        RawShipment(
            date=match.group(1),
            reference=match.group(2),
            origin_city=match.group(3),
            origin_country=match.group(4),
            destination_city=match.group(5),
            destination_country=match.group(6),
            service=match.group(7),
            pieces=int(match.group(8)),
            weight_kg=None if match.group(9) in ("—", "-") else float(match.group(9)),
            charge=float(match.group(10).replace(",", "")),
        )
        for match in _ROW.finditer(flat)
    ]

    notes: list[str] = []
    missing_weights = sum(1 for shipment in shipments if shipment.weight_kg is None)
    if missing_weights:
        plural = "" if missing_weights == 1 else "s"
        notes.append(f"{missing_weights} line{plural} show a dash instead of a weight.")

    period = _PERIOD.search(flat)
    return RawInvoice(
        carrier_name=_first(_CARRIER, full_text),
        customer_name=_first(_CUSTOMER, full_text),
        invoice_number=_first(_INVOICE_NO, flat),
        invoice_date=_first(_INVOICE_DATE, flat),
        period_start=period.group(1) if period else None,
        period_end=period.group(2) if period else None,
        currency=_first(_CURRENCY, flat),
        shipments=shipments,
        notes=notes,
    )
