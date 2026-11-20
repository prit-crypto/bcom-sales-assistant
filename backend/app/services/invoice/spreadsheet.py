"""Reads a courier statement exported as CSV or Excel, without any AI.

Many couriers let customers download their monthly statement as a spreadsheet. Its columns are found by
name (with common variations: "AWB", "Waybill No", "Tracking number"…), turned into the same raw shape the
AI readers return, and cleaned by the usual `normalize_invoice`. Instant, free and exact.
"""

import csv
import io
import re
from datetime import date, datetime
from typing import Any

from app.core.exceptions import AppError
from app.schemas.raw_invoice import RawInvoice, RawShipment
from app.services.invoice.upload import XLSX, InvoiceFile

# Our field -> header spellings (compared lower-case with spaces, dots, brackets and units removed).
COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "date": ("date", "shipdate", "shipmentdate", "pickupdate", "despatchdate", "dispatchdate", "bookingdate"),
    "reference": (
        "awb", "awbno", "awbnumber", "waybill", "waybillno", "waybillnumber", "airwaybill", "tracking",
        "trackingno", "trackingnumber", "reference", "ref", "consignment", "consignmentno", "shipmentno",
    ),
    "origin_city": ("origincity", "fromcity", "sendercity", "shippercity"),
    "origin_country": ("origincountry", "fromcountry", "sendercountry", "shippercountry"),
    "origin": ("origin", "from"),
    "destination_city": ("destinationcity", "tocity", "receivercity", "consigneecity"),
    "destination_country": ("destinationcountry", "tocountry", "destcountry", "receivercountry", "consigneecountry"),
    "destination": ("destination", "to", "dest"),
    "service": ("service", "product", "servicetype", "producttype", "serviceproduct"),
    "pieces": ("pcs", "pieces", "qty", "quantity", "noofpieces", "packages"),
    "weight_kg": ("weight", "weightkg", "chargeableweight", "chargeableweightkg", "billedweight", "wt", "kg"),
    "charge": (
        "amount", "charge", "charges", "net", "netamount", "linetotal", "price", "amountexclvat",
        "netcharge", "freight", "total", "totalcharge",
    ),
}  # fmt: skip

# What a statement needs before it can be compared.
REQUIRED = {
    "destination": ("destination", "destination_country"),
    "weight": ("weight_kg",),
    "service": ("service",),
    "charge": ("charge",),
}
_HEADER_SEARCH_ROWS = 10
_MAX_ROWS = 2000
_CURRENCY_IN_HEADER = re.compile(r"\b([A-Z]{3})\b")
_DAY_FIRST = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$")


def _key(header: object) -> str:
    text = str(header or "").lower()
    text = re.sub(r"\((?:aed|usd|eur|gbp|sar|kg|excl\.? vat|ex vat)\)", "", text)
    return re.sub(r"[^a-z]", "", text)


def _match_columns(headers: list[object]) -> dict[str, int]:
    found: dict[str, int] = {}
    for index, header in enumerate(headers):
        key = _key(header)
        for field, aliases in COLUMN_ALIASES.items():
            if field not in found and key in aliases:
                found[field] = index
                break
    return found


def _rows_from_csv(data: bytes) -> list[list[object]]:
    text = data.decode("utf-8-sig", errors="replace")
    try:
        dialect: type[csv.Dialect] | csv.Dialect = csv.Sniffer().sniff(
            text[:4096], delimiters=",;\t"
        )
    except csv.Error:
        dialect = csv.excel
    return [list(row) for row in csv.reader(io.StringIO(text), dialect)]


def _rows_from_xlsx(data: bytes) -> list[list[object]]:
    from openpyxl import load_workbook

    try:
        workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as exc:  # openpyxl raises many kinds for a damaged file
        raise AppError(
            "The Excel file could not be opened.", status_code=422, code="spreadsheet_unreadable"
        ) from exc
    sheet = workbook.worksheets[0]
    rows = [
        list(row)
        for row in sheet.iter_rows(values_only=True, max_row=_MAX_ROWS + _HEADER_SEARCH_ROWS)
    ]
    workbook.close()
    return rows


def _cell(row: list[object], columns: dict[str, int], field: str) -> object:
    index = columns.get(field)
    if index is None or index >= len(row):
        return None
    value = row[index]
    return value.strip() if isinstance(value, str) else value


