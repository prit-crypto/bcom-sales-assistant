import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { compare, loadSample, openApp } from "./helpers";

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
