import { test, expect } from "@playwright/test";
import {
  ANON_KEY,
  FAKE_ORDER_ID,
  SLUG,
  SUPABASE_URL,
  fetchLiveProducts,
  guardWrites,
  inStock,
  type LiveVariant,
} from "./helpers/storefront-e2e";

/**
 * Storefront checkout, end to end: a cart with a real in-stock product, the
 * checkout form, and a cash-on-delivery order, without writing anything.
 *
 * Like the other storefront specs this reads the live "pura" store (products,
 * settings, branches). Every write is intercepted in the browser:
 * - place_storefront_order returns a fake order id and its payload is checked;
 * - any other RPC that is not on the read-only list is stubbed (cart activity,
 *   loyalty points, WhatsApp opt-in, cart recovery...);
 * - any non-GET request to Supabase REST, Storage or Edge Functions is stubbed.
 */

type CartVariant = LiveVariant & {
  product_id: string;
  products: { name: string; image_url: string | null };
};

/** A live, in-stock variant of the store. */
async function findInStockVariant(): Promise<CartVariant | null> {
  // The store sells made-to-order abayas; their measurement fields are checked by
  // place_storefront_order, which this test answers itself.
  for (const product of await fetchLiveProducts()) {
    const variant = product.product_variants.find(inStock);
    if (variant) {
      return {
        ...variant,
        product_id: product.id,
        products: { name: product.name, image_url: product.image_url },
      };
    }
  }
  return null;
}

test.describe("Storefront checkout", () => {
  test.skip(!SUPABASE_URL || !ANON_KEY, "Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");

  test("places a cash-on-delivery order for a delivery address", async ({ page }) => {
    test.setTimeout(120_000);
    const variant = await findInStockVariant();
    test.skip(!variant, "The store has no in-stock variant right now");

    const guard = await guardWrites(page);
    await page.addInitScript(
      ({ slug, item }) => {
        window.localStorage.setItem(`storefront-cart:${slug}`, JSON.stringify([item]));
        for (const key of Object.keys(window.sessionStorage)) {
          if (key.startsWith("checkout_")) window.sessionStorage.removeItem(key);
        }
      },
      {
        slug: SLUG,
        item: {
          variant_id: variant!.id,
          product_id: variant!.product_id,
          name: variant!.products.name,
          image: variant!.products.image_url,
          price: Number(variant!.selling_price),
          size: variant!.size,
          color: variant!.color,
          fabric: variant!.fabric,
          qty: 1,
          custom_fields: [],
          max_stock: Number(variant!.stock_main ?? 0) + Number(variant!.stock_incubator ?? 0),
        },
      },
    );

    await page.goto(`/${SLUG}/checkout?lang=en`, { waitUntil: "domcontentloaded" });
    const placeOrder = page.locator("button:visible", { hasText: "Place order" }).first();
    await expect(placeOrder).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(variant!.products.name).first()).toBeVisible();

    await page.locator("#checkout-name").fill("E2E Test Shopper");
    await page.locator("#checkout-phone").fill("+97333000000");

    await page
      .getByRole("button", { name: /^Delivery/ })
      .first()
      .click();
    await page.locator("#checkout-region").click();
    await page.getByRole("option").first().click();
    await page.locator("#checkout-block").fill("321");
    await page.locator("#checkout-road").fill("123");
    await page.locator("#checkout-house").fill("45");

    await page.getByText("Cash on delivery", { exact: true }).first().click();
    await page.locator("label", { hasText: "I agree to the" }).getByRole("checkbox").click();

    await expect(placeOrder).toBeEnabled();
    await placeOrder.click();

    await page.waitForURL(`**/${SLUG}/thank-you/${FAKE_ORDER_ID}**`, { timeout: 30_000 });

    expect(guard.orderPayloads).toHaveLength(1);
    const payload = guard.orderPayloads[0];
    expect(payload).toMatchObject({
      p_brand_slug: SLUG,
      p_payment_method: "cod",
      p_fulfillment: "delivery",
      p_branch_id: null,
      p_customer: {
        name: "E2E Test Shopper",
        phone: "+97333000000",
        block: "321",
        road: "123",
        house: "45",
      },
    });
    const items = payload.p_items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ variant_id: variant!.id, quantity: 1 });
    // Only size, colour and fabric may travel with an order line (backlog #10).
    expect(Object.keys(items[0].selected_variant as object).sort()).toEqual([
      "color",
      "fabric",
      "size",
    ]);
    expect(typeof payload.p_idempotency_key).toBe("string");
    expect(Number(payload.p_shipping_fee)).toBeGreaterThanOrEqual(0);

    // Nothing reached the database: every write above was answered in the browser.
    console.log("[checkout e2e] stubbed writes:", guard.stubbedWrites);
    for (const write of guard.stubbedWrites) {
      expect(write).not.toContain("place_storefront_order");
    }
  });

  test("blocks the order until the required fields are filled", async ({ page }) => {
    test.setTimeout(120_000);
    const variant = await findInStockVariant();
    test.skip(!variant, "The store has no in-stock variant right now");

    const guard = await guardWrites(page);
    await page.addInitScript(
      ({ slug, item }) => {
        window.localStorage.setItem(`storefront-cart:${slug}`, JSON.stringify([item]));
      },
      {
        slug: SLUG,
        item: {
          variant_id: variant!.id,
          product_id: variant!.product_id,
          name: variant!.products.name,
          image: variant!.products.image_url,
          price: Number(variant!.selling_price),
          size: variant!.size,
          color: variant!.color,
          fabric: variant!.fabric,
          qty: 1,
          custom_fields: [],
          max_stock: 1,
        },
      },
    );

    await page.goto(`/${SLUG}/checkout?lang=en`, { waitUntil: "domcontentloaded" });
    const placeOrder = page.locator("button:visible", { hasText: "Place order" }).first();
    await expect(placeOrder).toBeVisible({ timeout: 60_000 });

    // Terms not accepted yet: the button stays disabled.
    await expect(placeOrder).toBeDisabled();

    // Terms accepted but no name or phone: submitting shows an error and places nothing.
    await page.locator("label", { hasText: "I agree to the" }).getByRole("checkbox").click();
    await placeOrder.click();
    await expect(page.getByText("Name and phone are required").first()).toBeVisible();
    expect(guard.orderPayloads).toHaveLength(0);
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/checkout`));
  });
});