def _text(value: object) -> str | None:
    if value is None or value == "":
        return None
    return str(value).strip() or None


def _date(value: object) -> str | None:
    """ISO dates, Excel dates and day-first dates (the UAE convention: 02/10/2026 = 2 October)."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = _text(value)
    if not text:
        return None
    match = _DAY_FIRST.match(text)
    if match:
        day, month, year = (int(part) for part in match.groups())
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            return None
    return text  # "2026-10-02" or "02 Oct 2026": normalize_date handles these


def _place(
    row: list[object], columns: dict[str, int], prefix: str
) -> tuple[str | None, str | None]:
    """City and country from separate columns, or from one "Dubai, AE" style column."""
    city = _text(_cell(row, columns, f"{prefix}_city"))
    country = _text(_cell(row, columns, f"{prefix}_country"))
    combined = _text(_cell(row, columns, prefix))
    if combined and (city is None or country is None):
        parts = [part.strip() for part in combined.rsplit(",", 1)]
        if len(parts) == 2:
            city = city or parts[0]
            country = country or parts[1]
        elif len(combined) == 2 and combined.isalpha():
            country = country or combined
        else:
            city = city or combined
    return city, country


def _number(value: object) -> float | int | str | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return value
    return str(value)


def parse_spreadsheet(file: InvoiceFile) -> RawInvoice:
    rows = _rows_from_xlsx(file.data) if file.mime_type == XLSX else _rows_from_csv(file.data)

    header_index, columns = -1, {}
    for index, row in enumerate(rows[:_HEADER_SEARCH_ROWS]):
        candidate = _match_columns(row)
        if len(candidate) >= 3:
            header_index, columns = index, candidate
            break
    missing = [
        name for name, fields in REQUIRED.items() if not any(field in columns for field in fields)
    ]
    if header_index < 0 or missing:
        seen = ", ".join(
            str(h)
            for h in (rows[header_index] if header_index >= 0 else rows[0] if rows else [])
            if h
        )
        raise AppError(
            "Couldn't find the columns this needs: "
            + ", ".join(missing or list(REQUIRED))
            + f". Found: {seen or 'no headings'}. Use the template on the upload screen, or rename the headings.",
            status_code=422,
            code="spreadsheet_columns_missing",
        )

    headers = rows[header_index]
    charge_header = str(headers[columns["charge"]] or "")
    currency_match = _CURRENCY_IN_HEADER.search(charge_header.upper())
    currency = (
        currency_match.group(1) if currency_match and currency_match.group(1) != "VAT" else None
    )

    shipments: list[RawShipment] = []
    for row in rows[header_index + 1 : header_index + 1 + _MAX_ROWS]:
        if not any(cell not in (None, "") for cell in row):
            continue
        origin_city, origin_country = _place(row, columns, "origin")
        destination_city, destination_country = _place(row, columns, "destination")
        values: dict[str, Any] = {
            "date": _date(_cell(row, columns, "date")),
            "reference": _text(_cell(row, columns, "reference")),
            "origin_city": origin_city,
            "origin_country": origin_country,
            "destination_city": destination_city,
            "destination_country": destination_country,
            "weight_kg": _number(_cell(row, columns, "weight_kg")),
            "pieces": _number(_cell(row, columns, "pieces")),
            "service": _text(_cell(row, columns, "service")),
            "charge": _number(_cell(row, columns, "charge")),
        }
        # Subtotal / total rows at the bottom have a charge but no destination or weight.
        if (
            values["destination_country"] is None
            and values["destination_city"] is None
            and values["weight_kg"] is None
        ):
            continue
        shipments.append(RawShipment(**values))

    if not shipments:
        raise AppError(
            "The spreadsheet has headings but no shipment rows.",
            status_code=422,
            code="spreadsheet_empty",
        )

    return RawInvoice(
        carrier_name=None,
        customer_name=None,
        invoice_number=None,
        invoice_date=None,
        period_start=None,
        period_end=None,
        currency=currency,
        shipments=shipments,
        notes=[
            "Read from a spreadsheet, without AI. Dates written like 02/10/2026 are read day first (2 October)."
        ],
    )
