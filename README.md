# BCOM Sales Assistant

A tool for **BCOM Global franchise partners**. A partner uploads a prospect's courier invoice (PDF, photo or
spreadsheet); the app reads the shipments, compares them with BCOM's rates, and produces a branded proposal PDF, a
WhatsApp message, a pipeline of saved proposals with follow-ups, and a link the customer can open and accept.

| Folder | What it is | Details |
|---|---|---|
| [backend/](backend) | Python 3.12 FastAPI API, PostgreSQL, AI invoice reading, pricing, PDF | [backend/README.md](backend/README.md) |
| [frontend/](frontend) | Next.js partner screens (no server code; forwards `/api/v1` to the backend) | [frontend/README.md](frontend/README.md) |

All prices and savings are calculated by plain code in the backend, so the numbers are exact and the same every time,
whichever AI reader is active.

## Run locally (development)

Needs Python 3.12, Node.js 20.9+, Docker (for PostgreSQL) and Pango (`sudo apt install libpango-1.0-0 libpangoft2-1.0-0`).

```bash
# Backend: http://localhost:8000 (API docs at /docs)
cd backend
make init               # .venv with the exact package versions from requirements-dev.txt
cp .env.example .env    # AI_PROVIDER=mock works without a key
make db-up              # PostgreSQL on localhost:5440 (development only)
make migrate
make run

# Frontend: http://localhost:3000 (in a second terminal)
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

## Run with Docker

One command runs the database, the backend and the frontend:

```bash
cp .env.example .env    # set POSTGRES_PASSWORD; add the AI key and AI_PROVIDER=gemini for real invoices
docker compose up --build -d
```

Open http://localhost:3000 (change it with `FRONTEND_PORT` in `.env`). Only the frontend is published; the backend
and the database are reachable only inside Docker. The database is kept in the `bcom_db-data` volume, so stopping
or rebuilding (`docker compose down`, `docker compose up --build -d`) keeps the data. `docker compose logs -f backend`
follows the API's logs.

## Production

The steps are the same as **Run with Docker**, on the server. Before the first start, set in `.env`:

- `POSTGRES_PASSWORD` – a strong password (the database is internal, but don't keep the example value).
- `PUBLIC_APP_URL` – the address people use to open the app (customers' proposal links are built from it).
- `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_PAID_KEY=true` – a paid key, so uploads are not used by Google.
- Optionally `SENTRY_DSN` for error reporting.

Put HTTPS in front of the frontend port (a reverse proxy or the hosting platform's TLS). Secrets are only ever read
from `.env` at runtime; they are never built into the images.

## Updating

```bash
git switch main && git pull && docker compose up --build -d
```

Database migrations run automatically when the backend starts.

## Database backup

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U bcom -d bcom > backups/bcom-$(date +%F).sql   # back up
docker compose exec -T db psql -U bcom -d bcom < backups/bcom-2026-11-21.sql      # restore into an empty database
```

Use the `POSTGRES_USER` / `POSTGRES_DB` values from `.env` if you changed them. `backups/` is ignored by git; copy the
files somewhere off the server.

## Tests

```bash
cd backend && make db-up && make check     # lint, strict type check, all backend tests (needs the dev database)
cd frontend && npm run lint && npm run build   # the build also type-checks
cd frontend && npm run e2e                 # browser tests of the whole journey (needs the dev database)
docker compose build                       # every image builds
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all of these on every pull request and on pushes to
`dev` and `main`.

## Branches and pull requests

- `main` is production. Nothing is committed or pushed to it directly.
- `dev` is for integration and testing. Work goes to `dev`, or to `feature/<name>` / `fix/<name>` branches made
  from `dev` and merged back by pull request.
- Code reaches `main` only through a pull request from `dev`, after testing and with CI passing.
- Commit messages are one concise line.
- Recommended GitHub branch protection: on `main`, require a pull request with 1 approval and passing CI checks, and
  block force pushes and deletion; on `dev`, require passing CI.
- Pull requests use the [template](.github/pull_request_template.md): what and why, how it was tested, and the
  checklist.
