import { test, expect } from "@playwright/test";

test.describe("HeroV2 Video Fallback & Contrast Suite", () => {
  test("renders gracefully and does not collapse when video media fails to load", async ({
    page,
  }) => {
    // Abort video media requests to simulate CDN or network failure
    await page.route(/\.(mp4|webm|ogg)$/i, (route) => route.abort());

    await page.goto("/pura?preview=1&design=2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Verify hero container exists and maintains adequate height
    const heroSection = page.locator("section").first();
    await expect(heroSection).toBeVisible();

    const box = await heroSection.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(250);

    // Verify hero heading exists, is visible, and has text content
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    const text = await heading.innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test("ensures overlay scrim is present for text contrast protection", async ({ page }) => {
    await page.goto("/pura?preview=1&design=2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // Find heading inside hero
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();

    // Check that scrim or dark background styling protects contrast
    const hasScrimOrBg = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      if (!h1) return false;
      const section = h1.closest("section");
      if (!section) return false;
      const scrim = section.querySelector(
        '[class*="bg-black"], [class*="bg-gradient"], [class*="scrim"], [class*="opacity"]',
      );
      return !!scrim || window.getComputedStyle(section).backgroundColor !== "rgba(0, 0, 0, 0)";
    });

    expect(hasScrimOrBg).toBe(true);
  });
});
