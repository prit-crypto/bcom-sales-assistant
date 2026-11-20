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
| `make openapi` | Refresh `frontend/openapi/openapi.json` after changing the API (a test fails if you forget) |
| `make eval` | Reading accuracy of the active AI provider on all 8 sample invoices; writes `eval-report.md` |

## API (`/api/v1`)

| Method & path | In | Out |
|---|---|---|
| `GET /health` | – | `{"status": "ok"}` |
| `GET /config` | – | active provider (no secrets), upload limit, `privacy_notice`, `samples_only` |
| `POST /invoices/extract` | multipart `file` (PDF/JPG/PNG/WEBP, or a CSV/XLSX statement, ≤ `MAX_UPLOAD_MB`) | clean, editable invoice data |
| `POST /invoices/check` | `{invoice}` | sanity checks (totals, duplicate waybills, weight and charge outliers) |
| `POST /comparisons` | `{invoice, scenario?}` (after the partner's review) | per-shipment rows + summary (incl. checks) |
| `POST /exports/comparison` | `{invoice, scenario?}` | `.xlsx` (Summary, Shipments, By region, By route) |
| `POST /proposals` | `{invoice, partner, scenario?}` | `application/pdf` (English or Arabic) |
| `POST /messages` | `{invoice, partner, scenario?}` | WhatsApp text (English or Arabic) |

`scenario` is the what-if from the Savings screen: `volume_factor` (0.8, 1, 1.2, 1.5 or 2; scales the monthly figures
only) and `economy_for_non_urgent` (international Express parcels priced as BCOM Economy; the summary then also gives
the like-for-like saving and the delivery-time trade-offs). `partner` may carry `language` (`en`/`ar`), an optional
`booking_url` (https only) and `partner_logo` (PNG/JPEG data URL, at most 300 KB, checked by its bytes).

Every error has the same body: `{"error": {"code": "...", "message": "..."}}`, with a message safe to show to the
partner. `/proposals` and `/messages` recalculate the comparison themselves and never trust numbers from the browser;
they return `422 no_saving` when BCOM is not cheaper, and `422 nothing_to_propose` when no shipment could be compared.

## Safeguards

- **Sanity checks** (no AI, instant): the line charges are compared with the printed subtotal (warns above
  max(AED 1, 0.5%)), repeated waybills are flagged, and weights or charges per kg far from those of similar shipments
  (same service and route) are pointed out. None fire on the six clean samples.
- **Uncertain values**: the AI readers list fields they could not read clearly; the review screen marks them.
- **Back-up reader**: `AI_FALLBACK_PROVIDER=openai|gemini` reads with the other provider when the main one is busy,
  rate-limited, failing or too slow, and adds a note asking the partner to double-check.
- **Privacy**: with Gemini on the free tier (`GEMINI_PAID_KEY=false`, the default) `/config` returns a notice telling
  partners to use sample invoices only. `ALLOW_ONLY_SAMPLE_FILES=true` makes `/invoices/extract` accept only the
  bundled samples (hashes in `app/assets/sample_hashes.json`, rewritten by `scripts/write_sample_hashes.py`).
- **Security headers** on every API response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`. `make audit` checks the installed packages for known vulnerabilities (needs the
  network, so it is not part of `make check`).
- **Spreadsheets** (CSV/XLSX) are read without AI: common header names are recognised (Date / Ship date, AWB /
  Waybill, Origin / From, Destination / To, Service, Pieces, Weight, Amount / Charge…), dates are read day first, and
  total rows are skipped. Missing columns give a `422` naming what was found and what is needed.
- **Arabic proposals** use the Noto Naskh/Sans Arabic fonts (`fonts-noto-core` in the Docker image) and right-to-left
  layout; numbers stay Western with "AED". The Arabic wording was written without a native speaker: have one review the
  PDF and message before using them with customers.

- **Other currencies** are converted to AED before comparing when a rate is set in `FX_RATES_TO_AED` (default
  `{"USD": 3.6725}`, the dirham's fixed peg). The summary's `converted_from` and an assumption line say so; a
  currency without a rate is still refused as "not comparable".
- **Request size**: requests declaring more than `MAX_UPLOAD_MB` (+1 MB for form overhead) get `413` before any of
  the body is read; the upload reader also counts bytes as a second guard.
- **Rate limit**: `/invoices/extract` and `/messages` (the endpoints that call the AI) allow
  `RATE_LIMIT_PER_MINUTE` requests per client per minute (default 20, `0` turns it off), then `429 rate_limited`.
  In memory, so per process; move it to Redis when running several instances.
- **Extraction cache**: the same file read by the same provider and model is returned from memory
  (`X-Cache: hit`) for `EXTRACT_CACHE_TTL_SECONDS`, up to `EXTRACT_CACHE_SIZE` invoices. Only cleaned invoice data
  is kept, never the file.
- **Logs** are structured (structlog): readable lines in development, JSON elsewhere (`APP_ENV`). Every line carries
  the request id (the caller's `X-Request-ID`, or a new one echoed back). Reads log provider, model, cache hit,
  shipment count and time; customer names and amounts are never logged.

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
snake_case; run `make eval` with a key to re-check all eight samples in one go. OpenAI has not been run against a
live key yet.

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
