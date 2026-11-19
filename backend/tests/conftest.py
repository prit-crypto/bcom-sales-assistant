import json
import os
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

# Tests always run in mock mode, whatever is in a developer's .env.
os.environ["AI_PROVIDER"] = "mock"
os.environ["GEMINI_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""

from app.clients.ai.factory import get_ai_provider  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.schemas.invoice import InvoiceData, Shipment  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _fresh_settings() -> Iterator[None]:
    get_settings.cache_clear()
    get_ai_provider.cache_clear()
    yield
    get_settings.cache_clear()
    get_ai_provider.cache_clear()


@pytest.fixture
def client() -> TestClient:
    from app.main import create_app

    return TestClient(create_app())


@pytest.fixture
def expected_samples() -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads((FIXTURES / "expected_samples.json").read_text())
    return data


def sample_pdf(file_stem: str) -> bytes:
    return (FIXTURES / "samples" / f"{file_stem}.pdf").read_bytes()


def make_shipment(**overrides: Any) -> Shipment:
    values: dict[str, Any] = {
        "id": "s1",
        "date": "2026-10-02",
        "reference": "SWL1",
        "origin_city": "Dubai",
        "origin_country": "AE",
        "destination_city": "Riyadh",
        "destination_country": "SA",
        "weight_kg": 2,
        "pieces": 1,
        "service": "express",
        "charge": 120,
        "included": True,
    }
    values.update(overrides)
    return Shipment(**values)


def make_invoice(shipments: list[Shipment], **overrides: Any) -> InvoiceData:
    values: dict[str, Any] = {
        "carrier_name": "SwiftLine Express",
        "customer_name": "Test Co",
        "invoice_number": "INV-1",
        "invoice_date": "2026-11-01",
        "period_start": "2026-10-01",
        "period_end": "2026-10-31",
        "currency": "AED",
        "shipments": shipments,
        "warnings": [],
    }
    values.update(overrides)
    return InvoiceData(**values)


ShipmentFactory = Callable[..., Shipment]
