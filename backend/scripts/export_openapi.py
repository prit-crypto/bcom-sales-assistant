"""Writes the API's OpenAPI description to frontend/openapi/openapi.json (committed, like apollo-frontend).

    make openapi

The frontend generates its TypeScript types from that file (`npm run generate:api`), and a backend
test fails if the file is out of date, so a renamed field can't silently break the screens.
"""

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

TARGET = ROOT.parent / "frontend" / "openapi" / "openapi.json"


def openapi_document() -> dict[str, Any]:
    from app.main import create_app

    document: dict[str, Any] = create_app().openapi()
    return document


def render(document: dict[str, Any]) -> str:
    return json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(render(openapi_document()))
    print(f"wrote {TARGET.relative_to(ROOT.parent)}")


if __name__ == "__main__":
    main()
