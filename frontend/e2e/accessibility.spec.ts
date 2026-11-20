import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { compare, loadSample, openApp, sample } from "./helpers";

/**
 * Automatic accessibility checks (axe) on every step, in light and dark, on desktop and phone.
 * Fails on serious or critical problems. Reduced motion, so nothing is scanned halfway through a fade.
 */
async function scan(page: Page, step: string): Promise<void> {
  // Let entrances and fades finish: a half-faded element reads as low contrast.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  await page.waitForTimeout(400);
  // A tall window for the scan, so no row sits under the fixed top or bottom bar (axe would call it obscured).
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: 4000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // The PDF preview is the browser's own viewer, not our page.
    .exclude('iframe[title="Proposal preview"]')
    .analyze();
  await page.setViewportSize(viewport);
  const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  const report = serious.map(
    (violation) => `${violation.id}: ${violation.help}\n  ${violation.nodes.map((node) => `${node.target.join(" ")} — ${node.failureSummary ?? ""}`).join("\n  ")}`,
  );
  expect(report, `${step}: accessibility problems`).toEqual([]);
}

const MODES = [
  { name: "light, desktop", colorScheme: "light", viewport: { width: 1300, height: 900 } },
  { name: "dark, desktop", colorScheme: "dark", viewport: { width: 1300, height: 900 } },
  { name: "light, phone", colorScheme: "light", viewport: { width: 390, height: 844 } },
  { name: "dark, phone", colorScheme: "dark", viewport: { width: 390, height: 844 } },
] as const;

for (const mode of MODES) {
  test(`every step passes axe (${mode.name})`, async ({ page }) => {
    await page.setViewportSize(mode.viewport);
    await page.emulateMedia({ colorScheme: mode.colorScheme, reducedMotion: "reduce" });

    await openApp(page);
    await scan(page, "upload");

    await loadSample(page, "PDF with gaps");
    await scan(page, "shipments");

    await compare(page);
    await page.getByRole("switch", { name: "Send non-urgent parcels by Economy" }).click();
    await expect(page.getByText(/a month like for like, or/)).toBeVisible();
    await scan(page, "savings");

    await page.getByRole("button", { name: "Create proposal" }).click();
    await expect(page.getByRole("heading", { name: "Customer proposal" })).toBeVisible();
    // The PDF is built once "Next" unlocks (phones show no preview pane).
    await expect(page.getByRole("button", { name: "Next: WhatsApp" }).first()).toBeEnabled();
    await scan(page, "proposal");

    await page.getByRole("button", { name: "Next: WhatsApp" }).click();
    await expect(page.locator("#whatsapp-message")).toBeVisible();
    await scan(page, "whatsapp");
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`proposals list and a proposal page pass axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await openApp(page);
    await loadSample(page, "Clean PDF");
    await compare(page);
    await expect(page).toHaveURL(/\/edit$/);
    const id = page.url().match(/proposals\/([0-9a-f-]{36})/)![1]!;

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Proposals", exact: true })).toBeVisible();
    await scan(page, "proposals list");

    await page.goto(`/proposals/${id}`);
    await page.getByRole("button", { name: "Mark as sent" }).click();
    await expect(page.getByText(/Follow up in 3 days/)).toBeVisible();
    await scan(page, "proposal page");
  });
}

test("reading progress and a two-month review pass axe", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/invoices/extract/stream", async (route) => {
    await held;
    await route.continue();
  });
  // The second sample is moved to November on its way to /combine (both samples are October invoices).
  await page.route("**/invoices/combine", async (route) => {
    const body = route.request().postDataJSON() as { invoices: { customer_name: string; period_start: string; period_end: string }[] };
    body.invoices.forEach((invoice) => {
      if (invoice.customer_name?.startsWith("Gulf Spice")) Object.assign(invoice, { period_start: "2026-11-01", period_end: "2026-11-30" });
    });
    await route.fulfill({ response: await route.fetch({ postData: JSON.stringify(body) }) });
  });
  await openApp(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([sample("sample-1-al-noor-mobile.pdf"), sample("sample-2-gulf-spice.pdf")]);
  await expect(page.getByText("Invoice 1 of 2", { exact: false })).toBeVisible();
  await scan(page, "reading progress");
  release();
  await expect(page.getByRole("main")).toContainText("68 shipments read from 2 invoices");
  await scan(page, "two-month review");
});

for (const mode of [
  { name: "English, light, desktop", language: "en", colorScheme: "light", viewport: { width: 1300, height: 900 } },
  { name: "Arabic, dark, phone", language: "ar", colorScheme: "dark", viewport: { width: 390, height: 844 } },
] as const) {
  test(`the customer's page passes axe (${mode.name})`, async ({ page, context }) => {
    await openApp(page);
    await loadSample(page, "Clean PDF");
    await compare(page);
    await expect(page).toHaveURL(/\/edit$/);
    const id = page.url().match(/proposals\/([0-9a-f-]{36})/)![1]!;
    const api = "http://localhost:18765/api/v1";
    if (mode.language === "ar") {
      const detail = await (await page.request.get(`${api}/proposals/${id}`)).json();
      await page.request.patch(`${api}/proposals/${id}`, { data: { partner: { ...detail.partner, language: "ar" } } });
    }
    const link = await (await page.request.post(`${api}/proposals/${id}/share`)).json();
    const customer = await context.newPage();
    await customer.setViewportSize(mode.viewport);
    await customer.emulateMedia({ colorScheme: mode.colorScheme, reducedMotion: "reduce" });
    await customer.goto(link.path);
    await expect(customer.locator("#saving-title")).toBeVisible();
    await scan(customer, "customer page");
  });
}
