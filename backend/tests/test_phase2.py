"""Phase 2: checks, uncertain fields, back-up reader, privacy, spreadsheets, what-if, partner extras, Arabic."""

import asyncio
import base64
import hashlib
import io
import json
import logging
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from pydantic import ValidationError

from app.clients.ai.fallback import FallbackProvider
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.schemas.api import PartnerInput, ProviderInfo
from app.schemas.comparison import Scenario
from app.schemas.raw_invoice import RawInvoice, RawShipment
from app.services.invoice.checks import check_invoice
from app.services.invoice.normalize import normalize_invoice
from app.services.invoice.spreadsheet import parse_spreadsheet
from app.services.invoice.upload import XLSX, InvoiceFile, detect_mime_type
from app.services.pricing.comparison import compare_invoice
from app.services.proposal.render import render_proposal_html
from app.services.whatsapp import build_sales_message_facts, render_template_message
from tests.conftest import FIXTURES, make_invoice, make_shipment, sample_pdf
from tests.test_mock_parser import read_sample

TEMPLATE = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "public"
    / "templates"
    / "bcom-shipments-template.csv"
)
PARTNER = {
    "partner_name": "Rahul",
    "partner_company": "BCOM Sharjah",
    "prospect_name": "Test Co",
    "validity_days": 30,
}


def sample_one_invoice() -> Any:
    expected = {
        item["file_stem"]: item
        for item in json.loads((FIXTURES / "expected_samples.json").read_text())
    }
    sample = expected["sample-1-al-noor-mobile"]
    shipments = [
        make_shipment(
            id=f"s{i}", date=row["date"], reference=row["awb"], origin_country=row["origin_country"],
            destination_city=row["destination_city"], destination_country=row["destination_country"],
            weight_kg=row["weight_kg"], service=row["service"], charge=row["amount"],
        )
        for i, row in enumerate(sample["rows"])
    ]  # fmt: skip
    return make_invoice(
        shipments, period_start=sample["period_start"], period_end=sample["period_end"]
    )


# --- 1. Totals and outliers ---------------------------------------------------------------------


@pytest.mark.parametrize("stem", ["sample-1-al-noor-mobile", "sample-2-gulf-spice"])
def test_sample_subtotals_are_read_and_match(stem: str) -> None:
    invoice = read_sample(stem)
    assert invoice.printed_subtotal is not None
    assert check_invoice(invoice) == []


def test_total_mismatch_when_a_charge_is_misread() -> None:
    invoice = read_sample("sample-1-al-noor-mobile")
    invoice.shipments[0].charge = (invoice.shipments[0].charge or 0) + 100
    checks = check_invoice(invoice)
    assert [c.kind for c in checks] == ["total_mismatch"]
    assert "subtotal says" in checks[0].message


def test_duplicate_weight_and_charge_outliers() -> None:
    shipments = [
        make_shipment(id=f"s{i}", reference=f"W{i}", weight_kg=2, charge=120) for i in range(6)
    ]
    shipments[1].reference = "W0"
    shipments[2].weight_kg = 200  # 100x the typical weight
    shipments[3].charge = 2000  # 1000 per kg against a typical 60
    kinds = sorted(c.kind for c in check_invoice(make_invoice(shipments)))
    assert kinds == ["charge_outlier", "charge_outlier", "duplicate_waybill", "weight_outlier"]


def test_check_endpoint_and_checks_in_comparison(client: TestClient) -> None:
    invoice = make_invoice(
        [make_shipment(id="a", reference="X"), make_shipment(id="b", reference="X")]
    )
    body = {"invoice": invoice.model_dump()}
    assert (
        client.post("/api/v1/invoices/check", json=body).json()["checks"][0]["kind"]
        == "duplicate_waybill"
    )
    summary = client.post("/api/v1/comparisons", json=body).json()["summary"]
    assert summary["checks"][0]["shipment_ids"] == ["a", "b"]


