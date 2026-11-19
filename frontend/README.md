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
- **Layout**: a translucent top bar (`AppBar`) and a floating bottom bar (`ActionBar`) on every step, so the next
  action is always in reach. Phones get shipment cards and a bottom sheet for the PDF preview.

## Layout

```
src/
  app/                 page, layout, design tokens (globals.css)
  components/demo/     one component per journey step + DemoFlow (state, step transitions)
  components/ui/       AppBar, ActionBar, Button, Banner, Segmented, Disclosure, Sheet, StatusPill, Icon
  lib/client/api.ts    calls to the backend, error handling, request cancelling
  lib/hooks.ts         count-up and screen-width hooks
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
