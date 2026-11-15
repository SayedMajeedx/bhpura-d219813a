import { test, expect } from "@playwright/test";

test.describe("Product Detail Page 2.0 (PDP) Suite", () => {
  const sampleProductId = "ab6ec951-2032-480b-873b-b1da13bcbd02";

  test("renders product media, pricing, and details cleanly", async ({ page }) => {
    await page.goto(`/pura/product/${sampleProductId}?preview=1&design=2`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    // Verify main product heading
    const title = page.locator("h1").first();
    await expect(title).toBeVisible();

    // Verify the price: a visible amount in the store's currency inside the page. Any number
    // matched first the phone gallery's "1 / 3", which a laptop hides, and the header's
    // currency menu.
    const price = page
      .locator("main")
      .getByText(/(BHD|BD|د\.ب)\s*\d|\d+\.\d{2,3}\s*(BHD|BD|د\.ب)/i)
      .filter({ visible: true })
      .first();
    await expect(price).toBeVisible();

    // Verify product image or gallery container (inside <main>: the header logo is
    // also an <img>, and the mobile header is hidden at desktop width).
    const imageContainer = page
      .locator("main")
      .locator('img, [data-zoom], [class*="aspect-"]')
      .first();
    await expect(imageContainer).toBeVisible();
  });

  test("renders ProductAccordion with expandable information sections", async ({ page }) => {
    await page.goto(`/pura/product/${sampleProductId}?preview=1&design=2`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    // Find accordion trigger buttons (inside <main>: the header menu button also has
    // aria-expanded and is hidden at desktop width).
    // Not a button that opens a dialog (the size guide's also carries aria-expanded).
    const accordionTriggers = page
      .locator("main")
      .locator("button[aria-expanded]:not([aria-haspopup]), [data-accordion] button");
    const count = await accordionTriggers.count();

    if (count > 0) {
      const firstTrigger = accordionTriggers.first();
      await expect(firstTrigger).toBeVisible();

      // Test expanding and collapsing
      // A press before the page has started does nothing, so press until the section answers.
      const initialExpanded = (await firstTrigger.getAttribute("aria-expanded")) ?? "false";
      await expect(async () => {
        await firstTrigger.click();
        await expect(firstTrigger).not.toHaveAttribute("aria-expanded", initialExpanded, {
          timeout: 1000,
        });
      }).toPass({ timeout: 15000 });
    } else {
      // Check for detail tabs or info sections
      const detailsSection = page.locator('details, section, [class*="accordion"]').first();
      await expect(detailsSection).toBeVisible();
    }
  });

  test("supports mobile viewport with responsive layout", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/pura/product/${sampleProductId}?preview=1&design=2`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    const title = page.locator("h1").first();
    await expect(title).toBeVisible();

    // Verify page has no horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});
