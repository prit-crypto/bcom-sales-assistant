import { expect, test } from "@playwright/test";
import { compare, headline, loadSample, openApp } from "./helpers";

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("cards, no sideways scrolling, preview sheet", async ({ page }) => {
    const noSidewaysScroll = async () =>
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await openApp(page);
    await noSidewaysScroll();
    await loadSample(page, "Clean PDF");
    await expect(page.locator("article")).toHaveCount(46);
    await noSidewaysScroll();

    await compare(page);
    await noSidewaysScroll();
    await page.getByRole("button", { name: "Create proposal" }).click();
    const preview = page.getByRole("button", { name: "Preview PDF" });
    await expect(preview).toBeEnabled();
    await preview.click();
    await expect(page.getByRole("dialog", { name: "Proposal preview" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("invoice opens in a sheet on phones", async ({ page }) => {
    await openApp(page);
    await loadSample(page, "Clean PDF");
    await page.getByRole("button", { name: "Show invoice" }).click();
    await expect(page.getByRole("dialog", { name: "Original invoice" })).toBeVisible();
  });
});

test.describe("reduced motion and dark mode", () => {
  test.use({ reducedMotion: "reduce", colorScheme: "dark" });

  test("final values at once, dark canvas, no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await openApp(page);
    await loadSample(page, "Clean PDF");
    await compare(page);
    // No count-up: the visible number is final straight away.
    expect(await page.locator("#savings-title [aria-hidden=true]").first().innerText()).toBe("AED 1,854");
    expect(await headline(page)).toContain("AED 1,854");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(13, 17, 23)");
    expect(errors).toEqual([]);
  });
});

test("keyboard: the segmented control moves with arrow keys", async ({ page }) => {
  await openApp(page);
  await loadSample(page, "Clean PDF");
  await compare(page);
  await page.getByRole("radio", { name: "Region" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Route" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Route" })).toBeFocused();
});
