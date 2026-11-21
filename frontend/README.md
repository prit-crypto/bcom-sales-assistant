# BCOM Sales Assistant – frontend

The partner screens of the BCOM Sales Assistant, a proof of concept for **BCOM Global franchise partners**. A partner
uploads a prospect's courier invoice, checks the shipments, sees the savings against BCOM's rates, and gets a
branded proposal PDF, a WhatsApp message to send, a pipeline of saved proposals with follow-ups, and a link the
customer can open and accept.

It has no server code of its own: every reading, price and file comes from the backend in [../backend](../backend),
which must be running. The frontend never calculates money.

> Everything in this POC is fictional: the BCOM rate card, the courier ("SwiftLine Express") and the sample customers.

## Requirements

Node.js 20.9+ and a running backend (see [../backend/README.md](../backend/README.md)). Docker if you run it in a
container.

## Run in Docker

[docker-compose.yml](docker-compose.yml) in this folder runs the app on http://localhost:3080. Start the backend
first (`docker compose up -d --build` in `../backend`), then:

```bash
docker compose up -d --build   # app on http://localhost:3080, calling the API on http://localhost:8080
docker compose down            # stop
```

The browser calls the API directly, and its address is fixed when the image is built. To use another server:
`BCOM_API_URL=https://api.example.com/api/v1 docker compose up -d --build` (that server's `CORS_ORIGINS` must allow
this app's address).

## Development setup

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL, default http://localhost:8000/api/v1
npm run dev                  # http://localhost:3000 (start the backend first)
```

The backend must allow this origin in its `CORS_ORIGINS` (default `http://localhost:3000`). With no AI key the
backend runs in **mock mode**: the bundled sample invoices work, other invoices need Gemini or OpenAI.

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

Black (graphite) and gold, approved on 20 Nov 2026 (mock-ups: https://claude.ai/artifact/UDRJr4dwhiPAtF1Z6YFizt), in the
spirit of Apple's product pages. No blue (the company's other product uses navy) and no green.

- **Colours** are CSS variables in `src/app/globals.css`, mapped to Tailwind with `@theme inline`: graphite hero
  bands (`bg-hero`, `#141416`) with their own text colours (`text-hero-ink`, `text-hero-secondary`,
  `text-hero-save`), bright gold for the main buttons and highlights (`gold`, `#D4AF6A`), deep gold for savings, links and small
  marks on white (`accent`, `#8A6416`, 5.4:1 on white), Apple grey canvas `#F5F5F7`; red only for "costs more",
  gold for "needs attention" too (one warm colour across the app). Use the semantic classes, never raw hex values.
  The proposal PDF and the Excel export use the same graphite and gold. Green appears only on
  WhatsApp's own button and message bubble.
- **Hero bands** (`HeroBand`, `PageHeader` in `src/components/ui/Hero.tsx`): the home, upload, savings, proposal
  and customer pages open on a graphite band with cards floating over its lower edge; the working steps get a
  compact graphite header. The savings region view draws the routes from Dubai (`RouteMap`).
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
- **Logo**: on graphite the bar uses `public/brand/bcom-global-logo-light.png` (white BCOM, gold GLOBAL),
  made from the original logo by turning its ink into one colour with transparency. The PDF header is graphite with the
  light logo; the browser tab icon (`src/app/icon.png`, `apple-icon.png`) is the gold globe on graphite.
- **Layout**: a solid graphite top bar (`AppBar`, with the journey as a breadcrumb) and a floating bottom bar
  (`ActionBar`) on every step, so the next action is always in reach. Lists are grouped iPhone-style rows with
  hairline dividers. Phones get shipment cards and a bottom sheet for the PDF preview.

## Pages

| Address | What it is |
|---|---|
| `/` | Proposals: "Follow up today", then every saved proposal with filter and search |
| `/new` | The five-step journey for a new invoice |
| `/proposals/<id>` | One proposal: status, follow-up date, notes, history, files, delete |
| `/proposals/<id>/edit` | The journey again for a saved proposal (opens at Savings) |
| `/p/<token>` | **The customer's page** from their link: savings, regions, services, PDF, contact and Accept, in English or Arabic. No partner screens are reachable from it, and search engines are told not to index it |

The browser tests (`npm run e2e`) need PostgreSQL running (`docker compose up -d db` in the
`backend` folder); their backend empties and
migrates its own `bcom_e2e` database on every run.

## Demo script (about 5 minutes)

1. **Upload**: click *Use this sample* on **Sample 2 · PDF with gaps** (or the phone photo with Gemini/OpenAI).
2. **Check shipments**: point out the highlighted cells: two weights are missing. Type `12` into one of them.
   The partner can correct anything the AI read, or untick rows.
3. **Savings**: show the headline monthly saving, the coverage bar (compared / missing / not on the rate card), the
   two examples from the invoice, and that BCOM is honestly shown as *more expensive* on UAE domestic lanes.
4. **Proposal PDF**: fill in your details, create the PDF and scroll through: recommended services, examples from
   the invoice, comparison by region and route, shipments not included, commercial conditions, assumptions.
5. **WhatsApp**: write the message, edit a word, click *Open in WhatsApp*. Nothing is sent automatically.
   Click *Mark as sent*: the proposal now waits for a follow-up.
6. **Customer link**: on the proposal's page, create the customer link and open it: this is what the customer
   sees. Accept it, then look at the proposal again: it is won.
7. **Proposals**: click the logo: the proposal is in the list. Open it to see its history, change the follow-up date,
   add a note, mark it won or lost, or download the PDF again.

Extras worth showing: drop two invoices from different months at once (or "Add another month") for an average over
both; on Savings, switch on *Send non-urgent parcels by Economy* and try *+20%* volume; *Download Excel*; on the
proposal, pick *العربية* for the Arabic PDF and message, add a logo and a booking link. With Gemini or OpenAI active,
the **Other courier formats** row on the upload screen shows the same flow on four different invoice designs.

## Features worth knowing

- **Several months in one proposal**: choose or drop up to 3 invoices at once, or use "Add another month" on the
  shipments step (Undo takes it out). Rows show which invoice they came from, the viewer switches between them, and
  the monthly figures average over the whole period.
- **Live reading progress**: while an invoice is read, the upload card lists the stages (uploaded, checked, reading,
  tidying, checks) with the time so far and how long reads usually take. If the stream can't be used, it falls back
  to the plain read.
- **Saved as you go**: "Compare with BCOM rates" saves the work as a draft proposal; after that the shipments,
  what-if, partner details and message autosave a moment after they stop changing ("Saving… / Saved" in the top bar).
  A change made just before closing, reloading or leaving the page is still sent.
- **Customer link** (proposal page): "Create customer link" gives a private page where the customer
  sees the savings and can accept (the proposal then shows as won, with their name and note). The WhatsApp step can
  add the link to the message too.
- **Mark as sent** (WhatsApp step or proposal page) sets a follow-up date; on that day the proposal appears under
  "Follow up today" on the list.
- **Your details are remembered** on this device (name, company, logo, booking link, language, validity) for the next
  proposal. A first visit starts with empty fields; the PDF is built once your name and company are filled in.
  There are no accounts yet.

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

## Known limitations (POC)

- No login yet (by decision): everyone who can open the app sees and can change the same list of proposals, and the
  partner's own details are remembered per device. Keep it on a private network until logins are added.
- WhatsApp is click-to-chat only: the partner sends the message and attaches the PDF themselves.
- Follow-up reminders show in the app only.
- Arabic covers the proposal PDF, the WhatsApp message and the customer's page; the partner screens stay in English.
  The Arabic wording has not yet been reviewed by a native speaker.
- **Do not upload real customer invoices while the backend uses the Gemini free tier**; use the samples or a paid key.
