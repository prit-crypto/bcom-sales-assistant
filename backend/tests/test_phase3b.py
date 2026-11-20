"""Phase 3b: several months in one proposal, live reading progress."""

import json
from typing import Any

from fastapi.testclient import TestClient

from app.schemas.invoice import InvoiceData
from app.services.invoice.timing import ReadTimes
from tests.conftest import make_invoice, make_shipment, sample_pdf

COMBINE = "/api/v1/invoices/combine"


def month(start: str, end: str, **overrides: Any) -> dict[str, Any]:
    overrides.setdefault("printed_subtotal", 150)
    invoice = make_invoice(
        [make_shipment(id="s1", charge=100), make_shipment(id="s2", charge=50)],
        period_start=start,
        period_end=end,
        **overrides,
    )
    return invoice.model_dump(mode="json")


def test_combines_months_in_order(client: TestClient) -> None:
    november = month("2026-11-01", "2026-11-30", invoice_number="INV-11")
    october = month(
        "2026-10-01", "2026-10-31", invoice_number="INV-10", warnings=["One weight unclear"]
    )
    response = client.post(COMBINE, json={"invoices": [november, october]})
    assert response.status_code == 200, response.text
    combined = InvoiceData.model_validate(response.json())
    assert combined.period_start == "2026-10-01" and combined.period_end == "2026-11-30"
    assert [s.id for s in combined.shipments] == ["m1-s1", "m1-s2", "m2-s1", "m2-s2"]
    assert combined.invoice_number == "INV-10 + INV-11"
    assert combined.printed_subtotal == 300
    assert combined.warnings == ["Month 1: One weight unclear"]

    # Two months of shipments over two months: the monthly figure is the average, not the total.
    summary = client.post("/api/v1/comparisons", json={"invoice": response.json()}).json()[
        "summary"
    ]
    single = client.post("/api/v1/comparisons", json={"invoice": october}).json()["summary"]
    assert abs(summary["monthly_current"] - single["monthly_current"]) < 6


