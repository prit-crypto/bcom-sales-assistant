import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

/**
 * Browser tests for the whole journey. `npm run e2e` starts its own backend (no-AI mode, no rate limit,
 * its own `bcom_e2e` database) and frontend on ports 18765 / 13765, so it never touches the servers
 * or data you develop with. Needs the database running: `docker compose up -d db`.
 * Uses the system Chrome when present (set CHROME_PATH to override); otherwise run
 * `npx playwright install chromium` once.
 */
const API_PORT = 18765;
const WEB_PORT = 13765;
const chrome = process.env.CHROME_PATH ?? (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1300, height: 900 },
    trace: "retain-on-failure",
    launchOptions: chrome ? { executablePath: chrome } : {},
  },
  webServer: [
    {
      // Its own database (bcom_e2e), emptied and brought to the latest migration first.
      command: `.venv/bin/alembic downgrade base && .venv/bin/alembic upgrade head && .venv/bin/uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      env: {
        AI_PROVIDER: "mock",
        RATE_LIMIT_PER_MINUTE: "0",
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql+asyncpg://bcom:bcom@localhost:5440/bcom_e2e",
        PUBLIC_APP_URL: `http://localhost:${WEB_PORT}`,
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}/api/v1`,
      },
    },
  ],
});
