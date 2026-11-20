"""The comparison as an Excel workbook the partner can keep, filter or forward."""

import io
import re

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from app.schemas.comparison import ComparisonResult, GroupTotal
from app.schemas.invoice import InvoiceData
from app.utils.formatting import format_money, format_percent

_HEADER_FILL = PatternFill("solid", fgColor="141416")
_HEADER_FONT = Font(bold=True, color="FFFFFF")
_MONEY = "#,##0.00"
_STATUS = {
    "compared": "Compared",
    "missing_data": "Missing data",
    "not_eligible": "Not on the rate card",
    "excluded": "Left out",
}


def _table(
    sheet: Worksheet, headers: list[str], rows: list[list[object]], money_columns: set[int]
) -> None:
    sheet.append(headers)
    for cell in sheet[1]:
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(vertical="center")
    for row in rows:
        sheet.append(row)
    for column in money_columns:
        for cell in sheet.iter_rows(min_row=2, min_col=column, max_col=column):
            cell[0].number_format = _MONEY
    sheet.freeze_panes = "A2"
    for index, header in enumerate(headers, start=1):
        width = max(
            [len(header)] + [len(str(row[index - 1])) for row in rows if row[index - 1] is not None]
        )
        sheet.column_dimensions[get_column_letter(index)].width = min(max(10, width + 2), 48)


def _groups(sheet: Worksheet, groups: list[GroupTotal]) -> None:
    _table(
        sheet,
        ["Name", "Shipments", "Today (AED)", "With BCOM (AED)", "Saving (AED)"],
        [[g.label, g.shipments, g.current, g.proposed, g.saving] for g in groups],
        {3, 4, 5},
    )


def build_workbook(invoice: InvoiceData, comparison: ComparisonResult) -> bytes:
    summary = comparison.summary
    book = Workbook()

    overview = book.active
    assert overview is not None
    overview.title = "Summary"
    prospect = invoice.customer_name or "Prospect"
    saves = summary.monthly_saving > 0
    overview.append([f"{prospect}: BCOM savings estimate"])
    overview["A1"].font = Font(bold=True, size=14, color="1D1D1F")
    overview.append([])
    facts: list[tuple[str, object]] = [
        (
            "Saving per month (AED)" if saves else "Extra cost per month (AED)",
            abs(summary.monthly_saving),
        ),
        (
            "Saving per year (AED)" if saves else "Extra cost per year (AED)",
            abs(summary.yearly_saving),
        ),
        ("Saving %", format_percent(summary.saving_pct)),
        ("Today per month (AED)", summary.monthly_current),
        ("With BCOM per month (AED)", summary.monthly_proposed),
        ("Shipments compared", f"{summary.compared_shipments} of {summary.total_shipments}"),
        ("Current courier", invoice.carrier_name or "–"),
        ("Invoice", invoice.invoice_number or "–"),
    ]
    if not summary.scenario.is_like_for_like:
        facts.insert(
            2, ("Like-for-like saving per month (AED)", summary.like_for_like_monthly_saving)
        )
    for label, value in facts:
        overview.append([label, value])
        overview.cell(row=overview.max_row, column=1).font = Font(bold=True)
        if isinstance(value, (int, float)):
            overview.cell(row=overview.max_row, column=2).number_format = _MONEY
    overview.append([])
    overview.append(["How this was calculated"])
    overview.cell(row=overview.max_row, column=1).font = Font(bold=True, color="1D1D1F")
    for line in summary.assumptions:
        overview.append([line])
    overview.column_dimensions["A"].width = 44
    overview.column_dimensions["B"].width = 22

    shipments = book.create_sheet("Shipments")
    rows: list[list[object]] = []
    for row, shipment in zip(comparison.rows, invoice.shipments, strict=True):
        rows.append(
            [
                shipment.reference,
                shipment.date,
                f"{shipment.origin_city or shipment.origin_country or ''} → {shipment.destination_city or shipment.destination_country or ''}",
                shipment.destination_country,
                row.service_label,
                shipment.weight_kg,
                row.current,
                row.proposed,
                row.saving,
                _STATUS[row.status],
                row.reason,
            ]
        )
    _table(
        shipments,
        [
            "Waybill",
            "Date",
            "Route",
            "To",
            "BCOM service",
            "Weight (kg)",
            "Today (AED)",
            "With BCOM (AED)",
            "Saving (AED)",
            "Status",
            "Reason",
        ],
        rows,
        {7, 8, 9},
    )

    _groups(book.create_sheet("By region"), summary.by_zone)
    _groups(book.create_sheet("By route"), summary.top_lanes)

    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def export_file_name(invoice: InvoiceData) -> str:
    prospect = (
        re.sub(r"[^A-Za-z0-9]+", "-", invoice.customer_name or "prospect").strip("-") or "prospect"
    )
    return f"BCOM-comparison-{prospect}.xlsx"


__all__ = ["build_workbook", "export_file_name", "format_money"]
