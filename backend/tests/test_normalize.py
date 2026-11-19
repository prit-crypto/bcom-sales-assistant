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


def test_warns_straight_away_when_the_invoice_is_not_in_aed() -> None:
    invoice = normalize_invoice(
        raw_invoice(currency="usd", shipments=[], carrier_name="Oryx Express Inc.")
    )
    assert invoice.currency == "USD"
    assert "This invoice is in USD" in " ".join(invoice.warnings)


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
