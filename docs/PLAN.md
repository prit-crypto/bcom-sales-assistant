# POC Plan – AI Sales Assistant for BCOM Franchise Partners

## Goal
A franchise partner uploads a prospect's courier invoice (PDF or photo). The app reads the shipments, lets the
partner correct them, compares them with a (fictional) BCOM rate card, shows the monthly savings, and produces a
branded proposal PDF plus a WhatsApp message the partner sends manually.

Time box: 1–2 days. Cost: $0 during development (mock mode, then Gemini free tier).

## Demo journey (agreed with BDE)
1. Upload prospect's courier invoice (PDF / image), or pick a bundled sample.
2. AI extracts shipments – dates, destinations, weights, services, charges; missing fields are highlighted
   and the partner can edit or exclude rows before comparing.
3. Compare with BCOM rates – deterministic calculator on a fictional rate card (no AI in the maths).
4. Show savings – current spend, proposed spend, saving (monthly + yearly), eligible-shipment coverage, assumptions.
5. Generate a customer proposal – branded PDF: recommended services, comparative costs, savings, commercial conditions.
6. Prepare a WhatsApp message – personalised, editable, Copy / Open-in-WhatsApp; the partner sends it manually.

## Switchable AI provider (`AI_PROVIDER` in `.env.local`)
| Mode     | Used for                         | Reads                         | Cost |
|----------|----------------------------------|-------------------------------|------|
| `mock`   | Building and testing (default)   | Our sample PDF format only    | $0   |
| `gemini` | Testing with real AI             | Any PDF or image              | Free tier |
| `openai` | Later / client demo              | Any PDF or image              | Paid, small |

All three implement one `AIProvider` interface (`extractInvoice`, `writeSalesMessage`). Every provider's output is
validated with the same Zod schema and normalised the same way, so the rest of the app never knows which provider ran.
Rule: no real customer invoices on the Gemini free tier (Google may use free-tier data).

## Architecture
- Next.js (App Router, TypeScript, Tailwind) – one app, UI + API routes.
- Server-only AI layer: `src/lib/ai` (keys never reach the browser).
- Pure domain logic with unit tests: `src/lib/pricing` (rate card, calculator, comparison), `src/lib/invoice`
  (normalise, mock parser).
- The server recomputes the comparison for the PDF and message (never trusts numbers sent from the browser).
- Proposal PDF: `@react-pdf/renderer` on the server. No database, no login.

### API routes
| Route               | In                                  | Out                    |
|---------------------|-------------------------------------|------------------------|
| `GET /api/config`   | –                                   | active provider, model |
| `POST /api/extract` | multipart file (PDF/JPG/PNG/WEBP, ≤10 MB) | extracted invoice |
| `POST /api/proposal`| reviewed invoice + partner details  | `application/pdf`      |
| `POST /api/message` | reviewed invoice + partner details  | WhatsApp text          |

## Folder structure
```
src/
  app/                 page, layout, styles, api/* route handlers
  components/
    demo/              one component per journey step + stepper
    ui/                small shared UI pieces
  lib/
    ai/                provider interface, factory, prompts, schema, providers/{mock,gemini,openai}
    config/            env parsing (Zod)
    invoice/           normalisation, mock parser for the sample format
    pricing/           rate card, zones, calculator, comparison/summary
    proposal/          PDF document + commercial terms
    whatsapp/          template + wa.me link
    http/              API error helpers
  types/               shared domain types
scripts/               sample invoice generator
public/samples/        generated sample invoices (fictional courier "SwiftLine Express")
tests/                 Vitest unit tests
docs/                  this plan
```

## Pricing rules (fictional rate card, AED, all-in incl. fuel, excl. 5% VAT)
- Origin must be UAE; destinations grouped into 6 zones (UAE, GCC, MENA & South Asia, Europe, North America, Asia Pacific).
- Express and Economy services; weight rounded up to 0.5 kg; first 0.5 kg + each extra 0.5 kg up to 30 kg; per-kg above 30 kg.
- Not eligible (counted in coverage, excluded from savings): non-UAE origin, destination not on card, > 70 kg, missing data, excluded by partner.
- Monthly figure: invoice period ≈ 1 month → as is; otherwise scaled to 30 days. Yearly = monthly × 12.
- Some lanes are deliberately cheaper with the current courier, so the demo shows honest mixed results.

## Build order (checkpoints)
1. Scaffold config: tsconfig, Next, Tailwind, ESLint, Prettier, Vitest, `.env.example`, `.gitignore`.
2. Domain: types → rate card + calculator + comparison → unit tests green.
3. Samples: generator script → 2 fictional invoices (clean PDF; messy PDF + phone-style photo with missing
   weights, an import and an over-70 kg row).
4. AI layer: schema, normaliser, mock parser (+ tests on the real sample PDFs), Gemini and OpenAI providers, factory.
5. API routes with validation and clear errors.
6. UI: upload → review (editable) → savings → proposal → WhatsApp.
7. Proposal PDF and WhatsApp message.
8. Verify: typecheck, lint, tests, production build, run the full journey in mock mode end to end.
9. README (setup, switching providers, demo script, limitations).

## Out of scope for the POC
Real BCOM rates / Metafour API, real WhatsApp sending, login, database, Arabic, volumetric weight from dimensions.

## Risks
- Gemini free-tier limits can change → keep `mock` as a fallback for demos; set `GEMINI_MODEL` to a Flash-Lite model if needed.
- Real-world invoice layouts vary → AI providers only; mock mode reads our sample format only (by design).
- Gemini and OpenAI cannot be tested end to end without keys → typed against the installed SDKs; first real run when a key is added.
