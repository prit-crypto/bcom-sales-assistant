import { expect, test, type Page } from "@playwright/test";
import { compare, loadSample, openApp } from "./helpers";

const API = "http://localhost:18765/api/v1";

async function saveSample(page: Page): Promise<string> {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await compare(page);
  await expect(page).toHaveURL(/\/edit$/);
  return page.url().match(/proposals\/([0-9a-f-]{36})/)![1]!;
}

async function createLink(page: Page, id: string): Promise<string> {
  await page.goto(`/proposals/${id}`);
  await page.getByRole("button", { name: "Create customer link" }).click();
  const field = page.getByRole("textbox", { name: "Customer link" });
  await expect(field).toHaveValue(/\/p\/[A-Za-z0-9_-]{20,}$/);
  return field.inputValue();
}

test("the customer opens the link and accepts; the partner sees it won", async ({ page, context }) => {
  const id = await saveSample(page);
  const url = await createLink(page, id);

  const customer = await context.newPage();
  await customer.goto(url);
  await expect(customer.getByRole("heading", { name: /Al Noor Mobile Accessories Trading LLC could save/ })).toBeVisible();
  await expect(customer.getByText("Where you save")).toBeVisible();
  // No way into the partner screens from the customer's page.
  await expect(customer.getByRole("link", { name: /Proposals|Start over/ })).toHaveCount(0);
  await customer.getByLabel("Your name").fill("Fatima Al Zahra");
  await customer.getByLabel(/Note for your partner/).fill("Please start in December");
  await customer.getByRole("button", { name: "Accept proposal" }).click();
  await expect(customer.getByText("Proposal accepted")).toBeVisible();
  await expect(customer.getByText(/Accepted by Fatima Al Zahra/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/^Won .*Accepted online by Fatima Al Zahra: "Please start in December"$/)).toBeVisible();
  await expect(page.getByText(/Opened Today/)).toBeVisible();
  // The partner's page has no history list.
  await expect(page.getByRole("heading", { name: "History" })).toHaveCount(0);
});

test("a turned-off link stops working", async ({ page, context }) => {
  const id = await saveSample(page);
  const url = await createLink(page, id);
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByRole("button", { name: "Create customer link" })).toBeVisible();
  const customer = await context.newPage();
  await customer.goto(url);
  await expect(customer.getByText("This link doesn't work")).toBeVisible();
});

test("an Arabic proposal opens right to left for the customer", async ({ page, context }) => {
  const id = await saveSample(page);
  const detail = await (await page.request.get(`${API}/proposals/${id}`)).json();
  await page.request.patch(`${API}/proposals/${id}`, { data: { partner: { ...detail.partner, language: "ar" } } });
  const url = await createLink(page, id);
  const customer = await context.newPage();
  await customer.goto(url);
  await expect(customer.getByRole("heading", { name: "قبول هذا العرض" })).toBeVisible();
  await expect(customer.locator("[dir=rtl]").first()).toBeVisible();
});

test("where the PDF can't be shared, the message gets the customer link by itself", async ({ page }) => {
  await saveSample(page);
  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByText("Preview up to date")).toBeVisible();
  await page.getByRole("button", { name: "Next: WhatsApp" }).click();
  const message = page.locator("#whatsapp-message");
  await expect(message).toHaveValue(/every month/);
  await expect(message).toHaveValue(/View, download and accept the proposal online: http:\/\/localhost:13765\/p\//);
  await expect(page.getByText("Standard template · edited")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open in WhatsApp" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share PDF" })).toHaveCount(0);
});

test("where the device can share files, Share PDF sends the PDF and the message together", async ({ page }) => {
  // A phone's share menu, stood in for: records what the page hands to it.
  await page.addInitScript(() => {
    const shared: { names: string[]; types: string[]; text: string }[] = [];
    Object.assign(window, { __shared: shared });
    Object.assign(navigator, {
      canShare: (data: ShareData) => Boolean(data.files?.length),
      share: async (data: ShareData) => {
        shared.push({ names: (data.files ?? []).map((f) => f.name), types: (data.files ?? []).map((f) => f.type), text: data.text ?? "" });
      },
    });
  });
  await saveSample(page);
  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByText("Preview up to date")).toBeVisible();
  await page.getByRole("button", { name: "Next: WhatsApp" }).click();
  const message = page.locator("#whatsapp-message");
  await expect(message).toHaveValue(/every month/);
  // The PDF goes with the message, so no link is added.
  await expect(message).not.toHaveValue(/\/p\//);

  await page.getByRole("button", { name: "Share PDF" }).click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { names: string[]; types: string[]; text: string }[] }).__shared);
  expect(shared).toHaveLength(1);
  const [sent] = shared;
  expect(sent?.names).toEqual([expect.stringMatching(/^BCOM-proposal-.*\.pdf$/)]);
  expect(sent?.types).toEqual(["application/pdf"]);
  expect(sent?.text).toContain("every month");
  await expect(page.getByRole("link", { name: "Text only" })).toHaveAttribute("href", /^https:\/\/wa\.me\//);
});
