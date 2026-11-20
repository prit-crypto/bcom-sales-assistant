import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { compare, loadSample, openApp } from "./helpers";

/** Runs sample 1 to Savings (which saves it) and returns the new proposal's id. */
async function saveSampleProposal(page: Page): Promise<string> {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await compare(page);
  await expect(page).toHaveURL(/\/proposals\/[0-9a-f-]{36}\/edit$/);
  return page.url().match(/proposals\/([0-9a-f-]{36})/)![1]!;
}

function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("an empty pipeline points to the first invoice", async ({ page }) => {
  await page.route("**/api/v1/proposals", (route) => route.fulfill({ json: { items: [], follow_up_due: 0 } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No proposals yet" })).toBeVisible();
  await page.getByRole("link", { name: "Start with an invoice" }).click();
  await expect(page.getByText("No invoice to hand? Try a sample")).toBeVisible();
});

test("a proposal from sent to follow-up, won, lost and reopened, with notes, files and history", async ({ page }) => {
  const id = await saveSampleProposal(page);
  await page.goto(`/proposals/${id}`);
  await expect(page.getByRole("heading", { name: "Al Noor Mobile Accessories Trading LLC" })).toBeVisible();
  await expect(page.getByText("Saved from sample-1-al-noor-mobile.pdf")).toBeVisible();

  await page.getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.getByText(/Follow up in 3 days/)).toBeVisible();

  // Bring the follow-up date forward: it shows under "Follow up today" on the list.
  await page.getByLabel("Follow up on").fill(isoDaysFromToday(-2));
  await expect(page.getByText(/Follow up 2 days ago/)).toBeVisible();
  await page.getByRole("link", { name: "Proposals" }).first().click();
  const due = page.getByRole("region", { name: /Follow up today/ });
  await expect(due.getByRole("link", { name: /Al Noor/ }).first()).toBeVisible();
  await page.getByRole("radio", { name: /^Sent/ }).click();
  const rows = page.getByRole("list", { name: "All proposals" }).getByRole("link");
  await expect(rows.filter({ hasText: "Al Noor" }).first()).toBeVisible();
  await expect(rows.filter({ hasNotText: "Sent" })).toHaveCount(0);
  await page.getByRole("searchbox").fill("nobody like this");
  await expect(page.getByText("No proposals match.")).toBeVisible();

  await page.goto(`/proposals/${id}`);
  await page.getByRole("button", { name: "Won", exact: true }).click();
  await expect(page.getByText(/^Won /)).toBeVisible();
  await page.getByRole("button", { name: "Reopen" }).click();
  await page.getByRole("button", { name: "Lost", exact: true }).click();
  await page.getByLabel(/Why was it lost/).fill("Stayed with their courier");
  await page.getByRole("button", { name: "Mark as lost" }).click();
  await expect(page.getByText("Marked as lost: Stayed with their courier")).toBeVisible();

  await page.getByRole("textbox", { name: "Notes" }).fill("Spoke to Fatima, call again after Eid");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const pdfPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const pdf = await pdfPromise;
  expect(readFileSync((await pdf.path())!).subarray(0, 4).toString()).toBe("%PDF");
  await expect(page.getByText("PDF downloaded")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("Spoke to Fatima, call again after Eid");
  await expect(page.getByText("Notes updated")).toBeVisible();

  await page.getByRole("link", { name: /editing/ }).click();
  await expect(page.locator("#savings-title")).toBeVisible();
});

test("Mark as sent from the WhatsApp step, and delete", async ({ page }) => {
  const id = await saveSampleProposal(page);
  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByText("Preview up to date")).toBeVisible();
  await page.getByRole("button", { name: "Next: WhatsApp" }).click();
  await expect(page.locator("#whatsapp-message")).toHaveValue(/every month/);
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.getByText("Marked as sent")).toBeVisible();
  await page.getByRole("link", { name: "See proposal" }).click();
  await expect(page).toHaveURL(new RegExp(`/proposals/${id}$`));
  // The message written on the last step was saved with the proposal.
  await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible();

  await page.getByRole("button", { name: "Delete proposal" }).click();
  await page.getByRole("button", { name: "Delete for good" }).click();
  await expect(page.getByRole("heading", { name: "Proposals", exact: true })).toBeVisible();
  await page.goto(`/proposals/${id}`);
  await expect(page.getByText("This proposal no longer exists")).toBeVisible();
});

test("the partner's own details are remembered for the next proposal", async ({ page }) => {
  await saveSampleProposal(page);
  await page.getByRole("button", { name: "Create proposal" }).click();
  await page.getByLabel("Your name").fill("Aisha Khan");
  await page.getByLabel("Your company").fill("Ajman Freight Partners");

  await saveSampleProposal(page);
  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByLabel("Your name")).toHaveValue("Aisha Khan");
  await expect(page.getByLabel("Your company")).toHaveValue("Ajman Freight Partners");
});
