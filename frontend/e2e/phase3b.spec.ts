import { expect, test, type Page, type Route } from "@playwright/test";
import { compare, loadSample, openApp, sample } from "./helpers";

const API = "http://localhost:18765/api/v1";

const CORS = { "Access-Control-Allow-Origin": "*" };

/**
 * Both SwiftLine samples are October invoices. To combine them, the Gulf Spice reading is moved to November
 * on its way to /invoices/combine. (Uploads picked from disk can't be re-sent from a test, so the reads
 * themselves are left alone.)
 */
async function moveSample2ToNovember(page: Page): Promise<void> {
  await page.route("**/invoices/combine", async (route: Route) => {
    const body = route.request().postDataJSON() as { invoices: { customer_name: string; period_start: string; period_end: string }[] };
    for (const invoice of body.invoices) {
      if (invoice.customer_name?.startsWith("Gulf Spice")) {
        invoice.period_start = "2026-11-01";
        invoice.period_end = "2026-11-30";
      }
    }
    await route.fulfill({ response: await route.fetch({ postData: JSON.stringify(body) }) });
  });
}

test("reading shows its stages while it works", async ({ page }) => {
  await page.route("**/invoices/extract/stream", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await openApp(page);
  await page.locator("input[type=file]").first().setInputFiles(sample("sample-1-al-noor-mobile.pdf"));
  const progress = page.getByRole("status").filter({ hasText: "sample-1-al-noor-mobile.pdf" });
  await expect(progress.getByText("Uploaded")).toBeVisible();
  await expect(progress.getByText("Reading the invoice")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check the shipments" })).toBeVisible();
});

test("a broken stream falls back to the plain read; a reading error from the stream is shown", async ({ page }) => {
  await page.route("**/invoices/extract/stream", (route) => route.fulfill({ status: 200, json: {}, headers: CORS }));
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await expect(page.getByRole("main")).toContainText("46 shipments read");

  await page.unroute("**/invoices/extract/stream");
  await page.route("**/invoices/extract/stream", (route) =>
    route.fulfill({
      status: 200,
      headers: CORS,
      contentType: "text/event-stream",
      body: 'event: stage\ndata: {"stage":"received"}\n\nevent: error\ndata: {"code":"ai_busy","message":"The reader is busy. Try again in a minute."}\n\n',
    }),
  );
  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("button", { name: "Use sample: Clean PDF" }).click();
  await expect(page.getByText("The reader is busy. Try again in a minute.")).toBeVisible();
});

test("two invoices from the same month are refused, with the reason", async ({ page }) => {
  await openApp(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([sample("sample-1-al-noor-mobile.pdf"), sample("sample-2-gulf-spice.pdf")]);
  await expect(page.getByText(/Two invoices cover the same dates/)).toBeVisible();
});

test("two months in one proposal: combined rows, an average over both, both files saved", async ({ page }) => {
  await moveSample2ToNovember(page);
  await openApp(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([sample("sample-1-al-noor-mobile.pdf"), sample("sample-2-gulf-spice.pdf")]);
  await expect(page.getByRole("heading", { name: "Check the shipments" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("68 shipments read from 2 invoices (01 Oct 2026 – 30 Nov 2026)");
  await expect(page.locator("table").getByText("Inv 2").first()).toBeVisible();

  // The viewer can show either invoice.
  await page.getByRole("button", { name: "Show invoice" }).click();
  await page.getByRole("radio", { name: "Invoice 2" }).click();
  await expect(page.getByRole("radio", { name: "Invoice 2" })).toHaveAttribute("aria-checked", "true");

  await compare(page);
  await expect(page).toHaveURL(/\/edit$/);
  const id = page.url().match(/proposals\/([0-9a-f-]{36})/)![1]!;
  const saved = await (await page.request.get(`${API}/proposals/${id}`)).json();
  expect(saved.source_files).toEqual(["sample-1-al-noor-mobile.pdf", "sample-2-gulf-spice.pdf"]);
  expect(saved.total_shipments).toBe(68);
});

test("add another month on the shipments step, and undo it", async ({ page }) => {
  await moveSample2ToNovember(page);
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await page.getByLabel("Add another month").setInputFiles(sample("sample-2-gulf-spice.pdf"));
  await expect(page.getByRole("main")).toContainText("68 shipments read from 2 invoices");
  await expect(page.getByText("Added sample-2-gulf-spice.pdf")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(page.getByRole("main")).toContainText("46 shipments read");
});

test("a partner's correction is recorded for learning", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await page.getByRole("button", { name: /^Weight in kg for .*Edit$/ }).first().click();
  await page.getByRole("textbox", { name: /^Weight in kg for / }).fill("4.5");
  await page.keyboard.press("Enter");
  await compare(page);
  await expect(page).toHaveURL(/\/edit$/);

  const report = await (await page.request.get(`${API}/insights/reading`)).json();
  const mock = report.readers.find((reader: { provider: string }) => reader.provider === "mock");
  expect(mock.corrections).toBeGreaterThanOrEqual(1);
  expect(report.most_corrected.some((group: { field: string }) => group.field === "weight_kg")).toBe(true);
});
