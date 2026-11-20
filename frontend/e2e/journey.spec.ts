import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { compare, headline, loadSample, openApp, sample } from "./helpers";

test("full journey: sample 1 to proposal PDF and WhatsApp link", async ({ page }) => {
  await openApp(page);
  await page.locator("input[type=file]").setInputFiles(sample("sample-1-al-noor-mobile.pdf"));
  await expect(page.getByRole("heading", { name: "Check the shipments" })).toBeVisible();
  await expect(page.locator("body")).toContainText("46 shipments read");

  await compare(page);
  await expect.poll(() => headline(page)).toContain("AED 1,854");

  await page.getByRole("radio", { name: "Route" }).click();
  await expect(page.getByText("Dubai to", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: /not on the rate card/ }).click();
  await expect(page.getByText("Destination BR is not on the sample rate card").first()).toBeVisible();

  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByRole("heading", { name: "Customer proposal" })).toBeVisible();
  await expect(page.getByLabel("Prospect")).toHaveValue("Al Noor Mobile Accessories Trading LLC");
  await expect(page.getByText("Preview up to date")).toBeVisible();

  await page.getByLabel("Your name").fill("Aisha Khan");
  await expect(page.getByText("Preview up to date")).toBeVisible();
  await page.getByLabel("Your name").fill("");
  await expect(page.getByRole("button", { name: "Next: WhatsApp" })).toBeDisabled();
  await page.getByLabel("Your name").fill("Aisha Khan");
  await expect(page.getByText("Preview up to date")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download PDF/ }).click();
  const download = await downloadPromise;
  const pdf = readFileSync((await download.path())!);
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(download.suggestedFilename()).toBe("BCOM-proposal-Al-Noor-Mobile-Accessories-Trading-LLC.pdf");

  await page.getByRole("button", { name: "Next: WhatsApp" }).click();
  const message = page.locator("#whatsapp-message");
  await expect(message).toBeVisible();
  await expect(message).toHaveValue(/every month/);
  await expect(message).toHaveValue(/Aisha Khan/);
  await message.fill(`${await message.inputValue()}\nThanks!`);
  await expect(page.getByText("Standard template · edited")).toBeVisible();
  await page.locator("#whatsapp-phone").fill("+971 50 123 4567");
  const href = await page.getByRole("link", { name: "Open in WhatsApp" }).getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/971501234567\?text=/);
  expect(decodeURIComponent(href!)).toContain("Thanks!");
});

test("progress dots go back; editing locks later steps", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await compare(page);
  await page.getByRole("button", { name: "Go to Check shipments" }).click();
  await page.getByRole("button", { name: /Edit details/ }).click();
  await page.getByLabel("Period from").fill("");
  await page.getByLabel("Period to").fill("");
  await expect(page.getByRole("button", { name: "Go to Savings" })).toHaveCount(0);
  await compare(page);
  await expect(page.getByText("Billing period unknown")).toBeVisible();
});

test("unsaved work survives a page refresh, and Discard starts over", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "PDF with gaps");
  const weight = page.getByRole("textbox", { name: "Weight in kg for SWL 5630 8276 09" });
  await weight.fill("12");
  await weight.press("Enter");

  await page.reload();
  await expect(page.getByText("Restored your last session")).toBeVisible();
  await expect(page.getByRole("button", { name: /Weight in kg for SWL 5630 8276 09: 12 kg/ })).toBeVisible();
  // The invoice file came back too, so it can still be viewed.
  await expect(page.getByRole("button", { name: "Show invoice" })).toBeVisible();

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("No invoice to hand? Try a sample")).toBeVisible();
  await page.reload();
  await expect(page.getByText("No invoice to hand? Try a sample")).toBeVisible();
  await expect(page.getByText("Restored your last session")).toHaveCount(0);
});

test("compared work is saved and reopens from the server after a refresh", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "PDF with gaps");
  const weight = page.getByRole("textbox", { name: "Weight in kg for SWL 5630 8276 09" });
  await weight.fill("12");
  await weight.press("Enter");
  await compare(page);
  await expect(page.getByText(/Saved to your proposals · BCOM-P-/)).toBeVisible();
  await expect(page).toHaveURL(/\/proposals\/[0-9a-f-]{36}\/edit$/);

  await page.reload();
  await expect(page.locator("#savings-title")).toBeVisible();
  await expect(page.getByText("Restored your last session")).toHaveCount(0);
  await page.getByRole("button", { name: "Go to Check shipments" }).click();
  await expect(page.getByRole("button", { name: /Weight in kg for SWL 5630 8276 09: 12 kg/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show invoice" })).toBeVisible();

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page).toHaveURL(/\/new$/);
  await page.reload();
  await expect(page.getByText("No invoice to hand? Try a sample")).toBeVisible();
});

test("undo: toast button, Undo button and ⌘Z", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "PDF with gaps");
  const weight = page.getByRole("textbox", { name: "Weight in kg for SWL 5630 8276 09" });
  await weight.fill("12");
  await weight.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Weight set to 12 kg" })).toBeVisible();

  await page.getByRole("status").filter({ hasText: "Weight set to 12 kg" }).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("textbox", { name: "Weight in kg for SWL 5630 8276 09" })).toBeVisible();

  await page.getByRole("checkbox", { name: "Include shipment SWL 5161 3959 39" }).uncheck();
  await expect(page.getByText("SWL 5161 3959 39 left out")).toBeVisible();
  await page.getByRole("heading", { name: "Check the shipments" }).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("checkbox", { name: "Include shipment SWL 5161 3959 39" })).toBeChecked();
});

test("inline editing with the keyboard", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await page.getByRole("button", { name: /^Waybill for SWL/ }).first().focus();
  await page.keyboard.press("Enter");
  const field = page.getByRole("textbox", { name: /^Waybill for SWL/ }).first();
  await field.press("End");
  await field.type("X");
  await field.press("Escape");
  await expect(page.getByRole("textbox", { name: /^Waybill for SWL/ })).toHaveCount(0);
});

test("original invoice shows beside the table", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await page.getByRole("button", { name: "Show invoice" }).click();
  const viewer = page.getByRole("region", { name: "Original invoice" });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("iframe")).toHaveAttribute("title", "Invoice sample-1-al-noor-mobile.pdf");
  await page.getByRole("button", { name: "Hide invoice" }).click();
  await expect(viewer).toHaveCount(0);
});

test("a USD invoice is converted at the peg", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await page.getByRole("button", { name: /Edit details/ }).click();
  await page.getByLabel("Currency").fill("USD");
  await compare(page);
  await expect(page.getByText("Converted from USD")).toBeVisible();
  await expect(page.getByText(/converted at 3\.6725 AED per USD/)).toBeVisible();
});

test("no saving: headline says so and the proposal is disabled", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "PDF with gaps");
  const rows = page.locator("table tbody tr");
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const to = (await rows.nth(index).locator("td").nth(4).innerText()).trim();
    if (!to.endsWith("AE")) await rows.nth(index).getByRole("checkbox").uncheck();
  }
  await compare(page);
  await expect.poll(() => headline(page)).toContain("more a month");
  await expect(page.getByRole("button", { name: "Create proposal" })).toBeDisabled();
});
