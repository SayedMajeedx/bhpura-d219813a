import { test, expect } from "@playwright/test";
import {
  ANON_KEY,
  SLUG,
  SUPABASE_URL,
  fetchLiveProducts,
  guardWrites,
  inStock,
  type LiveProduct,
  type LiveVariant,
  waitForHydration,
} from "./helpers/storefront-e2e";

/**
 * Product page, end to end: pick an in-stock ready size and add it to the cart
 * on the live "pura" store. Writes are answered in the browser (see
 * helpers/storefront-e2e); the cart itself lives in localStorage.
 */

const distinct = (values: Array<string | null>) =>
  new Set(values.map((v) => (v ?? "").trim()).filter(Boolean)).size;

/**
 * A product whose in-stock variant is picked by its size alone: it has a size,
 * and the product has at most one colour and one fabric (those auto-select).
 */
async function findSizeOnlyProduct(): Promise<{
  product: LiveProduct;
  variant: LiveVariant;
} | null> {
  for (const product of await fetchLiveProducts()) {
    const variants = product.product_variants;
    if (distinct(variants.map((v) => v.color)) > 1) continue;
    if (distinct(variants.map((v) => v.fabric)) > 1) continue;
    // Plain sizes such as "54": word sizes may be translated on the English page.
    const variant = variants.find(
      (v) => inStock(v) && /^[\x20-\x7E]+$/.test((v.size ?? "").trim()),
    );
    if (!variant) continue;
    // The size must identify one variant.
    if (variants.filter((v) => v.size === variant.size).length !== 1) continue;
    return { product, variant };
  }
  return null;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("Product page add to cart", () => {
  test.skip(!SUPABASE_URL || !ANON_KEY, "Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");

  test("adds the chosen in-stock size to the cart", async ({ page }) => {
    test.setTimeout(120_000);
    const found = await findSizeOnlyProduct();
    test.skip(!found, "The store has no in-stock product selectable by size right now");
    const { product, variant } = found!;

    const guard = await guardWrites(page);
    await page.addInitScript((slug) => {
      window.localStorage.removeItem(`storefront-cart:${slug}`);
    }, SLUG);

    await page.goto(`/${SLUG}/product/${product.id}?lang=en`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 60_000 });
    const addToCart = page.locator("main button:visible", { hasText: "Add to cart" }).first();
    await waitForHydration(addToCart);

    // Made-to-order products offer "Ready Size" / "Custom Size"; the ready size is the stock item.
    const readySize = page.locator("main").getByRole("button", { name: "Ready Size" });
    if (await readySize.count()) await readySize.first().click();

    const sizeButton = page
      .locator("main")
      .getByRole("button", { name: new RegExp(`^${escapeRegExp(variant.size!.trim())}\\b`) })
      .first();
    await sizeButton.click();

    await expect(addToCart).toBeEnabled();
    await addToCart.click();

    // If the page refuses the item, fail with its own message.
    const refusal = page.locator('main [role="alert"], [data-sonner-toast][data-type="error"]');
    const refused = await refusal
      .first()
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (refused) {
      throw new Error(`Add to cart was refused: ${await refusal.first().innerText()}`);
    }

    const readCart = () =>
      page.evaluate(
        (key) => JSON.parse(window.localStorage.getItem(key) ?? "[]"),
        `storefront-cart:${SLUG}`,
      );
    try {
      await expect
        .poll(readCart, { timeout: 15_000 })
        .toEqual([
          expect.objectContaining({ variant_id: variant.id, product_id: product.id, qty: 1 }),
        ]);
    } catch (error) {
      // Show what the page offered, so a CI failure explains itself.
      const buttons = await page.locator("main button:visible").allInnerTexts();
      console.log("[product page e2e] size", variant.size, "variant", variant.id);
      console.log("[product page e2e] cart", JSON.stringify(await readCart()));
      console.log("[product page e2e] buttons", JSON.stringify(buttons.map((b) => b.trim())));
      throw error;
    }

    // Adding to the cart never places an order.
    expect(guard.orderPayloads).toHaveLength(0);
    console.log("[product page e2e] stubbed writes:", guard.stubbedWrites);
  });
});
