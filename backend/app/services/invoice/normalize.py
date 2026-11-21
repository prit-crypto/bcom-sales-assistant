"""Turns any reader's raw output into clean, typed invoice data the partner can edit and price."""

import re

from app.core.config import get_settings
from app.schemas.invoice import (
    EDITABLE_FIELDS,
    MAX_CHARGE,
    MAX_LONG_TEXT,
    MAX_PIECES,
    MAX_SHIPMENTS,
    MAX_SHORT_TEXT,
    MAX_SUBTOTAL,
    MAX_WARNING_LENGTH,
    MAX_WARNINGS,
    MAX_WEIGHT_KG,
    EditableField,
    InvoiceData,
    ServiceLevel,
    Shipment,
)
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


class _Fixes:
    """Counts values from the reader that had to be shortened or dropped to fit the API limits.

    A reader (especially an AI) can return a name together with its whole address, or misread a total as a
    weight. Those values must not make the whole invoice fail: text is shortened and impossible numbers are
    left empty, so the partner sees a highlighted cell and can correct it.
    """

    def __init__(self) -> None:
        self.shortened = 0
        self.cleared = 0

    def text(self, value: str | None, limit: int) -> str | None:
        cleaned = _clean_text(value)
        if cleaned is not None and len(cleaned) > limit:
            self.shortened += 1
            return cleaned[:limit].rstrip()
        return cleaned

    def number(self, value: LooseNumber, limit: float) -> float | None:
        number = normalize_number(value)
        if number is not None and number > limit:
            self.cleared += 1
            return None
        return number

    def warnings(self) -> list[str]:
        notes: list[str] = []
        if self.shortened:
            notes.append(
                f"{self.shortened} text value{'s were' if self.shortened > 1 else ' was'} too long and "
                "shortened (for example a name printed together with its address). Please check them."
            )
        if self.cleared:
            notes.append(
                f"{self.cleared} number{'s were' if self.cleared > 1 else ' was'} far too large to be "
                "right (probably misread) and left empty. Fill in the highlighted cells."
            )
        return notes


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


# Names a reader may use for a field it was unsure about, mapped to ours.
_FIELD_ALIASES = {
    "weight": "weight_kg",
    "weightkg": "weight_kg",
    "amount": "charge",
    "awb": "reference",
    "waybill": "reference",
}


def normalize_uncertain(names: list[str]) -> list[EditableField]:
    found: list[EditableField] = []
    for name in names:
        key = re.sub(r"[^a-z_]", "", name.strip().lower())
        key = _FIELD_ALIASES.get(key.replace("_", ""), key)
        if key in EDITABLE_FIELDS and key not in found:
            found.append(key)
    return found


def _normalize_shipment(raw: RawShipment, index: int, fixes: _Fixes) -> Shipment:
    pieces = fixes.number(raw.pieces, MAX_PIECES)
    return Shipment(
        id=f"s{index + 1}",
        date=normalize_date(raw.date),
        reference=fixes.text(raw.reference, MAX_SHORT_TEXT),
        origin_city=fixes.text(raw.origin_city, MAX_SHORT_TEXT),
        origin_country=normalize_country(raw.origin_country),
        destination_city=fixes.text(raw.destination_city, MAX_SHORT_TEXT),
        destination_country=normalize_country(raw.destination_country),
        weight_kg=fixes.number(raw.weight_kg, MAX_WEIGHT_KG),
        pieces=None if pieces is None else max(1, int(round_half_up(pieces))),
        service=normalize_service(raw.service),
        charge=fixes.number(raw.charge, MAX_CHARGE),
        included=True,
        uncertain_fields=normalize_uncertain(raw.uncertain_fields),
    )


def normalize_invoice(raw: RawInvoice) -> InvoiceData:
    fixes = _Fixes()
    shipments = [
        _normalize_shipment(shipment, index, fixes)
        for index, shipment in enumerate(raw.shipments[:MAX_SHIPMENTS])
    ]
    warnings = [note.strip()[:MAX_WARNING_LENGTH] for note in raw.notes if note.strip()]
    if len(raw.shipments) > MAX_SHIPMENTS:
        warnings.append(
            f"The invoice has {len(raw.shipments)} shipment lines; only the first {MAX_SHIPMENTS} are used."
        )

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

    carrier_name = fixes.text(raw.carrier_name, MAX_LONG_TEXT)
    customer_name = fixes.text(raw.customer_name, MAX_LONG_TEXT)
    invoice_number = fixes.text(raw.invoice_number, MAX_SHORT_TEXT)
    printed_subtotal = fixes.number(raw.invoice_subtotal, MAX_SUBTOTAL)
    # Last, so the counts include every value; first in the list, so they are not cut off by the limit.
    warnings = fixes.warnings() + warnings

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
        rate = get_settings().fx_rates_to_aed.get(currency)
        if rate is not None:
            warnings.append(
                f"This invoice is in {currency}. Its amounts will be converted at {rate:g} "
                f"{RATE_CARD_CURRENCY} per {currency} to compare them with the BCOM rate card."
            )
        else:
            warnings.append(
                f"This invoice is in {currency}. The BCOM rate card is in {RATE_CARD_CURRENCY} and no exchange rate is set for {currency}, so its shipments cannot be compared yet."
            )

    return InvoiceData(
        carrier_name=carrier_name,
        customer_name=customer_name,
        invoice_number=invoice_number,
        invoice_date=normalize_date(raw.invoice_date),
        period_start=period_start,
        period_end=period_end,
        currency=currency,
        printed_subtotal=printed_subtotal,
        shipments=shipments,
        warnings=warnings[:MAX_WARNINGS],
    )
