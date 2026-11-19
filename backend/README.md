# BCOM Sales Assistant – backend

FastAPI service that reads a prospect's courier invoice, compares it with the (fictional) BCOM rate card, and builds
the proposal PDF and WhatsApp message. The frontend in [../frontend](../frontend) is its only client.

## Setup

```bash
make init                 # creates .venv and installs app + dev dependencies (uses uv)
cp .env.example .env
make run                  # http://localhost:8000, interactive API docs at /docs
```

The proposal PDF uses WeasyPrint, which needs Pango (`libpango-1.0-0 libpangoft2-1.0-0`). The [Dockerfile](Dockerfile)
installs it.

| Command | Purpose |
|---|---|
| `make run` | Development server with reload |
| `make test` | Unit and API tests (pytest) |
| `make lint` / `make fmt` | Ruff check / format |
| `make typecheck` | mypy (strict) |
| `make check` | lint + typecheck + test |

## API (`/api/v1`)

| Method & path | In | Out |
|---|---|---|
| `GET /health` | – | `{"status": "ok"}` |
| `GET /config` | – | active provider (no secrets), upload limit |
| `POST /invoices/extract` | multipart `file` (PDF/JPG/PNG/WEBP, ≤ `MAX_UPLOAD_MB`) | clean, editable invoice data |
| `POST /comparisons` | `{invoice}` (after the partner's review) | per-shipment rows + summary |
| `POST /proposals` | `{invoice, partner}` | `application/pdf` |
| `POST /messages` | `{invoice, partner}` | WhatsApp text |

Every error has the same body: `{"error": {"code": "...", "message": "..."}}`, with a message safe to show to the
partner. `/proposals` and `/messages` recalculate the comparison themselves and never trust numbers from the browser;
they return `422 no_saving` when BCOM is not cheaper, and `422 nothing_to_propose` when no shipment could be compared.

## Invoice reader (`AI_PROVIDER`)

| `AI_PROVIDER` | What it does | Needs | Cost |
|---|---|---|---|
| `mock` (default) | Reads only the SwiftLine sample PDFs, uses a fixed message template | nothing | $0 |
| `gemini` | Google Gemini reads any PDF or photo and writes the message | `GEMINI_API_KEY` | Free tier |
| `openai` | OpenAI reads any PDF or photo and writes the message | `OPENAI_API_KEY` | Paid (small) |

Restart the server after changing `.env`. Gemini retries a busy model twice, then switches to
`GEMINI_FALLBACK_MODEL`; the whole read is capped at `AI_TOTAL_TIMEOUT_SECONDS` so a slow day ends in a clear "busy"
message rather than a cut-off request. Every provider's output is validated against the same schema
([app/schemas/raw_invoice.py](app/schemas/raw_invoice.py)) and normalised the same way.

The Gemini results recorded on 18 Nov 2026 (all 8 samples read 100% correctly by `gemini-3.5-flash-lite`) were
measured with the previous TypeScript version, whose output schema used camelCase field names. The schema now uses
snake_case; re-check one sample when you first run Gemini or OpenAI here. OpenAI has not been run against a live key
yet.

## Layout

```
app/
  main.py                 app factory: CORS, error handlers, /api/v1 router
  api/v1/endpoints/       health, config, invoices, comparisons, proposals, messages
  core/                   settings (pydantic-settings), AppError + error envelope
  schemas/                request/response models, raw reader output + JSON Schema for the AI
  clients/ai/             provider interface, factory, prompts, mock / Gemini / OpenAI
  services/invoice/       upload checks, normalisation, mock parser, PDF text
  services/pricing/       fictional rate card, calculator, comparison and summary
  services/proposal/      proposal HTML template -> PDF, sample commercial terms
  services/whatsapp.py    message facts and template
  assets/                 logo used in the PDF
tests/                    pytest; fixtures/ holds the two SwiftLine sample PDFs and their expected values
```

`tests/fixtures/expected_samples.json` and the sample PDFs come from the generator in
`../frontend/scripts`; copy them again if you regenerate the samples.
