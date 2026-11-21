"""The saving is told honestly on the customer page, PDF and email: what it is based on, with real examples."""

from datetime import date
from typing import Any

from fastapi.testclient import TestClient

from app.schemas.api import PartnerInput
from app.services.pricing.comparison import compare_invoice
from app.services.proposal.examples import saving_examples
from app.services.proposal.render import render_proposal_html
from tests.conftest import make_invoice, make_shipment

PARTNER = PartnerInput(
    partner_name="Rahul Mehta",
    partner_company="Sharjah Logistics Partners",
    prospect_name="Test Co",
    validity_days=30,
)


def invoice(**overrides: Any) -> Any:
    shipments = [
        make_shipment(id="a", charge=120, destination_city="Riyadh"),
        make_shipment(
            id="b", charge=300, weight_kg=4, destination_country="GB", destination_city="London"
        ),
        make_shipment(id="c", charge=None),
    ]
    return make_invoice(shipments, **overrides)


def test_examples_pick_the_biggest_savings_on_different_routes() -> None:
    inv = invoice()
    comparison = compare_invoice(inv)
    examples = saving_examples(inv, comparison, "en")
    best = max((r for r in comparison.rows if r.saving), key=lambda r: r.saving or 0)
    assert examples[0].saving == best.saving
    assert all(e.saving > 0 for e in examples)
    assert len({e.route for e in examples}) == len(examples)
    assert "kg" in examples[0].detail


def test_pdf_shows_examples_from_the_invoice() -> None:
    inv = invoice()
    html, _ = render_proposal_html(inv, PARTNER, compare_invoice(inv), date(2026, 11, 20))
    assert "From your own invoice" in html


def test_customer_view_says_what_the_saving_is_based_on(client: TestClient) -> None:
    created = client.post(
        "/api/v1/proposals",
        json={
            "invoice": invoice().model_dump(mode="json"),
            "partner": PARTNER.model_dump(mode="json"),
        },
    ).json()
    token = client.post(f"/api/v1/proposals/{created['id']}/share").json()["token"]
    view = client.get(f"/api/v1/public/proposals/{token}").json()
    assert (view["compared_shipments"], view["total_shipments"]) == (2, 3)
    assert view["period"] == "01 Oct 2026 – 31 Oct 2026"
    assert view["examples"] and view["examples"][0]["saving"] > 0

    draft = client.get(f"/api/v1/proposals/{created['id']}/email-draft").json()
    assert (
        "estimate based on 2 of the 3 shipments on your invoice from 01 Oct 2026 – 31 Oct 2026"
        in draft["message"]
    )
