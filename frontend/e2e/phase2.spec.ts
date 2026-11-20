import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { compare, headline, loadSample, openApp, sample } from "./helpers";

const PUBLIC = path.resolve(__dirname, "..", "public");

async function toProposal(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByRole("heading", { name: "Customer proposal" })).toBeVisible();
  await expect(page.getByText("Preview up to date")).toBeVisible();
}

/** Value of the waybill cell buttons, in table order. */
async function waybills(page: Page): Promise<string[]> {
  const labels = await page.getByRole("button", { name: /^Waybill for / }).evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label") ?? ""),
  );
  return labels.map((label) => label.replace(/^Waybill for (.+?): .*$/, "$1"));
}

test.describe("checks on the shipments", () => {
  test("a changed charge no longer matches the printed subtotal", async ({ page }) => {
    await openApp(page);
    await loadSample(page, "Clean PDF");
    await expect(page.getByText("Worth a second look")).toHaveCount(0);
    await page.getByRole("button", { name: /^Charge for .*Edit$/ }).first().click();
    await page.getByRole("textbox", { name: /^Charge for / }).fill("999");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Worth a second look")).toBeVisible();
    await expect(page.getByText(/but the invoice subtotal says/)).toBeVisible();
    // Undo puts the charge back and the warning goes away.
    await page.getByRole("button", { name: "Undo", exact: true }).first().click();
    await expect(page.getByText("Worth a second look")).toHaveCount(0);
  });

  test("the same waybill twice is flagged on both rows", async ({ page }) => {
    await openApp(page);
    await loadSample(page, "Clean PDF");
    const [first, second] = await waybills(page);
    await page.getByRole("button", { name: `Waybill for ${first}: ${first}. Edit` }).click();
    await page.getByRole("textbox", { name: `Waybill for ${first}` }).fill(second!);
    await page.keyboard.press("Enter");
    await expect(page.getByText(new RegExp(`Waybill ${second} appears 2 times`))).toBeVisible();
    await page.getByRole("button", { name: "Show", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Second look · 2" })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("table").getByText(/^Check: Same waybill/)).toHaveCount(2);
  });

  test("a value the reader wasn't sure of is marked until it is checked", async ({ page }) => {
    await page.route("**/api/v1/invoices/extract", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.invoice.shipments[0].uncertain_fields = ["weight_kg"];
      await route.fulfill({ response, json: body });
    });
    await openApp(page);
    await loadSample(page, "Clean PDF");
    await expect(page.getByText(/The reader wasn.t sure about 1 value/)).toBeVisible();
    const cell = page.getByRole("button", { name: /^Weight in kg for .*Reader wasn't sure\. Edit$/ });
    await expect(cell).toHaveCount(1);
    await cell.click();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Weight confirmed/)).toBeVisible();
    await expect(page.getByText("Worth a second look")).toHaveCount(0);
  });
});

test("what if: Economy for non-urgent parcels, more volume, reset, and the PDF follows", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await compare(page);
  await expect.poll(() => headline(page)).toContain("AED 1,854");

  await page.getByRole("switch", { name: "Send non-urgent parcels by Economy" }).click();
  await expect.poll(() => headline(page)).toContain("AED 3,916");
  await expect(page.getByText("Non-urgent by Economy").first()).toBeVisible();
  await expect(page.getByText(/a month like for like, or/)).toBeVisible();
  await expect(page.getByRole("table").filter({ hasText: "Delivery times the prospect trades for it" })).toBeVisible();

  await page.getByRole("button", { name: "Reset to like for like" }).click();
  await expect.poll(() => headline(page)).toContain("AED 1,854");

  await page.getByRole("radio", { name: "+20%" }).click();
  await expect.poll(() => headline(page)).toContain("AED 2,22");
  await expect(page.getByText("+20% volume")).toBeVisible();

  const proposalRequest = page.waitForRequest((request) => request.url().endsWith("/proposals"));
  await page.getByRole("button", { name: "Create proposal" }).click();
  expect((await proposalRequest).postDataJSON().scenario).toEqual({ volume_factor: 1.2, economy_for_non_urgent: false });
});

test("Download Excel gives a real workbook", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await compare(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Excel" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("BCOM-comparison-Al-Noor-Mobile-Accessories-Trading-LLC.xlsx");
  const file = readFileSync((await download.path())!);
  expect(file.subarray(0, 2).toString()).toBe("PK");
});

