"""The frontend's types are generated from frontend/openapi/openapi.json; it must match the API."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from export_openapi import TARGET, openapi_document, render  # noqa: E402


def test_frontend_openapi_snapshot_is_up_to_date() -> None:
    if not TARGET.exists():
        pytest.fail("frontend/openapi/openapi.json is missing: run `make openapi` in backend/")
    assert TARGET.read_text() == render(openapi_document()), (
        "The API changed but frontend/openapi/openapi.json did not: run `make openapi` in backend/, "
        "then `npm run generate:api` in frontend/."
    )
