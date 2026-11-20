VENV := .venv/bin

init:  ## one-time setup: virtualenv + dev dependencies
	uv venv --python 3.12 .venv
	uv pip install -e ".[dev]" --python $(VENV)/python

run:  ## development server on http://localhost:8000 (docs at /docs)
	$(VENV)/uvicorn app.main:app --reload --port 8000

db-up:  ## start PostgreSQL (port 5440) from the repository's docker-compose.yml
	docker compose -f ../docker-compose.yml up -d db

migrate:  ## bring the database to the latest migration
	$(VENV)/alembic upgrade head

revision:  ## new migration from the models: make revision m="what changed"
	$(VENV)/alembic revision --autogenerate -m "$(m)"

lint:
	$(VENV)/ruff check app tests scripts alembic
	$(VENV)/ruff format --check app tests scripts alembic

fmt:
	$(VENV)/ruff format app tests scripts alembic
	$(VENV)/ruff check --fix app tests scripts alembic

typecheck:
	$(VENV)/mypy app scripts

test:
	$(VENV)/pytest -q

openapi:  ## refresh frontend/openapi/openapi.json after changing the API
	$(VENV)/python scripts/export_openapi.py

eval:  ## reading accuracy of the active AI provider on all sample invoices (needs an API key)
	$(VENV)/python scripts/eval_extraction.py

corrections-report:  ## what partners corrected in each reader's work, and the hints the AI now gets
	$(VENV)/python scripts/corrections_report.py

audit:  ## known vulnerabilities in the installed dependencies (needs the network)
	$(VENV)/pip-audit --skip-editable

check: lint typecheck test

.PHONY: init run db-up migrate revision lint fmt typecheck test openapi eval corrections-report audit check
