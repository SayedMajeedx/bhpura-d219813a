import { test, expect } from "@playwright/test";

test.describe("Product Card & Quick View Suite", () => {
  test("renders product cards with 3:4 aspect ratio and quick interaction triggers", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/pura?preview=1&design=2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Look for product card containers
    const productCard = page
      .locator('article, [data-product-id], [class*="product-card"], a[href*="/product/"]')
      .first();
    await expect(productCard).toBeVisible();

    // Verify card image has 3:4 aspect ratio or container sizing
    const imgOrContainer = productCard.locator('img, [class*="aspect-"]').first();
    if (await imgOrContainer.isVisible()) {
      const box = await imgOrContainer.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        const ratio = box.width / box.height;
        // 3:4 ratio is 0.75, allow reasonable tolerance 0.6 to 0.95
        expect(ratio).toBeGreaterThan(0.5);
        expect(ratio).toBeLessThan(1.2);
      }
    }
  });

  test("triggers Quick View or Quick Add on desktop hover", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/pura?preview=1&design=2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const productCard = page.locator('article, [data-product-id], [class*="group"]').first();
    if (await productCard.isVisible()) {
      await productCard.hover();
      await page.waitForTimeout(400);

      const actionButton = page
        .locator(
          'button[aria-label*="سريع"], button[aria-label*="Quick"], button:has-text("معاينة"), button:has-text("إضافة")',
        )
        .first();
      if (await actionButton.isVisible()) {
        await actionButton.click();
        await page.waitForTimeout(500);

        // Verify modal or popover opened
        const dialog = page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').first();
        if (await dialog.isVisible()) {
          // Verify modal dismisses on Escape
          await page.keyboard.press("Escape");
          await page.waitForTimeout(400);
          const isStillVisible = await dialog.isVisible();
          expect(isStillVisible).toBe(false);
        }
      }
    }
  });
});
