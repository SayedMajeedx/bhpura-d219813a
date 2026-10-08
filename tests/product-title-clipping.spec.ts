import { test, expect } from "@playwright/test";

// A product card's title is clipped to one line, so its line box has to be tall enough for Arabic
// marks and letter tails below the baseline. A heading rule once gave every <h3> (cards included)
// a tight line-height with !important, and the bottoms of names like مَرجان were cut off. This
// checks what the browser really draws, on the live store, in Arabic.

test.describe("Product card titles", () => {
  for (const [label, viewport] of [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 900 }],
  ] as const) {
    test(`are not cut off at the bottom (${label})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/pura?lang=ar", { waitUntil: "domcontentloaded" });
      const titles = page.locator(".product-title");
      await expect(titles.first()).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(1000);

      const measured = await titles.evaluateAll((nodes) =>
        nodes
          .filter((node) => (node as HTMLElement).offsetParent !== null)
          .map((node) => {
            const element = node as HTMLElement;
            const style = getComputedStyle(element);
            const range = document.createRange();
            range.selectNodeContents(element);
            return {
              text: (element.textContent ?? "").trim().slice(0, 30),
              fontSize: parseFloat(style.fontSize),
              lineHeight: parseFloat(style.lineHeight),
              // How far the drawn text reaches below the box that clips it (0 or less: not cut).
              overflowBelow:
                range.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom,
            };
          }),
      );

      expect(measured.length).toBeGreaterThan(0);
      for (const title of measured) {
        expect(title.lineHeight, `${title.text}: line-height`).toBeGreaterThanOrEqual(
          title.fontSize * 1.6,
        );
        expect(title.overflowBelow, `${title.text}: text below its box`).toBeLessThanOrEqual(0.5);
      }
    });
  }
});
