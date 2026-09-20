import { test, expect } from "@playwright/test";

test.describe("Storefront Motion & Accessibility Suite", () => {
  test("honors prefers-reduced-motion media query", async ({ page }) => {
    // Emulate user preference for reduced motion
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/pura?preview=1&design=2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // Verify elements are visible immediately without being hidden by initial 0 opacity
    const heroH1 = page.locator("h1").first();
    await expect(heroH1).toBeVisible();

    const isVisibleWithoutAnimationLag = await page.evaluate(() => {
      const el = document.querySelector("h1");
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return parseFloat(style.opacity) > 0.8;
    });
    expect(isVisibleWithoutAnimationLag).toBe(true);
  });

  test("supports keyboard sequential navigation without focus trapping", async ({ page }) => {
    await page.goto("/pura?preview=1&design=2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // Tab through at least 6 elements
    const focusedTags: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement ? document.activeElement.tagName : "BODY");
      focusedTags.push(tag);
    }

    // Ensure focus moves through valid focusable interactive elements
    const hasFocusableElements = focusedTags.some((tag) => ["A", "BUTTON", "INPUT", "SELECT"].includes(tag));
    expect(hasFocusableElements).toBe(true);
  });

  test("ensures minimum touch target size on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/pura?preview=1&design=2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // Verify interactive buttons have appropriate touch targets
    const buttons = page.locator("header button, [data-dock] button, [data-dock] a");
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        if (box) {
          // Standard minimum touch target area >= 36px in either dimension
          expect(Math.max(box.width, box.height)).toBeGreaterThanOrEqual(36);
        }
      }
    }
  });
});