# --- 2. Uncertain fields ------------------------------------------------------------------------


def test_uncertain_fields_are_normalised() -> None:
    raw = RawInvoice(
        carrier_name=None, customer_name=None, invoice_number=None, invoice_date=None, period_start=None,
        period_end=None, currency="AED", notes=[], invoice_subtotal="1,234.50",
        shipments=[RawShipment(
            date=None, reference="A", origin_city=None, origin_country="AE", destination_city=None,
            destination_country="SA", weight_kg=2, pieces=1, service="Express", charge=10,
            uncertain_fields=["Weight", "charge", "nonsense", "weight_kg"],
        )],
    )  # fmt: skip
    invoice = normalize_invoice(raw)
    assert invoice.shipments[0].uncertain_fields == ["weight_kg", "charge"]
    assert invoice.printed_subtotal == 1234.5


# --- 3. Back-up reader --------------------------------------------------------------------------


class FakeProvider:
    def __init__(self, provider_id: str, fail_with: str | None = None) -> None:
        self.info = ProviderInfo(
            id=provider_id, label=provider_id.title(), model=None, reads_images=True
        )  # type: ignore[arg-type]
        self.fail_with = fail_with
        self.calls = 0

    async def extract_invoice(self, file: InvoiceFile) -> RawInvoice:
        self.calls += 1
        if self.fail_with:
            raise AppError("nope", status_code=503, code=self.fail_with)
        return RawInvoice(
            carrier_name=None, customer_name=None, invoice_number=None, invoice_date=None,
            period_start=None, period_end=None, currency=None, shipments=[], notes=[],
        )  # fmt: skip

    async def write_sales_message(self, facts: Any) -> str:
        if self.fail_with:
            raise AppError("nope", status_code=503, code=self.fail_with)
        return f"from {self.info.id}"


def test_backup_reader_takes_over_when_busy() -> None:
    primary, backup = FakeProvider("gemini", "ai_busy"), FakeProvider("openai")
    raw = asyncio.run(
        FallbackProvider(primary, backup).extract_invoice(
            InvoiceFile(b"%PDF", "application/pdf", "x.pdf")
        )
    )
    assert backup.calls == 1
    assert "read with Openai" in raw.notes[-1]


def test_backup_reader_not_used_for_a_bad_key() -> None:
    primary, backup = FakeProvider("gemini", "ai_auth_failed"), FakeProvider("openai")
    with pytest.raises(AppError):
        asyncio.run(
            FallbackProvider(primary, backup).extract_invoice(
                InvoiceFile(b"%PDF", "application/pdf", "x.pdf")
            )
        )
    assert backup.calls == 0


def test_backup_without_a_key_is_skipped(monkeypatch: Any) -> None:
    from app.clients.ai.factory import get_ai_provider

    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("AI_FALLBACK_PROVIDER", "openai")
    get_settings.cache_clear()
    assert not isinstance(get_ai_provider(), FallbackProvider)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    get_settings.cache_clear()
    get_ai_provider.cache_clear()
    assert isinstance(get_ai_provider(), FallbackProvider)


# --- 4. Privacy and security --------------------------------------------------------------------


def test_free_tier_privacy_notice(client: TestClient, monkeypatch: Any) -> None:
    assert client.get("/api/v1/config").json()["privacy_notice"] is None
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    get_settings.cache_clear()
    assert "sample invoices only" in client.get("/api/v1/config").json()["privacy_notice"]
    monkeypatch.setenv("GEMINI_PAID_KEY", "true")
    get_settings.cache_clear()
    assert client.get("/api/v1/config").json()["privacy_notice"] is None


