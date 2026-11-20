import json
from typing import Any

from app.schemas.raw_invoice import RawInvoice
from app.services.invoice.normalize import normalize_invoice
from app.services.pricing.comparison import compare_invoice
from tests.conftest import FIXTURES, make_invoice, make_shipment


def test_usd_invoice_is_converted_at_the_peg_and_compared() -> None:
    # 32.67 USD x 3.6725 = 119.98 AED; Z2 express 2 kg costs 95 with BCOM.
    result = compare_invoice(make_invoice([make_shipment(charge=32.67)], currency="USD"))
    summary = result.summary
    assert summary.compared_shipments == 1
    assert result.rows[0].current == 119.98
    assert summary.saving == 24.98
    assert summary.converted_from is not None
    assert summary.converted_from.currency == "USD"
    assert summary.converted_from.rate == 3.6725
    assert summary.converted_from.original_spend == 32.67
    assert any("3.6725 AED per USD" in line and "peg" in line for line in summary.assumptions)


def test_other_currencies_use_configured_rates() -> None:
    result = compare_invoice(
        make_invoice([make_shipment(charge=30)], currency="EUR"), fx_rates={"EUR": 4.0}
    )
    assert result.rows[0].current == 120
    assert result.summary.converted_from is not None
    assert result.summary.converted_from.currency == "EUR"


def test_aed_invoices_are_not_converted() -> None:
    assert compare_invoice(make_invoice([make_shipment()])).summary.converted_from is None


def test_rates_come_from_settings(monkeypatch: Any) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("FX_RATES_TO_AED", json.dumps({"USD": 3.6725, "GBP": 4.9}))
    get_settings.cache_clear()
    result = compare_invoice(make_invoice([make_shipment(charge=20)], currency="GBP"))
    assert result.rows[0].current == 98


def test_oryx_usd_sample_now_shows_a_saving() -> None:
    expected: list[dict[str, Any]] = json.loads((FIXTURES / "expected_samples.json").read_text())
    oryx = next(sample for sample in expected if sample["file_stem"] == "sample-6-oryx-usd")
    shipments = [
        make_shipment(
            id=f"s{index}", date=row["date"], reference=row["awb"], origin_country=row["origin_country"],
            destination_city=row["destination_city"], destination_country=row["destination_country"],
            weight_kg=row["weight_kg"], service=row["service"], charge=row["amount"],
        )
        for index, row in enumerate(oryx["rows"])
    ]  # fmt: skip
    summary = compare_invoice(
        make_invoice(
            shipments,
            currency="USD",
            period_start=oryx["period_start"],
            period_end=oryx["period_end"],
        )
    ).summary
    assert summary.compared_shipments == 12
    assert summary.monthly_saving == 483
    assert summary.has_saving is True


def test_normalize_says_usd_will_be_converted() -> None:
    raw = RawInvoice.model_validate(
        {
            "carrier_name": "Oryx Express Inc.", "customer_name": "Test Co", "invoice_number": "1",
            "invoice_date": None, "period_start": None, "period_end": None, "currency": "usd",
            "notes": [], "shipments": [],
        }
    )  # fmt: skip
    warnings = " ".join(normalize_invoice(raw).warnings)
    assert "converted at 3.6725 AED per USD" in warnings
