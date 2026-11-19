"""Turns any reader's raw output into clean, typed invoice data the partner can edit and price."""

import re

from app.schemas.invoice import InvoiceData, ServiceLevel, Shipment
from app.schemas.raw_invoice import LooseNumber, RawInvoice, RawShipment
from app.services.invoice.validation import get_missing_fields
from app.services.pricing.rate_card import RATE_CARD_CURRENCY
from app.utils.formatting import round_half_up

_MONTHS = {
    "jan": "01", "feb": "02", "mar": "03", "apr": "04", "may": "05", "jun": "06",
    "jul": "07", "aug": "08", "sep": "09", "oct": "10", "nov": "11", "dec": "12",
}  # fmt: skip

# Country names an AI or an invoice may use instead of an ISO code.
_COUNTRY_ALIASES = {
    "UAE": "AE", "UNITED ARAB EMIRATES": "AE", "KSA": "SA", "SAUDI ARABIA": "SA", "OMAN": "OM",
    "QATAR": "QA", "BAHRAIN": "BH", "KUWAIT": "KW", "EGYPT": "EG", "JORDAN": "JO", "LEBANON": "LB",
    "INDIA": "IN", "PAKISTAN": "PK", "SRI LANKA": "LK", "UK": "GB", "UNITED KINGDOM": "GB",
    "GREAT BRITAIN": "GB", "GERMANY": "DE", "FRANCE": "FR", "NETHERLANDS": "NL", "TURKEY": "TR",
    "TURKIYE": "TR", "USA": "US", "UNITED STATES": "US", "CANADA": "CA", "CHINA": "CN",
    "HONG KONG": "HK", "SINGAPORE": "SG", "AUSTRALIA": "AU", "JAPAN": "JP",
}  # fmt: skip

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TEXT_DATE = re.compile(r"^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{4})$")
_ECONOMY = re.compile(r"(econom|saver|standard|deferred|ground|road|^eco\b)")
_EXPRESS = re.compile(r"(express|priority|next day|same day|worldwide|premium|^exp\b)")


def _clean_text(value: str | None) -> str | None:
    trimmed = value.strip() if value else ""
    return trimmed or None


def normalize_country(value: str | None) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    text = text.upper().replace(".", "")
    if re.fullmatch(r"[A-Z]{2}", text):
        return text
    return _COUNTRY_ALIASES.get(text)


def normalize_date(value: str | None) -> str | None:
    """Accepts YYYY-MM-DD, '02 Oct 2026' or '2 October 2026'; returns YYYY-MM-DD or None."""
    text = _clean_text(value)
    if not text:
        return None
    if _ISO_DATE.match(text):
        return text
    match = _TEXT_DATE.match(text)
    if match:
        month = _MONTHS.get(match.group(2).lower())
        if month:
            return f"{match.group(3)}-{month}-{match.group(1).zfill(2)}"
    return None


def normalize_number(value: LooseNumber) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        number = float(value)
    else:
        try:
            number = float(re.sub(r"[^\d.-]", "", value))
        except ValueError:
            return None
    return number if number > 0 and number != float("inf") else None


def normalize_service(value: str | None) -> ServiceLevel | None:
    text = _clean_text(value)
    if not text:
        return None
    text = text.lower()
    if _ECONOMY.search(text):
        return "economy"
    if _EXPRESS.search(text):
        return "express"
    return None


def _normalize_shipment(raw: RawShipment, index: int) -> Shipment:
    pieces = normalize_number(raw.pieces)
    return Shipment(
        id=f"s{index + 1}",
        date=normalize_date(raw.date),
        reference=_clean_text(raw.reference),
        origin_city=_clean_text(raw.origin_city),
        origin_country=normalize_country(raw.origin_country),
        destination_city=_clean_text(raw.destination_city),
        destination_country=normalize_country(raw.destination_country),
        weight_kg=normalize_number(raw.weight_kg),
        pieces=None if pieces is None else max(1, int(round_half_up(pieces))),
        service=normalize_service(raw.service),
        charge=normalize_number(raw.charge),
        included=True,
    )


def normalize_invoice(raw: RawInvoice) -> InvoiceData:
    shipments = [
        _normalize_shipment(shipment, index) for index, shipment in enumerate(raw.shipments)
    ]
    warnings = [note.strip()[:500] for note in raw.notes if note.strip()]

    incomplete = sum(1 for shipment in shipments if get_missing_fields(shipment))
    if incomplete:
        verb = " has" if incomplete == 1 else "s have"
        warnings.append(
            f"{incomplete} shipment{verb} missing fields. Fill them in or exclude the rows before comparing."
        )
    if not shipments:
        warnings.append("No shipment lines were found on this invoice.")

    period_start = normalize_date(raw.period_start)
    period_end = normalize_date(raw.period_end)
    if shipments and (period_start is None or period_end is None):
        warnings.append(
            "The billing period was not found. The savings treat this invoice as one month of "
            "shipping. Enter the period if it covers a different length of time."
        )

    raw_currency = _clean_text(raw.currency)
    currency = raw_currency.upper() if raw_currency else None
    if currency and not re.fullmatch(r"[A-Z]{3}", currency):
        currency = None
    if currency is None and shipments:
        warnings.append(
            f"The currency was not found on the invoice, so the amounts are assumed to be in "
            f"{RATE_CARD_CURRENCY}. Enter the currency if it is different."
        )
    elif currency and currency != RATE_CARD_CURRENCY:
        warnings.append(
            f"This invoice is in {currency}. The BCOM rate card is in {RATE_CARD_CURRENCY}, so its shipments cannot be compared yet."
        )

    return InvoiceData(
        carrier_name=_clean_text(raw.carrier_name),
        customer_name=_clean_text(raw.customer_name),
        invoice_number=_clean_text(raw.invoice_number),
        invoice_date=normalize_date(raw.invoice_date),
        period_start=period_start,
        period_end=period_end,
        currency=currency,
        shipments=shipments[:2000],
        warnings=warnings[:100],
    )