def test_samples_only_mode(client: TestClient, monkeypatch: Any) -> None:
    monkeypatch.setenv("ALLOW_ONLY_SAMPLE_FILES", "true")
    get_settings.cache_clear()
    sample = client.post(
        "/api/v1/invoices/extract",
        files={"file": ("s.pdf", sample_pdf("sample-1-al-noor-mobile"), "application/pdf")},
    )
    assert sample.status_code == 200
    other = client.post(
        "/api/v1/invoices/extract", files={"file": ("s.pdf", b"%PDF-1.4 other", "application/pdf")}
    )
    assert other.status_code == 403
    assert other.json()["error"]["code"] == "samples_only"
    assert client.get("/api/v1/config").json()["samples_only"] is True


def test_sample_hash_list_matches_the_samples() -> None:
    listed = json.loads(
        (Path(__file__).resolve().parents[1] / "app" / "assets" / "sample_hashes.json").read_text()
    )
    for path in (FIXTURES / "samples").iterdir():
        assert listed[path.name] == hashlib.sha256(path.read_bytes()).hexdigest(), (
            f"run scripts/write_sample_hashes.py ({path.name})"
        )


def test_reading_never_logs_customer_data(client: TestClient, caplog: Any) -> None:
    caplog.set_level(logging.INFO)
    client.post(
        "/api/v1/invoices/extract",
        files={"file": ("s.pdf", sample_pdf("sample-2-gulf-spice"), "application/pdf")},
    )
    logged = caplog.text
    assert "Gulf Spice" not in logged
    assert "273.00" not in logged and "538.08" not in logged


