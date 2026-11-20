from typing import Any

from fastapi.testclient import TestClient

from app.core.config import get_settings
from tests.conftest import make_invoice, make_shipment, sample_pdf

PARTNER = {
    "partner_name": "Rahul Mehta",
    "partner_company": "Sharjah Logistics Partners",
    "partner_phone": "+971 50 000 0000",
    "partner_email": "rahul@example.com",
    "prospect_name": "Test Co",
    "validity_days": 30,
}


def saving_invoice() -> dict[str, Any]:
    return make_invoice([make_shipment(id="a", charge=120)]).model_dump()


def losing_invoice() -> dict[str, Any]:
    shipments = [
        make_shipment(id=shipment_id, destination_country="AE", weight_kg=1, charge=15)
        for shipment_id in ("a", "b")
    ]
    return make_invoice(shipments).model_dump()


def test_health_and_config(client: TestClient) -> None:
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    config = client.get("/api/v1/config").json()
    assert config["provider"]["id"] == "mock"
    assert config["problem"] is None
    assert config["max_upload_mb"] == 10


def test_extracts_a_sample_invoice(client: TestClient) -> None:
    response = client.post(
        "/api/v1/invoices/extract",
        files={"file": ("sample-2.pdf", sample_pdf("sample-2-gulf-spice"), "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["provider"]["id"] == "mock"
    assert len(body["invoice"]["shipments"]) == 22
    assert body["invoice"]["shipments"][0]["id"] == "s1"


def test_rejects_files_that_are_not_pdfs_or_images(client: TestClient) -> None:
    response = client.post(
        "/api/v1/invoices/extract", files={"file": ("x.pdf", b"not a pdf", "application/pdf")}
    )
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "file_unsupported"


def test_rejects_a_missing_file(client: TestClient) -> None:
    response = client.post("/api/v1/invoices/extract")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "file_missing"


def test_rejects_files_over_the_size_limit(client: TestClient, monkeypatch: Any) -> None:
    monkeypatch.setenv("MAX_UPLOAD_MB", "0.001")
    get_settings.cache_clear()
    response = client.post(
        "/api/v1/invoices/extract",
        files={"file": ("big.pdf", b"%PDF" + b"0" * 5000, "application/pdf")},
    )
    assert response.status_code == 413


def test_compares_a_reviewed_invoice(client: TestClient) -> None:
    response = client.post("/api/v1/comparisons", json={"invoice": saving_invoice()})
    assert response.status_code == 200
    summary = response.json()["summary"]
    assert summary["monthly_saving"] == 25
    assert summary["has_saving"] is True


def test_invalid_request_uses_the_error_envelope(client: TestClient) -> None:
    response = client.post("/api/v1/comparisons", json={"invoice": {"shipments": "nope"}})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_half_typed_country_codes_count_as_missing(client: TestClient) -> None:
    invoice = saving_invoice()
    invoice["shipments"][0]["destination_country"] = "S"
    response = client.post("/api/v1/comparisons", json={"invoice": invoice})
    assert response.json()["rows"][0]["status"] == "missing_data"


def test_creates_the_proposal_pdf(client: TestClient) -> None:
    response = client.post(
        "/api/v1/proposals", json={"invoice": saving_invoice(), "partner": PARTNER}
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert 'filename="BCOM-P-' in response.headers["content-disposition"]


def test_creates_the_template_message(client: TestClient) -> None:
    response = client.post(
        "/api/v1/messages", json={"invoice": saving_invoice(), "partner": PARTNER}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "template"
    assert "AED 25 every month" in body["message"]


def test_refuses_a_proposal_or_message_when_bcom_costs_more(client: TestClient) -> None:
    for path in ("/api/v1/proposals", "/api/v1/messages"):
        response = client.post(path, json={"invoice": losing_invoice(), "partner": PARTNER})
        assert response.status_code == 422, path
        assert response.json()["error"]["code"] == "no_saving"


def test_refuses_a_proposal_when_nothing_could_be_compared(client: TestClient) -> None:
    invoice = make_invoice([make_shipment(weight_kg=None)]).model_dump()
    response = client.post("/api/v1/proposals", json={"invoice": invoice, "partner": PARTNER})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "nothing_to_propose"


def test_partner_details_are_required(client: TestClient) -> None:
    partner = {**PARTNER, "partner_name": "   "}
    response = client.post(
        "/api/v1/proposals", json={"invoice": saving_invoice(), "partner": partner}
    )
    assert response.status_code == 422


def test_blank_text_fields_are_accepted(client: TestClient) -> None:
    """Regression: a reader returning no city, invoice number or customer must not crash the request."""
    invoice = make_invoice(
        [
            make_shipment(
                origin_city=None, destination_city=None, reference=None, origin_country=None
            )
        ],
        invoice_number=None,
        customer_name=None,
        carrier_name=None,
    )
    response = client.post("/api/v1/comparisons", json={"invoice": invoice.model_dump()})
    assert response.status_code == 200
    assert response.json()["rows"][0]["status"] == "missing_data"
