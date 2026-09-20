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

    // Verify price element
    const price = page.locator("text=/BHD|BD|د.ب|\\d+(\\.\\d{2,3})?/i").first();
    await expect(price).toBeVisible();

    // Verify product image or gallery container
    const imageContainer = page.locator('img, [data-zoom], [class*="aspect-"]').first();
    await expect(imageContainer).toBeVisible();
  });

  test("renders ProductAccordion with expandable information sections", async ({ page }) => {
    await page.goto(`/pura/product/${sampleProductId}?preview=1&design=2`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    // Find accordion trigger buttons
    const accordionTriggers = page.locator("button[aria-expanded], [data-accordion] button");
    const count = await accordionTriggers.count();

    if (count > 0) {
      const firstTrigger = accordionTriggers.first();
      await expect(firstTrigger).toBeVisible();

      // Test expanding and collapsing
      const initialExpanded = await firstTrigger.getAttribute("aria-expanded");
      await firstTrigger.click();
      await page.waitForTimeout(300);
      const afterExpanded = await firstTrigger.getAttribute("aria-expanded");
      expect(afterExpanded).not.toBe(initialExpanded);
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
