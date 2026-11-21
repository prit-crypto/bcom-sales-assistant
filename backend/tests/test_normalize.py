from app.schemas.api import PartnerInput
from app.schemas.raw_invoice import RawInvoice, RawShipment
from app.services.invoice.normalize import (
    normalize_country,
    normalize_date,
    normalize_invoice,
    normalize_number,
    normalize_service,
)
from app.services.pricing.comparison import compare_invoice
from app.services.whatsapp import build_sales_message_facts, render_template_message

PARTNER = PartnerInput(
    partner_name="Rahul", partner_company="BCOM Sharjah", prospect_name="Test Co", validity_days=30
)


def raw_invoice(**overrides: object) -> RawInvoice:
    values: dict[str, object] = {
        "carrier_name": "SwiftLine Express LLC",
        "customer_name": "Test Co",
        "invoice_number": "1",
        "invoice_date": "2026-11-01",
        "period_start": "2026-10-01",
        "period_end": "2026-10-31",
        "currency": "AED",
        "notes": [],
        "shipments": [
            RawShipment(
                date="2026-10-02", reference="A", origin_city="Dubai", origin_country="AE",
                destination_city="Riyadh", destination_country="SA", weight_kg=2, pieces=1,
                service="Express Worldwide", charge=120,
            )
        ],
    }  # fmt: skip
    values.update(overrides)
    return RawInvoice.model_validate(values)


def test_cleans_countries_dates_numbers_and_services() -> None:
    assert normalize_country("sa") == "SA"
    assert normalize_country("United Arab Emirates") == "AE"
    assert normalize_country("Atlantis") is None
    assert normalize_date("2 October 2026") == "2026-10-02"
    assert normalize_date("02-Oct-2026") == "2026-10-02"
    assert normalize_date("yesterday") is None
    assert normalize_number("1,485.50") == 1485.5
    assert normalize_number("—") is None
    assert normalize_number(0) is None
    assert normalize_service("Express Worldwide") == "express"
    assert normalize_service("Economy Select") == "economy"
    assert normalize_service("EXP-WPX") == "express"
    assert normalize_service("ECO") == "economy"
    assert normalize_service("Saver (economy)") == "economy"
    assert normalize_service("Mystery") is None


def test_builds_a_message_only_from_calculated_facts() -> None:
    invoice = normalize_invoice(raw_invoice())
    facts = build_sales_message_facts(compare_invoice(invoice).summary, PARTNER)
    assert facts.monthly_saving == "AED 25"
    assert facts.yearly_saving == "AED 300"
    assert "AED 25 every month" in render_template_message(facts)


def test_warns_when_a_currency_has_no_rate() -> None:
    invoice = normalize_invoice(
        raw_invoice(currency="chf", shipments=[], carrier_name="Oryx Express Inc.")
    )
    assert invoice.currency == "CHF"
    assert "no exchange rate is set for CHF" in " ".join(invoice.warnings)


def test_warns_when_the_currency_or_period_is_missing() -> None:
    invoice = normalize_invoice(raw_invoice(currency=None, period_start=None))
    warnings = " ".join(invoice.warnings)
    assert invoice.currency is None
    assert "currency was not found" in warnings
    assert "billing period was not found" in warnings


def test_rounds_fractional_pieces_to_at_least_one() -> None:
    shipment = raw_invoice().shipments[0].model_copy(update={"pieces": "0.4"})
    invoice = normalize_invoice(raw_invoice(shipments=[shipment]))
    assert invoice.shipments[0].pieces == 1


def shipment(**overrides: object) -> RawShipment:
    values: dict[str, object] = {
        "date": "2026-10-02", "reference": "A", "origin_city": "Dubai", "origin_country": "AE",
        "destination_city": "Riyadh", "destination_country": "SA", "weight_kg": 2, "pieces": 1,
        "service": "Express Worldwide", "charge": 120,
    }  # fmt: skip
    values.update(overrides)
    return RawShipment.model_validate(values)


def test_shortens_over_long_text_instead_of_failing() -> None:
    # A reader may return a company name together with its full address, or a long reference.
    invoice = normalize_invoice(
        raw_invoice(
            customer_name="Gulf Spice Traders LLC, Shop 22, Spice Souk Road, Deira, Dubai " * 3,
            invoice_number="N" * 90,
            shipments=[shipment(reference="R" * 100, destination_city="C" * 90)],
        )
    )
    assert invoice.customer_name is not None and len(invoice.customer_name) <= 120
    assert invoice.invoice_number == "N" * 80
    assert invoice.shipments[0].reference == "R" * 80
    assert invoice.shipments[0].destination_city == "C" * 80
    assert "4 text values were too long and shortened" in invoice.warnings[0]
    # Shortened text does not affect the price: the shipment is still compared.
    assert compare_invoice(invoice).summary.compared_shipments == 1


def test_leaves_impossible_numbers_empty_for_the_partner_to_fix() -> None:
    invoice = normalize_invoice(
        raw_invoice(shipments=[shipment(weight_kg=150_000, charge=12_000_000, pieces=200_000)])
    )
    row = invoice.shipments[0]
    assert (row.weight_kg, row.charge, row.pieces) == (None, None, None)
    assert "3 numbers were far too large" in invoice.warnings[0]
    # The emptied cells show as missing, so the row waits for the partner instead of being priced.
    result = compare_invoice(invoice)
    assert result.rows[0].status == "missing_data"
    assert result.rows[0].missing_fields == ["weight_kg", "charge"]


def test_values_at_the_limit_are_kept_unchanged() -> None:
    invoice = normalize_invoice(
        raw_invoice(
            customer_name="X" * 120,
            shipments=[shipment(reference="R" * 80, weight_kg=100_000, charge=10_000_000)],
        )
    )
    assert invoice.customer_name == "X" * 120
    assert invoice.shipments[0].weight_kg == 100_000
    assert not any("too long" in warning or "too large" in warning for warning in invoice.warnings)
