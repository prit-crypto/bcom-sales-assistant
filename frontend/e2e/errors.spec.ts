import path from "node:path";
import { expect, test } from "@playwright/test";
import { compare, loadSample, openApp, sample } from "./helpers";

test("no-AI mode: AI-only samples are disabled and no setting names are shown", async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole("button", { name: /Phone photo/ })).toBeDisabled();
  expect(await page.content()).not.toContain("AI_PROVIDER");
});

test("a fake PDF is refused with a clear message", async ({ page }) => {
  await openApp(page);
  await page.locator("input[type=file]").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("just text") });
  await expect(page.getByText("Upload a PDF, JPG, PNG or WEBP file, or a CSV or Excel statement.")).toBeVisible();
});

test("a photo without AI reading is explained", async ({ page }) => {
  await openApp(page);
  await page.locator("input[type=file]").setInputFiles(sample("sample-2-gulf-spice-photo.jpg"));
  await expect(page.getByText(/Mock mode reads only the sample PDF/)).toBeVisible();
});

test("a half-typed currency blocks Compare; an unknown currency cannot be compared", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await page.getByRole("button", { name: /Edit details/ }).click();
  await page.getByLabel("Currency").fill("AE");
  await expect(page.getByRole("button", { name: "Compare with BCOM rates" })).toBeDisabled();
  await page.getByLabel("Currency").fill("CHF");
  await page.getByRole("button", { name: "Compare with BCOM rates" }).click();
  await expect(page.getByText("No shipments could be compared yet")).toBeVisible();
});

test("backend down: a clear message instead of a crash", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("Invoice reading isn't available right now")).toBeVisible();
  await expect(page.getByText("Could not reach the server").first()).toBeVisible();
  await page.locator("input[type=file]").setInputFiles(path.join(__dirname, "..", "public", "samples", "sample-1-al-noor-mobile.pdf"));
  await expect(page.getByText("Could not read the invoice")).toBeVisible();
});

test("AI switched on without a key: the reason is shown", async ({ page }) => {
  await page.route("**/api/v1/config", (route) =>
    route.fulfill({
      json: {
        provider: null,
        problem: "AI_PROVIDER is gemini but GEMINI_API_KEY is empty in .env.",
        max_upload_mb: 10,
        privacy_notice: null,
        samples_only: false,
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("GEMINI_API_KEY is empty")).toBeVisible();
});

test("comparison failure is shown on the shipments step", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await page.route("**/api/v1/comparisons", (route) =>
    route.fulfill({ status: 500, json: { error: { code: "internal_error", message: "Something went wrong. Please try again." } } }),
  );
  await page.getByRole("button", { name: "Compare with BCOM rates" }).click();
  await expect(page.getByText("Could not compare the shipments")).toBeVisible();
  await page.unroute("**/api/v1/comparisons");
  await compare(page);
});
