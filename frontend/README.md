# BCOM Sales Assistant – frontend

The partner-facing screens: upload → check shipments → savings → proposal PDF → WhatsApp message. It has no server
code of its own; everything is done by the backend in [../backend](../backend).

## Setup

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL, default http://localhost:8000/api/v1
npm run dev                  # http://localhost:3000 (start the backend first)
```

The backend must allow this origin in its `CORS_ORIGINS` (default `http://localhost:3000`).

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run e2e` | Browser tests of the whole journey (starts its own backend and frontend on ports 18765 / 13765) |
| `npm run generate:api` | Regenerate API types from `openapi/openapi.json` (after `make openapi` in the backend) |
| `npm run check:api` | Fails if the generated API types are out of date |
| `npm run audit` | Known vulnerabilities in the packages the app ships (`npm audit --omit=dev`; needs the network) |
| `npm run samples` | Regenerate the sample invoices in `public/samples` (needs local Chrome; set `CHROME_PATH` if needed) |

## Design

Approved on 19 Nov 2026 (mock-ups: https://claude.ai/artifact/XKyJeNfN3sxunUJWeE54sS).

- **Colours** are CSS variables in `src/app/globals.css`, mapped to Tailwind with `@theme inline`: navy ink
  `#0B2545`, teal accent `#0B7A75`, warm sand canvas `#F6F3EE`; red only for "costs more", amber for "needs
  attention". Use the semantic classes (`bg-surface`, `text-secondary`, `bg-accent`…), never raw hex values.
- **Dark mode** follows the device (`prefers-color-scheme`); every variable has a dark value.
- **Accessibility settings**: "increase contrast" swaps soft shadows for solid edges; "reduce transparency" makes
  the top and bottom bars solid; "reduce motion" turns slides into short fades and stops the savings count-up.
- **Type**: the system font (SF Pro on Apple devices), tighter letter-spacing as text grows (`type-display`,
  `type-title`, `type-headline`), lined-up figures for money (`tabular`).
- **Motion** uses [Motion](https://motion.dev) springs with no bounce: steps slide forward from the right and back
  to the right; the phone sheet follows the finger and keeps the flick's speed. Buttons shrink slightly the moment
  they are pressed (`pressable`).
- **Simple animations**: lists ease in, savings bars grow into place, segmented controls slide their pill,
  figures count up once, a tick draws in when a missing value is filled, "Copy" turns into "Copied ✓", the PDF
  preview cross-fades when it updates, a half-typed currency gives one small shake. Only `transform` and
  `opacity` are animated, nothing runs longer than about 0.5 s, and "reduce motion" turns all of it off.
- **Layout**: a translucent top bar (`AppBar`) and a floating bottom bar (`ActionBar`) on every step, so the next
  action is always in reach. Phones get shipment cards and a bottom sheet for the PDF preview.

## Pages

| Address | What it is |
|---|---|
| `/` | Proposals: "Follow up today", then every saved proposal with filter and search |
| `/new` | The five-step journey for a new invoice |
| `/proposals/<id>` | One proposal: status, follow-up date, notes, history, files, delete |
| `/proposals/<id>/edit` | The journey again for a saved proposal (opens at Savings) |

The browser tests (`npm run e2e`) need PostgreSQL running (`make db-up` in the backend); their backend empties and
migrates its own `bcom_e2e` database on every run.

## Features worth knowing

- **Saved as you go**: "Compare with BCOM rates" saves the work as a draft proposal; after that the shipments,
  what-if, partner details and message autosave a moment after they stop changing ("Saving… / Saved" in the top bar).
  A change made just before closing, reloading or leaving the page is still sent.
- **Mark as sent** (WhatsApp step or proposal page) sets a follow-up date; on that day the proposal appears under
  "Follow up today" on the list.
- **Your details are remembered** on this device (name, company, logo, booking link, language, validity) for the next
  proposal. There are no accounts yet.

- **Work survives a refresh**: the journey is kept in this tab's `sessionStorage` (cleared when the tab closes), and
  invoices up to 3 MB are kept for the viewer. A "Restored your last session · Discard" notice appears after a reload.
- **Undo**: every cell edit and include/leave-out on the shipments step can be undone from the toast, the Undo
  button or ⌘Z / Ctrl+Z (last 20 edits).
- **Original invoice beside the table**: "Show invoice" splits the screen at 1280 px and wider; smaller screens open
  it in a sheet.
- **Second look**: a moment after each edit the shipments are re-checked (totals vs the printed subtotal, repeated
  waybills, unusual weights or charges). One amber banner lists what was found; flagged rows get a "Check" tag, and
  values the AI reader was unsure of have a dotted amber underline until the partner taps them.
- **What if…** on Savings: monthly volume (−20% to ×2) and "send non-urgent parcels by Economy", with the
  like-for-like figure and the delivery-time trade-offs. The choice carries into the PDF, the message and the Excel
  download, and survives a refresh.
- **Proposal options**: customer language (English or Arabic, for the PDF and message only; the screens stay in
  English), the partner's logo (PNG/JPG up to 300 KB) and an optional booking link (used once it is a full https link).
- **Spreadsheets**: the upload accepts CSV and Excel statements (read without AI); `public/templates` has a CSV template.
- **First visit**: a short "How this works" strip, remembered in `localStorage`; "Sample mode" in the top bar when no
  AI reader is on, and the free-tier or samples-only notice when the backend reports one.
- **Security headers** (`next.config.ts`): a Content Security Policy (only this site and the API origin; blob/data
  previews allowed; no framing), `nosniff`, `no-referrer` and a Permissions-Policy.
- **Accessibility checks**: `e2e/accessibility.spec.ts` runs axe on every step in light and dark, desktop and phone,
  and fails on serious or critical problems.
- **Types from the backend**: `src/types/*` re-export types generated from the backend's OpenAPI description, so a
  renamed field fails `npm run typecheck` instead of breaking a screen.

## Layout

```
src/
  app/                 page, layout, design tokens (globals.css)
  components/demo/     one component per journey step + DemoFlow (state, step transitions)
  components/ui/       AppBar, ActionBar, Button, Banner, Segmented, Disclosure, Sheet, Toast, InvoiceViewer, …
  lib/client/api.ts    calls to the backend, error handling, request cancelling
  lib/hooks.ts         count-up and screen-width hooks
  lib/session.ts       keeps the journey across a refresh (sessionStorage)
  lib/api/generated/   types generated from openapi/openapi.json (never edit by hand)
  lib/validation.ts    highlights missing cells while editing (the backend applies the same rule)
  lib/whatsapp.ts      wa.me click-to-chat link
  lib/format.ts        money / date display
  types/               thin re-exports of the generated API types
e2e/                   Playwright browser tests (npm run e2e)
openapi/openapi.json   the backend's API description, refreshed by `make openapi`
public/samples/        fictional sample invoices offered on the upload screen
scripts/               sample invoice generator
```

The generator uses a frozen copy of the POC rate card (`scripts/samples/frozen-*.ts`) only to make realistic
current-courier prices for the fictional samples. The app's real pricing lives in the backend. After regenerating,
copy the two SwiftLine PDFs and their expected values into `../backend/tests/fixtures`.
