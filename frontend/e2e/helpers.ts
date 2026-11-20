import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const SAMPLES = path.resolve(__dirname, "..", "public", "samples");

export function sample(file: string): string {
  return path.join(SAMPLES, file);
}

/** Opens a new proposal and waits for the upload screen. */
export async function openApp(page: Page): Promise<void> {
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
