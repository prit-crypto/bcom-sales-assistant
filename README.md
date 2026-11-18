# BCOM Sales Assistant (POC)

A proof of concept for **BCOM Global franchise partners**. A partner uploads a prospect's courier invoice (PDF or
photo), checks the shipments the AI read, and gets:

1. a savings comparison against BCOM's rates (monthly and yearly estimate),
2. a branded **proposal PDF** for the customer, and
3. a personalised **WhatsApp message** to send manually.

> Everything in this POC is fictional: the BCOM rate card, the courier ("SwiftLine Express") and the sample customers.
> See [docs/PLAN.md](docs/PLAN.md) for the agreed scope and plan.

## Quick start

Requirements: Node.js 20.9+ (tested on 22).

```bash
npm install
npm run dev          # http://localhost:3000
```

With no settings, the app runs in **mock mode** (no AI, no key, $0) and reads the bundled sample invoices.

## Switching the invoice reader (`AI_PROVIDER`)

Copy `.env.example` to `.env.local` and set `AI_PROVIDER`. Restart the app after changing it.

| `AI_PROVIDER` | What it does | Needs | Cost |
|---|---|---|---|
| `mock` (default) | Reads only our sample PDF format, uses a fixed message template | nothing | $0 |
| `gemini` | Google Gemini reads any PDF or photo and writes the message | `GEMINI_API_KEY` ([get one](https://aistudio.google.com/apikey)) | Free tier |
| `openai` | OpenAI reads any PDF or photo and writes the message | `OPENAI_API_KEY` | Paid (small) |

Models can be changed with `GEMINI_MODEL` and `OPENAI_MODEL` (default `gpt-6.1-terra`).

### Gemini settings and test results (18 Nov 2026, free tier)

| Setting | Default | Why |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Read both sample PDFs and the photo **100% correctly in about 8 seconds** |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.8-flash` | Used automatically if the main model is busy or out of quota (`none` turns it off) |
| `GEMINI_THINKING_LEVEL` | `low` | Copying a table needs little reasoning. `high` took 2+ minutes and returned broken JSON |

All 8 sample files were read **100% correctly** (every shipment and every field, matched by waybill number) by
`gemini-3.5-flash-lite` in 7–16 seconds each:

| File | Format | Result |
|---|---|---|
| `sample-1-al-noor-mobile.pdf` | SwiftLine table, 2 pages, 46 rows | 100% |
| `sample-2-gulf-spice.pdf` / `-photo.jpg` | Same layout with gaps; phone photo | 100% / 100% |
| `sample-3-falcon-air.pdf` / `-scan.png` | Product codes with legend, fuel column, DD/MM/YYYY, origin only in header; grey scan | 100% / 100% |
| `sample-4-desert-parcel.pdf` | Landscape, grouped under service headings with subtotals, YYYY/MM/DD | 100% |
| `sample-5-gulf-runner.png` | No table – one card per shipment | 100% |
| `sample-6-oryx-usd.pdf` | US dollars, MM/DD/YYYY | 100% read; correctly flagged as not comparable with AED rates |

- `gemini-3.8-flash` answered **503 "high demand"** to every request during testing; the app retries twice and then
  switches model, and shows "Gemini is busy" if both fail.
- Photos: keep the invoice **flat and straight**. With a ~1° tilt, Flash-Lite mixed up values between neighbouring rows;
  with a slight tilt (0.3°) it was 100% correct. The review step is there to catch such errors.

**Do not upload real customer invoices while using the Gemini free tier** – Google may use free-tier data to improve
its products. Use the fictional samples, or a paid key.

The provider only reads the invoice and writes the message. **All prices and savings are calculated by plain code**
(`src/lib/pricing`), so the numbers are exact and the same every time, whichever provider is active.

## Demo script (about 5 minutes)

1. **Upload** – click *Use this sample* on **Sample 2 · PDF with gaps** (or the phone photo with Gemini/OpenAI).
2. **Check shipments** – point out the highlighted cells: two weights are missing. Type `12` into one of them.
   Mention that the partner can correct anything the AI read, or untick rows.
3. **Savings** – show the headline monthly saving, the coverage bar (compared / missing / not on the rate card), and
   that BCOM is honestly shown as *more expensive* on UAE domestic lanes.
4. **Proposal PDF** – create the PDF and scroll through: recommended services, comparison by region and route,
   shipments not included, commercial conditions, assumptions.
5. **WhatsApp** – write the message, edit a word, click *Open in WhatsApp*. Nothing is sent automatically.

Sample 1 shows a clean, 2-page invoice with 46 shipments. With Gemini or OpenAI active, the **Other courier formats**
row on the upload screen shows the same flow on four different invoice designs (codes, grouped sections, cards, USD).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (pricing, mock reader on the real sample PDFs, normalisers) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript checks |
| `npm run samples` | Regenerate the sample invoices in `public/samples` (needs local Chrome; set `CHROME_PATH` if needed) |
| `npm run format` | Prettier |

## Project structure

```
src/
  app/                  page, layout, styles
    api/config          GET  – which provider is active (no secrets)
    api/extract         POST – upload invoice -> clean, editable shipment data
    api/proposal        POST – reviewed data -> proposal PDF (numbers recalculated on the server)
    api/message         POST – reviewed data -> WhatsApp text (numbers recalculated on the server)
  components/demo/      one component per journey step + stepper + DemoFlow (state)
  components/ui/        small shared UI pieces
  lib/ai/               provider interface, factory, prompts, JSON schema, providers/{mock,gemini,openai}
  lib/invoice/          normalisation of any reader's output, mock parser, PDF text extraction
  lib/pricing/          fictional rate card, calculator, comparison and summary
  lib/proposal/         proposal PDF (react-pdf) and sample commercial terms
  lib/whatsapp/         message facts, template, wa.me link
  lib/http/             request validation, upload checks, error responses
  lib/config/           environment settings (server only)
  types/                shared types
scripts/                sample invoice generator
public/samples/         fictional sample invoices
tests/                  Vitest unit tests
docs/PLAN.md            agreed plan and scope
```

### Adding another AI provider

Implement the `AIProvider` interface in `src/lib/ai/providers/<name>.ts` (`extractInvoice`, `writeSalesMessage`), add
the id to `PROVIDER_IDS` in `src/types/provider.ts`, and wire it in `src/lib/ai/index.ts`. Its output is validated
against the same schema and normalised the same way as the others.

## Pricing rules (fictional rate card)

- AED, all-in including fuel surcharge, excluding 5% VAT and duties.
- Origin must be the UAE. Destinations are grouped into 6 zones; Express and Economy services.
- Weight rounded up to 0.5 kg; first 0.5 kg + each extra 0.5 kg up to 30 kg; per kg above 30 kg; max 70 kg.
- Shipments that are imports, off the rate card, over 70 kg, missing data or excluded are counted in the coverage but
  left out of the savings.
- An invoice covering 25–35 days counts as one month; other periods are scaled to 30 days. Yearly = monthly x 12.

## Known limitations (POC)

- Rates are fictional; no connection to BCOM's real rates or the Metafour API yet.
- Mock mode reads only the bundled sample format. Real invoices need `gemini` or `openai`.
- Gemini has been tested with a live free-tier key (see above). The OpenAI provider is typed against its SDK but has
  not been run against a live key yet – test with a sample first when you add a key.
- Free-tier Gemini can be busy or rate-limited at any moment; keep `mock` mode as a backup for live demos.
- No login, database, Arabic, or volumetric weight from parcel dimensions.
- WhatsApp is click-to-chat only; the partner sends the message and attaches the PDF manually.
