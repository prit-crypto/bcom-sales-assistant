# BCOM Sales Assistant (POC)

A proof of concept for **BCOM Global franchise partners**. A partner uploads a prospect's courier invoice (PDF or
photo), checks the shipments the AI read, and gets:

1. a savings comparison against BCOM's rates (monthly and yearly estimate),
2. a branded **proposal PDF** for the customer, and
3. a personalised **WhatsApp message** to send manually.

> Everything in this POC is fictional: the BCOM rate card, the courier ("SwiftLine Express") and the sample customers.
> See [docs/PLAN.md](docs/PLAN.md) for the agreed scope and plan.

## Repository layout

| Folder | What it is | Stack |
|---|---|---|
| [backend/](backend/) | The API: invoice reading (mock / Gemini / OpenAI), pricing, comparison, proposal PDF, WhatsApp message | Python 3.12, FastAPI, WeasyPrint |
| [frontend/](frontend/) | The partner-facing screens. No server code: it only calls the backend | Next.js 16, React 19, Tailwind 4 |

All prices and savings are calculated by plain code in the backend (`backend/app/services/pricing`), so the numbers
are exact and the same every time, whichever AI provider is active. The frontend never calculates money.

## Quick start (two terminals)

Requirements: Python 3.12 with [uv](https://docs.astral.sh/uv/), Node.js 20.9+, and Pango for the PDF
(`sudo apt install libpango-1.0-0 libpangoft2-1.0-0` on Debian/Ubuntu; present on most desktops).

```bash
# 1. Backend – http://localhost:8000 (API docs at http://localhost:8000/docs)
cd backend
make init
cp .env.example .env        # AI_PROVIDER=mock works with no key
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

Sample 1 shows a clean, 2-page invoice with 46 shipments. With Gemini or OpenAI active, the **Other courier formats**
row on the upload screen shows the same flow on four different invoice designs (codes, grouped sections, cards, USD).

## Safeguards on the numbers

- When BCOM is not cheaper overall, the savings screen says so, and the proposal PDF and WhatsApp message are refused
  (the backend returns `no_saving`), so a customer never sees "save about AED -11".
- Monthly figures are scaled only from the **billing period printed on the invoice**. If it is missing, the invoice
  counts as one month and the partner is asked to enter the period; shipment dates are not used to guess it.
- A missing currency is assumed to be AED, with a warning on the review screen and a line in the assumptions.

## Known limitations (POC)

- Rates are fictional; no connection to BCOM's real rates or the Metafour API yet.
- Mock mode reads only the bundled sample format. Real invoices need `gemini` or `openai`.
- **Do not upload real customer invoices while using the Gemini free tier** – Google may use free-tier data to improve
  its products. Use the fictional samples, or a paid key.
- No login and no rate limiting on the API: keep it on a private network until both are added, or anyone with the URL
  can use up the AI quota.
- No database, Arabic, or volumetric weight from parcel dimensions.
- WhatsApp is click-to-chat only; the partner sends the message and attaches the PDF manually.
