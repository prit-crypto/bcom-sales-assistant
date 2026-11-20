from typing import Any

from fastapi.testclient import TestClient

from app.clients.ai.factory import get_ai_provider
from app.core.config import get_settings
from tests.conftest import sample_pdf

PDF = ("sample-1.pdf", sample_pdf("sample-1-al-noor-mobile"), "application/pdf")


def test_request_id_is_echoed_or_created(client: TestClient) -> None:
    given = client.get("/api/v1/health", headers={"X-Request-ID": "demo-request-123"})
    assert given.headers["x-request-id"] == "demo-request-123"
    created = client.get("/api/v1/health", headers={"X-Request-ID": "bad id with spaces"})
    assert len(created.headers["x-request-id"]) == 32


def test_oversized_request_is_refused_before_reading(monkeypatch: Any) -> None:
    monkeypatch.setenv("MAX_UPLOAD_MB", "0.01")
    get_settings.cache_clear()
    from app.main import create_app

    client = TestClient(create_app())
    response = client.post(
        "/api/v1/invoices/extract",
        content=b"x" * (2 * 1024 * 1024),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request_too_large"


def test_same_file_twice_is_read_once(client: TestClient, monkeypatch: Any) -> None:
    provider = get_ai_provider()
    calls = 0
    original = provider.extract_invoice

    async def counting(file: Any) -> Any:
        nonlocal calls
        calls += 1
        return await original(file)

    monkeypatch.setattr(provider, "extract_invoice", counting)
    first = client.post("/api/v1/invoices/extract", files={"file": PDF})
    second = client.post("/api/v1/invoices/extract", files={"file": PDF})
    assert first.headers["x-cache"] == "miss"
    assert second.headers["x-cache"] == "hit"
    assert calls == 1
    assert first.json() == second.json()


def test_cache_can_be_turned_off(client: TestClient, monkeypatch: Any) -> None:
    monkeypatch.setenv("EXTRACT_CACHE_SIZE", "0")
    get_settings.cache_clear()
    client.post("/api/v1/invoices/extract", files={"file": PDF})
    again = client.post("/api/v1/invoices/extract", files={"file": PDF})
    assert again.headers["x-cache"] == "miss"


def test_rate_limit_on_reading(client: TestClient, monkeypatch: Any) -> None:
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "2")
    get_settings.cache_clear()
    for _ in range(2):
        assert client.post("/api/v1/invoices/extract", files={"file": PDF}).status_code == 200
    limited = client.post("/api/v1/invoices/extract", files={"file": PDF})
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    # Other endpoints are not limited.
    assert client.get("/api/v1/health").status_code == 200


def test_rate_limit_can_be_turned_off(client: TestClient, monkeypatch: Any) -> None:
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "0")
    get_settings.cache_clear()
    for _ in range(5):
        assert client.post("/api/v1/invoices/extract", files={"file": PDF}).status_code == 200
