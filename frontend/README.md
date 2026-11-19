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
| `npm run samples` | Regenerate the sample invoices in `public/samples` (needs local Chrome; set `CHROME_PATH` if needed) |

## Layout

```
src/
  app/                 page, layout, styles
  components/demo/     one component per journey step + stepper + DemoFlow (state)
  components/ui/       small shared UI pieces
  lib/client/api.ts    calls to the backend, error handling
  lib/validation.ts    highlights missing cells while editing (the backend applies the same rule)
  lib/whatsapp.ts      wa.me click-to-chat link
  lib/format.ts        money / date display
  types/               API types (snake_case, matching backend/app/schemas)
public/samples/        fictional sample invoices offered on the upload screen
scripts/               sample invoice generator
```

The generator uses a frozen copy of the POC rate card (`scripts/samples/frozen-*.ts`) only to make realistic
current-courier prices for the fictional samples. The app's real pricing lives in the backend. After regenerating,
copy the two SwiftLine PDFs and their expected values into `../backend/tests/fixtures`.
