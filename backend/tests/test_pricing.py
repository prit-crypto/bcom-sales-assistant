from app.services.pricing.calculator import NotEligible, Quote, quote_shipment, round_up_to_half_kg
from app.services.pricing.comparison import compare_invoice, get_monthly_factor, get_period_days
from tests.conftest import make_invoice, make_shipment


def test_round_up_to_half_kg() -> None:
    assert round_up_to_half_kg(0.2) == 0.5
    assert round_up_to_half_kg(1.5) == 1.5
    assert round_up_to_half_kg(1.51) == 2


def test_prices_a_gcc_express_shipment_per_half_kilo() -> None:
    # Z2 express: 62 for the first 0.5 kg + 3 x 11 for the next 1.5 kg
    quote = quote_shipment(
        origin_country="AE", destination_country="SA", weight_kg=2, service="express"
    )
    assert quote == Quote(
        zone="Z2", service="express", billed_weight_kg=2, price=95, transit_time="1–2 days"
    )


def test_uses_the_per_kg_rate_above_30_kg() -> None:
    # Z4 economy at 30 kg: 82 + 59 x 15 = 967; 32.2 kg bills as 33 kg -> +3 x 25
    quote = quote_shipment(
        origin_country="AE", destination_country="GB", weight_kg=32.2, service="economy"
    )
    assert isinstance(quote, Quote)
    assert quote.price == 1042


def test_rejects_imports_unknown_destinations_and_heavy_shipments() -> None:
    for origin, destination, weight in (("CN", "AE", 1), ("AE", "BR", 1), ("AE", "SA", 85)):
        quote = quote_shipment(
            origin_country=origin,
            destination_country=destination,
            weight_kg=weight,
            service="express",
        )
        assert isinstance(quote, NotEligible)


def test_monthly_factor_treats_25_to_35_days_as_one_month() -> None:
    assert get_monthly_factor(31) == 1
    assert get_monthly_factor(None) == 1
    assert get_monthly_factor(15) == 2


def test_adds_up_savings_only_for_compared_shipments() -> None:
    result = compare_invoice(
        make_invoice(
            [
                make_shipment(id="a", charge=120),  # BCOM 95 -> saves 25
                make_shipment(id="b", weight_kg=None),  # missing weight
                make_shipment(id="c", destination_country="BR", charge=300),  # not on card
                make_shipment(id="d", included=False),  # excluded
                # Z1 express 2 kg: 18 + 3 x 2.5 = 25.5 -> costs 5.5 more than the current 20
                make_shipment(
                    id="e", destination_country="AE", destination_city="Abu Dhabi", charge=20
                ),
            ]
        )
    )
    summary = result.summary
    assert summary.status_counts.model_dump() == {
        "compared": 2, "missing_data": 1, "not_eligible": 1, "excluded": 1,
    }  # fmt: skip
    assert summary.current_spend == 140
    assert summary.proposed_spend == 120.5
    assert summary.saving == 19.5
    assert summary.higher_priced_shipments == 1
    assert summary.shipment_coverage_pct == 40
    # Monthly saving 19.5 rounds up to 20; yearly is exactly 12 x the shown monthly figure.
    assert summary.monthly_saving == 20
    assert summary.yearly_saving == 240
    assert summary.has_saving is True
    assert result.rows[1].missing_fields == ["weight_kg"]
    assert result.rows[0].zone_label == "GCC"
    assert result.rows[0].service_label == "BCOM Express"


def test_does_not_compare_invoices_in_a_currency_without_a_rate() -> None:
    result = compare_invoice(make_invoice([make_shipment()], currency="EUR"))
    assert result.summary.compared_shipments == 0
    assert result.rows[0].status == "not_eligible"
    assert result.summary.has_saving is False


# --- Fix: a negative saving must never be presented as a saving -------------------------------


def test_marks_no_saving_when_bcom_costs_more() -> None:
    # Two UAE domestic shipments: BCOM charges 18 for 1 kg, the current courier 15.
    shipments = [
        make_shipment(
            id=shipment_id,
            destination_country="AE",
            destination_city="Sharjah",
            weight_kg=1,
            charge=15,
        )
        for shipment_id in ("a", "b")
    ]
    summary = compare_invoice(make_invoice(shipments)).summary
    assert summary.monthly_saving < 0
    assert summary.has_saving is False


# --- Fix: an unknown billing period must not inflate the monthly saving -----------------------


def test_unknown_period_is_one_month_even_when_shipments_share_a_day() -> None:
    shipments = [
        make_shipment(id="a", destination_country="GB", weight_kg=1, charge=200, date="2026-10-02"),
        make_shipment(id="b", destination_country="GB", weight_kg=1, charge=200, date="2026-10-02"),
    ]
    summary = compare_invoice(make_invoice(shipments, period_start=None, period_end=None)).summary
    assert summary.period_days is None
    assert summary.monthly_factor == 1
    # 2 x (200 - 142) = 116 saving on the invoice -> 116 a month, not 30 x 116.
    assert summary.saving == 116
    assert summary.monthly_saving == 116
    assert summary.yearly_saving == 1392
    assert any("billing period is not on the invoice" in text for text in summary.assumptions)


def test_period_comes_only_from_the_billing_period() -> None:
    invoice = make_invoice([make_shipment()], period_start="2026-10-01", period_end="2026-10-15")
    assert get_period_days(invoice) == 15
    assert get_period_days(make_invoice([make_shipment()], period_start=None)) is None
    # An end before the start is not a period.
    assert get_period_days(make_invoice([make_shipment()], period_end="2026-09-01")) is None
