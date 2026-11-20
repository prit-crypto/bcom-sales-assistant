import asyncio
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
# A separate, throwaway database (created by docker/postgres/create-test-db.sql); override in CI.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://bcom:bcom@localhost:5440/bcom_test"
)
os.environ["DATABASE_NULL_POOL"] = "true"

from app.clients.ai.factory import get_ai_provider  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.db.session import get_engine, get_sessionmaker  # noqa: E402
from app.schemas.invoice import InvoiceData, Shipment  # noqa: E402
from app.services.invoice.cache import extraction_cache  # noqa: E402
from app.services.invoice.timing import read_times  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _fresh_settings() -> Iterator[None]:
    def reset() -> None:
        get_settings.cache_clear()
        get_ai_provider.cache_clear()
        limiter.reset()
        extraction_cache.clear()
        read_times.clear()
        get_engine.cache_clear()
        get_sessionmaker.cache_clear()

    reset()
    yield
    reset()


BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def _migrated() -> None:
    """Brings the test database to the latest migration once per run."""
    from alembic.config import Config

    from alembic import command

    command.upgrade(Config(str(BACKEND / "alembic.ini")), "head")


def _truncate() -> None:
    from sqlalchemy import text

    async def run() -> None:
        async with get_engine().begin() as connection:
            await connection.execute(
                text(
                    "TRUNCATE proposals, proposal_events, reading_corrections RESTART IDENTITY CASCADE"
                )
            )

    asyncio.run(run())


@pytest.fixture
def clean_db(_migrated: None) -> None:
    """An empty database for this test."""
    _truncate()


@pytest.fixture
def client(clean_db: None) -> TestClient:
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