def test_refuses_overlapping_months(client: TestClient) -> None:
    response = client.post(
        COMBINE,
        json={"invoices": [month("2026-10-01", "2026-10-31"), month("2026-10-15", "2026-11-14")]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "combine_overlap"
    assert "cover the same dates" in response.json()["error"]["message"]


def test_refuses_a_missing_period_or_mixed_currencies(client: TestClient) -> None:
    no_period = make_invoice([make_shipment()], period_start=None, period_end=None).model_dump(
        mode="json"
    )
    response = client.post(
        COMBINE, json={"invoices": [month("2026-10-01", "2026-10-31"), no_period]}
    )
    assert response.json()["error"]["code"] == "combine_period_missing"

    usd = month("2026-11-01", "2026-11-30", currency="USD")
    response = client.post(COMBINE, json={"invoices": [month("2026-10-01", "2026-10-31"), usd]})
    assert response.json()["error"]["code"] == "combine_currency"

    one = client.post(COMBINE, json={"invoices": [month("2026-10-01", "2026-10-31")]})
    assert one.status_code == 422


def test_warns_about_gaps_names_and_drops_the_subtotal_when_one_is_missing(
    client: TestClient,
) -> None:
    october = month("2026-10-01", "2026-10-31")
    december = month("2026-12-01", "2026-12-31", customer_name="Other Co", printed_subtotal=None)
    combined = client.post(COMBINE, json={"invoices": [october, december]}).json()
    assert any("30 days between" in w for w in combined["warnings"])
    assert any("different customers" in w for w in combined["warnings"])
    assert combined["printed_subtotal"] is None


def test_two_real_samples_from_the_same_month_are_refused(client: TestClient) -> None:
    invoices = []
    for stem in ("sample-1-al-noor-mobile", "sample-2-gulf-spice"):
        read = client.post(
            "/api/v1/invoices/extract",
            files={"file": (f"{stem}.pdf", sample_pdf(stem), "application/pdf")},
        )
        invoices.append(read.json()["invoice"])
    response = client.post(COMBINE, json={"invoices": invoices})
    assert response.json()["error"]["code"] == "combine_overlap"


def events(text: str) -> list[tuple[str, dict[str, Any]]]:
    parsed = []
    for block in text.split("\n\n"):
        lines = [line for line in block.splitlines() if not line.startswith(":")]
        if not lines:
            continue
        name = lines[0].removeprefix("event: ")
        data = json.loads(lines[1].removeprefix("data: "))
        parsed.append((name, data))
    return parsed


def test_stream_reports_each_stage_then_the_invoice(client: TestClient) -> None:
    response = client.post(
        "/api/v1/invoices/extract/stream",
        files={"file": ("sample-1.pdf", sample_pdf("sample-1-al-noor-mobile"), "application/pdf")},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    parsed = events(response.text)
    stages = [data["stage"] for name, data in parsed if name == "stage"]
    assert stages == ["received", "checked", "reading", "cleaning", "checking"]
    reading = next(data for name, data in parsed if name == "stage" and data["stage"] == "reading")
    assert reading["label"].endswith("is reading the invoice")
    name, done = parsed[-1]
    assert name == "done"
    assert len(done["invoice"]["shipments"]) == 46

    # The second read comes from the cache, and the timing is known.
    again = events(
        client.post(
            "/api/v1/invoices/extract/stream",
            files={
                "file": ("sample-1.pdf", sample_pdf("sample-1-al-noor-mobile"), "application/pdf")
            },
        ).text
    )
    assert any(d.get("label", "").startswith("Read before") for _, d in again)


def test_stream_reports_reading_errors_as_an_event(client: TestClient) -> None:
    photo = (b"\xff\xd8\xff\xe0" + b"0" * 100, "image/jpeg")
    response = client.post(
        "/api/v1/invoices/extract/stream", files={"file": ("photo.jpg", photo[0], photo[1])}
    )
    parsed = events(response.text)
    assert parsed[-1][0] == "error"
    assert parsed[-1][1]["code"]


def test_stream_refuses_a_bad_file_before_streaming(client: TestClient) -> None:
    response = client.post(
        "/api/v1/invoices/extract/stream",
        files={"file": ("x.pdf", b"not a pdf", "application/pdf")},
    )
    assert response.status_code == 415


def test_read_times_average_recent_reads() -> None:
    times = ReadTimes()
    key = times.key("gemini", "flash")
    assert times.typical(key) is None
    for seconds in (4.2, 6.1, 5.0):
        times.record(key, seconds)
    assert times.typical(key) == 5
    for _ in range(25):
        times.record(key, 10)
    assert times.typical(key) == 10


# --- Learning from corrections -------------------------------------------------------------------

PARTNER = {
    "partner_name": "Rahul Mehta",
    "partner_company": "Sharjah Logistics Partners",
    "prospect_name": "Test Co",
    "validity_days": 30,
}


def read_and_fix(
    weight: float = 12, courier: str = "SwiftLine Express"
) -> tuple[dict[str, Any], dict[str, Any]]:
    original = make_invoice(
        [make_shipment(id="s1", weight_kg=120), make_shipment(id="s2", charge=80)],
        carrier_name=courier,
    )
    fixed = original.model_copy(deep=True)
    fixed.shipments[0].weight_kg = weight
    return original.model_dump(mode="json"), fixed.model_dump(mode="json")


def save(
    client: TestClient, original: dict[str, Any], fixed: dict[str, Any], provider: str = "gemini"
) -> str:
    response = client.post(
        "/api/v1/proposals",
        json={
            "invoice": fixed,
            "partner": PARTNER,
            "original_invoice": original,
            "reader": {"provider": provider, "model": "gemini-x"},
            "source_files": ["oct.pdf", "nov.pdf"],
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["source_files"] == ["oct.pdf", "nov.pdf"]
    return str(response.json()["id"])


def test_corrections_are_recorded_and_follow_later_edits(client: TestClient) -> None:
    original, fixed = read_and_fix()
    proposal_id = save(client, original, fixed)
    report = client.get("/api/v1/insights/reading").json()
    assert report["readers"] == [
        {
            "provider": "gemini",
            "model": "gemini-x",
            "readings": 1,
            "shipments": 2,
            "corrections": 1,
            "corrections_per_100_shipments": 50.0,
        }
    ]
    group = report["most_corrected"][0]
    assert (group["courier"], group["field"], group["examples"]) == (
        "SwiftLine Express",
        "weight_kg",
        ["120 → 12"],
    )

    # Undoing the fix in an autosave removes the correction.
    client.patch(f"/api/v1/proposals/{proposal_id}", json={"invoice": original})
    assert client.get("/api/v1/insights/reading").json()["most_corrected"] == []


def test_hints_need_three_ai_corrections_of_the_same_kind(client: TestClient) -> None:
    for _ in range(2):
        save(client, *read_and_fix())
    save(client, *read_and_fix(), provider="spreadsheet")  # no AI: never a lesson
    assert client.get("/api/v1/insights/reading").json()["hints"] == []

    save(client, *read_and_fix())
    hints = client.get("/api/v1/insights/reading").json()["hints"]
    assert hints == [
        "Partners often corrected the weight on SwiftLine Express invoices (3 times), e.g. 120 → 12."
    ]


def test_hints_reach_the_ai_prompt_and_the_cache_key(client: TestClient, monkeypatch: Any) -> None:
    from app.api.v1.endpoints import invoices as endpoint
    from app.clients.ai.mock import MockProvider
    from app.clients.ai.prompts import EXTRACTION_USER_PROMPT, build_extraction_user_prompt
    from app.schemas.api import ProviderInfo
    from app.schemas.raw_invoice import RawInvoice
    from app.services.invoice import extract as flow
    from app.services.invoice.cache import ExtractionCache

    for _ in range(3):
        save(client, *read_and_fix())

    seen: list[tuple[str, ...]] = []

    class FakeGemini:
        info = ProviderInfo(id="gemini", label="Gemini", model="gemini-x", reads_images=True)

        async def extract_invoice(self, file: Any) -> RawInvoice:
            seen.append(file.hints)
            return await MockProvider().extract_invoice(file)

    monkeypatch.setattr(endpoint, "get_ai_provider", FakeGemini)
    monkeypatch.setattr(flow, "get_ai_provider", FakeGemini)
    response = client.post(
        "/api/v1/invoices/extract",
        files={"file": ("x.pdf", sample_pdf("sample-1-al-noor-mobile"), "application/pdf")},
    )
    assert response.status_code == 200, response.text
    assert len(seen) == 1 and "weight" in seen[0][0]

    prompt = build_extraction_user_prompt(seen[0])
    assert prompt.startswith(EXTRACTION_USER_PROMPT) and seen[0][0] in prompt
    assert build_extraction_user_prompt(()) == EXTRACTION_USER_PROMPT
    assert ExtractionCache.key(b"x", "gemini", "m") != ExtractionCache.key(
        b"x", "gemini", "m", seen[0]
    )

    monkeypatch.setenv("READING_HINTS", "false")
    from app.core.config import get_settings

    get_settings.cache_clear()
    client.post(
        "/api/v1/invoices/extract",
        files={"file": ("y.pdf", sample_pdf("sample-2-gulf-spice"), "application/pdf")},
    )
    assert seen[-1] == ()


def test_proposals_without_a_reader_record_nothing(client: TestClient) -> None:
    original, fixed = read_and_fix()
    response = client.post("/api/v1/proposals", json={"invoice": fixed, "partner": PARTNER})
    assert response.json()["source_files"] == []
    assert client.get("/api/v1/insights/reading").json() == {
        "readers": [],
        "most_corrected": [],
        "hints": [],
    }
