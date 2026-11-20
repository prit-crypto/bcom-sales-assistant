import { expect, test, type Page } from "@playwright/test";
import { compare, loadSample, openApp } from "./helpers";

const API = "http://localhost:18765/api/v1";
const MAILPIT = "http://localhost:8025/api/v1";

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
  await expect(page.getByText(/^Won /)).toBeVisible();
  await expect(page.getByText('Accepted online by Fatima Al Zahra: "Please start in December"')).toBeVisible();
  await expect(page.getByText("Customer opened the link")).toBeVisible();
  await expect(page.getByText(/Opened Today/)).toBeVisible();
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

test("emailing the proposal delivers it with the PDF and the link, and marks it sent", async ({ page }) => {
  await page.request.delete(`${MAILPIT}/messages`);
  const id = await saveSample(page);
  await page.goto(`/proposals/${id}`);
  await page.getByRole("button", { name: "Write the email" }).click();
  await expect(page.getByLabel("Subject")).toHaveValue(/Your shipping savings proposal from BCOM Global/);
  await page.getByLabel("To", { exact: true }).fill("ops@alnoor.test");
  await page.getByLabel(/CC/).fill("owner@alnoor.test");
  await page.getByRole("button", { name: "Send email" }).click();
  await expect(page.getByText("Sent to ops@alnoor.test")).toBeVisible();
  await expect(page.getByText("Emailed to ops@alnoor.test (+1 in copy)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Won", exact: true })).toBeVisible(); // now sent

  await expect
    .poll(async () => (await (await page.request.get(`${MAILPIT}/search?query=to:ops@alnoor.test`)).json()).messages_count)
    .toBe(1);
  const found = await (await page.request.get(`${MAILPIT}/search?query=to:ops@alnoor.test`)).json();
  const message = await (await page.request.get(`${MAILPIT}/message/${found.messages[0].ID}`)).json();
  expect(message.Subject).toContain("Al Noor Mobile Accessories Trading LLC");
  expect(message.Cc[0].Address).toBe("owner@alnoor.test");
  expect(message.Attachments).toHaveLength(1);
  expect(message.Attachments[0].FileName).toMatch(/^BCOM-P-.*\.pdf$/);
  expect(message.Text).toMatch(/View and accept the proposal online: http:\/\/localhost:13765\/p\//);
});

test("without email set up, the card says what to do", async ({ page }) => {
  const id = await saveSample(page);
  await page.route("**/email-draft", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), email_enabled: false } });
  });
  await page.goto(`/proposals/${id}`);
  await page.getByRole("button", { name: "Write the email" }).click();
  await expect(page.getByText(/Email isn.t set up on this server yet/)).toBeVisible();
});

test("the WhatsApp step can add the customer link to the message", async ({ page }) => {
  await saveSample(page);
  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByText("Preview up to date")).toBeVisible();
  await page.getByRole("button", { name: "Next: WhatsApp" }).click();
  const message = page.locator("#whatsapp-message");
  await expect(message).toHaveValue(/every month/);
  await page.getByRole("button", { name: "Add the proposal link" }).click();
  await expect(message).toHaveValue(/View and accept the proposal online: http:\/\/localhost:13765\/p\//);
  await expect(page.getByRole("link", { name: "Send by email instead" })).toBeVisible();
});
