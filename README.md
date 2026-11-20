# BCOM Sales Assistant (POC)

A proof of concept for **BCOM Global franchise partners**. A partner uploads a prospect's courier invoice (PDF or
photo), checks the shipments the AI read, and gets:

1. a savings comparison against BCOM's rates (monthly and yearly estimate),
2. a branded **proposal PDF** for the customer,
3. a personalised **WhatsApp message** to send manually, and
4. a **pipeline** of saved proposals (draft → sent → won / lost) with follow-up reminders.

> Everything in this POC is fictional: the BCOM rate card, the courier ("SwiftLine Express") and the sample customers.
> See [docs/PLAN.md](docs/PLAN.md) for the agreed scope and plan.

## Repository layout

| Folder | What it is | Stack |
|---|---|---|
| [backend/](backend/) | The API: invoice reading (mock / Gemini / OpenAI), pricing, comparison, proposal PDF, WhatsApp message, saved proposals | Python 3.12, FastAPI, WeasyPrint, PostgreSQL |
| [frontend/](frontend/) | The partner-facing screens. No server code: it only calls the backend | Next.js 16, React 19, Tailwind 4 |

All prices and savings are calculated by plain code in the backend (`backend/app/services/pricing`), so the numbers
are exact and the same every time, whichever AI provider is active. The frontend never calculates money.

## Run everything in Docker

```bash
docker compose up --build   # app on http://localhost:3080, API on http://localhost:8080 (docs at /docs)
```

The backend container applies database migrations on start. Set `AI_PROVIDER` / `GEMINI_API_KEY` / `OPENAI_API_KEY`
in your shell (or a root `.env`) to use an AI reader; without them it runs in mock mode.

## Quick start for development (two terminals)

Requirements: Python 3.12 with [uv](https://docs.astral.sh/uv/), Node.js 20.9+, Docker (for PostgreSQL), and Pango
for the PDF (`sudo apt install libpango-1.0-0 libpangoft2-1.0-0` on Debian/Ubuntu; present on most desktops).

```bash
# 1. Backend – http://localhost:8000 (API docs at http://localhost:8000/docs)
cd backend
make init
cp .env.example .env        # AI_PROVIDER=mock works with no key
make db-up                  # PostgreSQL in Docker on port 5440 (also creates the test databases)
make migrate
make run

# 2. Frontend – http://localhost:3000
cd frontend
npm install
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm run dev
```

With no AI key, the backend runs in **mock mode** (no AI, $0) and reads the bundled SwiftLine sample invoices.
Details: [backend/README.md](backend/README.md) · [frontend/README.md](frontend/README.md).

## Demo script (about 5 minutes)

1. **Upload** – click *Use this sample* on **Sample 2 · PDF with gaps** (or the phone photo with Gemini/OpenAI).
2. **Check shipments** – point out the highlighted cells: two weights are missing. Type `12` into one of them.
   Mention that the partner can correct anything the AI read, or untick rows.
3. **Savings** – show the headline monthly saving, the coverage bar (compared / missing / not on the rate card), and
   that BCOM is honestly shown as *more expensive* on UAE domestic lanes.
4. **Proposal PDF** – create the PDF and scroll through: recommended services, comparison by region and route,
   shipments not included, commercial conditions, assumptions.
5. **WhatsApp** – write the message, edit a word, click *Open in WhatsApp*. Nothing is sent automatically.
   Click *Mark as sent*: the proposal now waits for a follow-up.
6. **Customer link** – on the proposal's page, create the customer link and open it: this is what the customer
   sees. Accept it, then look at the proposal again: it is won. "Send by email" sends it with the PDF (with
   `docker compose up -d mailpit`, emails land in the inbox at http://localhost:8025).
7. **Proposals** – click the logo: the proposal is in the list. Open it to see its history, change the follow-up date,
   add a note, mark it won or lost, or download the PDF again.

Phase 3b extras: drop two invoices from different months at once (or "Add another month") for an average over
both; watch the reading stages on the upload card.

Extras worth showing: on Savings, switch on *Send non-urgent parcels by Economy* (sample 1 goes from about AED 1,854
to AED 3,916 a month) and try *+20%* volume; *Download Excel*; on the proposal, pick *العربية* to get the Arabic PDF
and message, add a logo and a booking link; on the shipments step, change a charge to see the totals check.

Sample 1 shows a clean, 2-page invoice with 46 shipments. With Gemini or OpenAI active, the **Other courier formats**
row on the upload screen shows the same flow on four different invoice designs (codes, grouped sections, cards, USD).

## Safeguards on the numbers

- When BCOM is not cheaper overall, the savings screen says so, and the proposal PDF and WhatsApp message are refused
  (the backend returns `no_saving`), so a customer never sees "save about AED -11".
- Monthly figures are scaled only from the **billing period printed on the invoice**. If it is missing, the invoice
  counts as one month and the partner is asked to enter the period; shipment dates are not used to guess it.
- A missing currency is assumed to be AED, with a warning on the review screen and a line in the assumptions.
- The line charges are checked against the invoice's printed subtotal, and repeated waybills or unusual weights and
  charges are flagged for a second look before comparing.

## Known limitations (POC)

- Rates are fictional; no connection to BCOM's real rates or the Metafour API yet.
- Mock mode reads only the bundled sample format. Real invoices need `gemini` or `openai`.
- **Do not upload real customer invoices while using the Gemini free tier** – Google may use free-tier data to improve
  its products. Use the fictional samples, or a paid key.
- No login yet (by decision): everyone who can open the app sees and can change **the same list of proposals**, and
  the partner's own details are remembered per device. Keep it on a private network until logins are added. The
  per-minute limit on the AI endpoints only slows misuse; anyone with the URL can still use up the AI quota.
- Follow-up reminders show in the app only; reminder emails to partners are not built yet.
- Sending on WhatsApp Business and live BCOM rates (Metafour) need outside approvals and are not built.
- Saved proposals keep the reviewed invoice data (customer names and amounts), never the uploaded file. Delete a
  proposal to remove its data.
- No database or volumetric weight from parcel dimensions.
- Arabic covers the proposal PDF and WhatsApp message only, and has not yet been reviewed by a native speaker.
- WhatsApp is click-to-chat only; the partner sends the message and attaches the PDF manually.
