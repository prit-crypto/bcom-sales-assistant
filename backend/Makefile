VENV := .venv/bin

init:  ## one-time setup: virtualenv + dev dependencies
	uv venv --python 3.12 .venv
	uv pip install -e ".[dev]" --python $(VENV)/python

run:  ## development server on http://localhost:8000 (docs at /docs)
	$(VENV)/uvicorn app.main:app --reload --port 8000

lint:
	$(VENV)/ruff check app tests
	$(VENV)/ruff format --check app tests

fmt:
	$(VENV)/ruff format app tests
	$(VENV)/ruff check --fix app tests

typecheck:
	$(VENV)/mypy app

test:
	$(VENV)/pytest -q

check: lint typecheck test

.PHONY: init run lint fmt typecheck test check
