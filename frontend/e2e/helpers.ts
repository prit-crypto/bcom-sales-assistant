import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const SAMPLES = path.resolve(__dirname, "..", "public", "samples");

export function sample(file: string): string {
  return path.join(SAMPLES, file);
}

/** The partner's details a test browser starts with (the app itself starts with empty fields). */
export const TEST_PARTNER = {
  partner_name: "Rahul Mehta",
  partner_company: "Sharjah Logistics Partners",
  partner_phone: "+971 50 000 0000",
  partner_email: "rahul@example.com",
};

/** Fills in the partner's details on a fresh test browser, once (later changes are kept). */
export async function rememberTestPartner(page: Page): Promise<void> {
  await page.addInitScript((partner) => {
    try {
      if (!window.localStorage.getItem("bcom-partner-defaults-v1")) {
        window.localStorage.setItem("bcom-partner-defaults-v1", JSON.stringify(partner));
      }
    } catch {
      // Storage blocked: the test fills the fields itself.
    }
  }, TEST_PARTNER);
}

/** Opens a new proposal and waits for the upload screen. */
export async function openApp(page: Page, { partner = true }: { partner?: boolean } = {}): Promise<void> {
  if (partner) await rememberTestPartner(page);
  await page.goto("/new");
  await expect(page.getByText("No invoice to hand? Try a sample")).toBeVisible();
}

/** Loads a bundled sample and waits for the shipments step. */
export async function loadSample(page: Page, label: "Clean PDF" | "PDF with gaps"): Promise<void> {
  await page.getByRole("button", { name: `Use sample: ${label}` }).click();
  await expect(page.getByRole("heading", { name: "Check the shipments" })).toBeVisible();
}

export async function compare(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Compare with BCOM rates" }).click();
  await expect(page.locator("#savings-title")).toBeVisible();
}

/** The savings headline as a screen reader hears it (the visible number counts up). */
export async function headline(page: Page): Promise<string> {
  return (await page.locator("#savings-title").innerText()).replace(/\s+/g, " ");
}
