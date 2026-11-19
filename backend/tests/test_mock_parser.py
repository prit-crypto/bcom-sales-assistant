from typing import Any

import pytest

from app.schemas.invoice import InvoiceData
from app.services.invoice.mock_parser import parse_sample_invoice_text
from app.services.invoice.normalize import normalize_invoice
from app.services.invoice.pdf_text import extract_pdf_pages
from app.services.pricing.comparison import compare_invoice
from tests.conftest import sample_pdf

# Mock mode reads only the SwiftLine layout by design; other layouts need an AI provider.
SWIFTLINE = ["sample-1-al-noor-mobile", "sample-2-gulf-spice"]


def read_sample(file_stem: str) -> InvoiceData:
    return normalize_invoice(parse_sample_invoice_text(extract_pdf_pages(sample_pdf(file_stem))))


@pytest.mark.parametrize("file_stem", SWIFTLINE)
def test_reads_the_header_and_every_shipment_line_exactly(
    file_stem: str, expected_samples: list[dict[str, Any]]
) -> None:
    expected = next(sample for sample in expected_samples if sample["file_stem"] == file_stem)
    invoice = read_sample(file_stem)

    assert invoice.carrier_name == expected["carrier_name"]
    assert invoice.customer_name == expected["customer_name"]
    assert invoice.invoice_number == expected["invoice_number"]
    assert invoice.invoice_date == expected["invoice_date"]
    assert invoice.period_start == expected["period_start"]
    assert invoice.period_end == expected["period_end"]
    assert invoice.currency == "AED"
    assert len(invoice.shipments) == len(expected["rows"])

    for shipment, row in zip(invoice.shipments, expected["rows"], strict=True):
        assert shipment.date == row["date"]
        assert shipment.reference == row["awb"]
        assert shipment.origin_country == row["origin_country"]
        assert shipment.destination_country == row["destination_country"]
        assert shipment.destination_city == row["destination_city"]
        assert shipment.weight_kg == row["weight_kg"]
        assert shipment.service == row["service"]
        assert shipment.charge == row["amount"]


def test_sample_1_is_mostly_comparable_with_one_destination_off_the_card() -> None:
    summary = compare_invoice(read_sample("sample-1-al-noor-mobile")).summary
    assert summary.total_shipments == 46
    assert summary.status_counts.not_eligible == 1
    assert summary.saving > 0
    assert summary.has_saving is True
    # UAE domestic lanes are cheaper with the current courier, so some shipments cost more with BCOM.
    assert summary.higher_priced_shipments > 0


def test_sample_2_flags_missing_weights_an_import_and_a_heavy_box() -> None:
    invoice = read_sample("sample-2-gulf-spice")
    result = compare_invoice(invoice)
    assert result.summary.status_counts.missing_data == 2
    assert result.summary.status_counts.not_eligible == 2
    reasons = [row.reason or "" for row in result.rows if row.status == "not_eligible"]
    assert "Not sent from the UAE" in reasons[0]
    assert "Over 70 kg" in reasons[1]
    assert "missing fields" in " ".join(invoice.warnings)


def test_returns_no_shipments_for_other_layouts() -> None:
    assert parse_sample_invoice_text(["Some other invoice\nTotal 100.00"]).shipments == []