test("Arabic proposal and message, partner logo and booking link", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await compare(page);
  await toProposal(page);

  // Logo: preview on the form, sent with the next PDF.
  const withLogo = page.waitForRequest(
    (request) => request.url().endsWith("/proposals") && String(request.postDataJSON()?.partner?.partner_logo).startsWith("data:image/png"),
  );
  await page.getByLabel("Add logo").setInputFiles(path.join(PUBLIC, "brand", "bcom-icon.png"));
  await expect(page.getByRole("img", { name: "Your logo" })).toBeVisible();
  await withLogo;
  await expect(page.getByText("Preview up to date")).toBeVisible();

  // A half-typed link is not sent; a full one is.
  await page.getByLabel("Booking link").fill("cal.com/aisha");
  await expect(page.getByText(/Use a full link starting with https:\/\//)).toBeVisible();
  const withLink = page.waitForRequest(
    (request) => request.url().endsWith("/proposals") && request.postDataJSON()?.partner?.booking_url === "https://cal.com/aisha",
  );
  await page.getByLabel("Booking link").fill("https://cal.com/aisha");
  await withLink;

  const arabic = page.waitForRequest((request) => request.url().endsWith("/proposals") && request.postDataJSON()?.partner?.language === "ar");
  await page.getByRole("radio", { name: "العربية" }).click();
  await arabic;
  await expect(page.getByText(/Ask a native speaker to check them/)).toBeVisible();
  await expect(page.getByText("Preview up to date")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download PDF/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-ar\.pdf$/);
  expect(readFileSync((await download.path())!).subarray(0, 4).toString()).toBe("%PDF");

  await page.getByRole("button", { name: "Next: WhatsApp" }).click();
  const message = page.locator("#whatsapp-message");
  await expect(message).toHaveAttribute("dir", "rtl");
  await expect(message).toHaveValue(/[؀-ۿ]/);
  await expect(message).toHaveValue(/https:\/\/cal\.com\/aisha/);
});

test("the CSV template reads back without AI", async ({ page }) => {
  await openApp(page);
  const template = page.getByRole("link", { name: "Download the CSV template" });
  await expect(template).toHaveAttribute("href", "/templates/bcom-shipments-template.csv");
  await page.locator("input[type=file]").first().setInputFiles(path.join(PUBLIC, "templates", "bcom-shipments-template.csv"));
  await expect(page.getByRole("heading", { name: "Check the shipments" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("2 shipments read from bcom-shipments-template.csv");
  await expect(page.getByRole("button", { name: "Show invoice" })).toHaveCount(0);
  await compare(page);
});

test.describe("upload screen", () => {
  test("the guide shows on the first visit only, and comes back from its link", async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole("heading", { name: "How this works" })).toBeVisible();
    await page.getByRole("button", { name: "Got it" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "How it works" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How this works" })).toHaveCount(0);
    await page.getByRole("button", { name: "How it works" }).click();
    await expect(page.getByRole("heading", { name: "How this works" })).toBeVisible();
  });

  test("sample mode is labelled, and the page sends security headers", async ({ page }) => {
    const response = await page.goto("/");
    await expect(page.getByText("Sample mode")).toBeVisible();
    const headers = response!.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("free AI tier and samples-only servers say so", async ({ page }) => {
    let samplesOnly = false;
    await page.route("**/api/v1/config", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({
        response,
        json: { ...body, privacy_notice: "Free AI tier: use sample invoices only, not real customer invoices.", samples_only: samplesOnly },
      });
    });
    await openApp(page);
    await expect(page.getByText("Free AI tier: use sample invoices only")).toBeVisible();
    samplesOnly = true;
    await page.reload();
    await expect(page.getByText("This demo server reads only the sample invoices")).toBeVisible();
  });
});

test("a refreshed page keeps the what-if", async ({ page }) => {
  await openApp(page);
  await page.locator("input[type=file]").first().setInputFiles(sample("sample-1-al-noor-mobile.pdf"));
  await compare(page);
  await page.getByRole("switch", { name: "Send non-urgent parcels by Economy" }).click();
  await expect.poll(() => headline(page)).toContain("AED 3,916");
  await page.reload();
  await expect.poll(() => headline(page)).toContain("AED 3,916");
  await expect(page.getByRole("switch", { name: "Send non-urgent parcels by Economy" })).toHaveAttribute("aria-checked", "true");
});
