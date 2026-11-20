VENV := .venv/bin

init:  ## one-time setup: virtualenv + dev dependencies
	uv venv --python 3.12 .venv
	uv pip install -e ".[dev]" --python $(VENV)/python

run:  ## development server on http://localhost:8000 (docs at /docs)
	$(VENV)/uvicorn app.main:app --reload --port 8000

lint:
	$(VENV)/ruff check app tests scripts
	$(VENV)/ruff format --check app tests scripts

fmt:
	$(VENV)/ruff format app tests scripts
	$(VENV)/ruff check --fix app tests scripts

typecheck:
	$(VENV)/mypy app scripts

test:
	$(VENV)/pytest -q

openapi:  ## refresh frontend/openapi/openapi.json after changing the API
	$(VENV)/python scripts/export_openapi.py

eval:  ## reading accuracy of the active AI provider on all sample invoices (needs an API key)
	$(VENV)/python scripts/eval_extraction.py

check: lint typecheck test

.PHONY: init run lint fmt typecheck test openapi eval check