def test_api_security_headers(client: TestClient) -> None:
    headers = client.get("/api/v1/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"


# --- 5. Spreadsheets ----------------------------------------------------------------------------


def test_csv_template_round_trip(client: TestClient) -> None:
    response = client.post(
        "/api/v1/invoices/extract",
        files={"file": ("statement.csv", TEMPLATE.read_bytes(), "text/csv")},
    )
    assert response.status_code == 200
    invoice = response.json()["invoice"]
    assert invoice["currency"] == "AED"
    first = invoice["shipments"][0]
    assert first["date"] == "2026-10-02"  # day first
    assert (first["origin_country"], first["destination_city"], first["destination_country"]) == (
        "AE",
        "Riyadh",
        "SA",
    )
    assert (first["weight_kg"], first["service"], first["charge"]) == (2.5, "express", 145.0)


def test_xlsx_with_other_headings_and_a_total_row() -> None:
    book = Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.append(["Courier statement October"])
    sheet.append(
        [
            "Ship date",
            "Tracking number",
            "From country",
            "To city",
            "To country",
            "Product",
            "Chargeable weight",
            "Net amount",
        ]
    )
    sheet.append(["2026-10-05", "T1", "AE", "Doha", "QA", "Economy Select", 4, 99.5])
    sheet.append([None, None, None, None, None, None, None, 99.5])  # total row
    buffer = io.BytesIO()
    book.save(buffer)
    data = buffer.getvalue()
    assert detect_mime_type(data, "s.xlsx") == XLSX
    raw = parse_spreadsheet(InvoiceFile(data, XLSX, "s.xlsx"))
    assert len(raw.shipments) == 1
    assert raw.shipments[0].destination_country == "QA"


def test_spreadsheet_missing_columns_explained() -> None:
    data = b"Date,Reference,Notes\n2026-10-01,A,hello\n"
    with pytest.raises(AppError) as error:
        parse_spreadsheet(InvoiceFile(data, "text/csv", "s.csv"))
    assert error.value.code == "spreadsheet_columns_missing"
    assert "weight" in error.value.message


def test_excel_export_opens(client: TestClient) -> None:
    body = {
        "invoice": sample_one_invoice().model_dump(),
        "scenario": {"economy_for_non_urgent": True},
    }
    response = client.post("/api/v1/exports/comparison", json=body)
    assert response.status_code == 200
    assert "BCOM-comparison-Test-Co.xlsx" in response.headers["content-disposition"]
    book = load_workbook(io.BytesIO(response.content))
    assert book.sheetnames == ["Summary", "Shipments", "By region", "By route"]
    shipments = book["Shipments"]
    assert shipments.max_row == 47  # header + 46 shipments


# --- 6. What-if ---------------------------------------------------------------------------------


def test_what_if_numbers_for_sample_one() -> None:
    invoice = sample_one_invoice()
    base = compare_invoice(invoice).summary
    economy = compare_invoice(invoice, scenario=Scenario(economy_for_non_urgent=True)).summary
    volume = compare_invoice(invoice, scenario=Scenario(volume_factor=1.2)).summary
    assert (base.monthly_saving, economy.monthly_saving, economy.like_for_like_monthly_saving) == (
        1854,
        3916,
        1854,
    )
    assert sum(t.shipments for t in economy.transit_tradeoffs) == 28
    assert volume.monthly_saving == 2224 and volume.like_for_like_monthly_saving == 2224
    assert any("What if" in line for line in economy.assumptions)


def test_scenario_rejects_other_volumes(client: TestClient) -> None:
    body = {"invoice": sample_one_invoice().model_dump(), "scenario": {"volume_factor": 3}}
    assert client.post("/api/v1/comparisons", json=body).status_code == 422


# --- 7–9. Logo, Arabic, booking link ------------------------------------------------------------


def logo_data_url() -> str:
    data = (
        Path(__file__).resolve().parents[1] / "app" / "assets" / "bcom-global-logo.png"
    ).read_bytes()
    return "data:image/png;base64," + base64.b64encode(data).decode()


def test_logo_validation() -> None:
    PartnerInput(**PARTNER, partner_logo=logo_data_url())
    fake_png = "data:image/png;base64," + base64.b64encode(b"\xff\xd8\xff not a png").decode()
    with pytest.raises(ValidationError):
        PartnerInput(**PARTNER, partner_logo=fake_png)
    with pytest.raises(ValidationError):
        PartnerInput(**PARTNER, partner_logo="data:image/svg+xml;base64,PHN2Zz4=")


def test_booking_link_must_be_https() -> None:
    assert PartnerInput(**PARTNER, booking_url="https://cal.example.com/x").booking_url
    with pytest.raises(ValidationError):
        PartnerInput(**PARTNER, booking_url="javascript:alert(1)")


def test_arabic_proposal_html_is_right_to_left() -> None:
    from datetime import date

    invoice = sample_one_invoice()
    partner = PartnerInput(
        **PARTNER,
        language="ar",
        booking_url="https://cal.example.com/x",
        partner_logo=logo_data_url(),
    )
    comparison = compare_invoice(invoice, scenario=Scenario(economy_for_non_urgent=True))
    html, _ = render_proposal_html(invoice, partner, comparison, date(2026, 11, 20))
    assert 'dir="rtl"' in html and 'lang="ar"' in html
    assert "وفّر حوالي" in html and "الشروط التجارية" in html and "نوفمبر" in html
    assert "https://cal.example.com/x" in html and "data:image/png;base64," in html
    assert "<bdi>BCOM Sharjah</bdi>" in html


def test_arabic_pdf_and_message_endpoints(client: TestClient) -> None:
    body = {
        "invoice": sample_one_invoice().model_dump(),
        "partner": {**PARTNER, "language": "ar", "booking_url": "https://cal.example.com/x"},
    }
    pdf = client.post("/api/v1/proposals/render", json=body)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert "-ar.pdf" in pdf.headers["content-disposition"]
    message = client.post("/api/v1/messages", json=body).json()["message"]
    assert message.startswith("مرحباً فريق Test Co")
    assert "https://cal.example.com/x" in message


def test_message_mentions_both_what_if_options() -> None:
    summary = compare_invoice(
        sample_one_invoice(), scenario=Scenario(economy_for_non_urgent=True)
    ).summary
    message = render_template_message(build_sales_message_facts(summary, PartnerInput(**PARTNER)))
    assert "AED 1,854" in message and "AED 3,916" in message and "Economy" in message
