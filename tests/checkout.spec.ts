import { test, expect, type Page } from "@playwright/test";

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

const SLUG = "pura";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FAKE_ORDER_ID = "00000000-0000-4000-8000-0000000e2e01";

// RPCs the storefront may call that only read data. Anything else is stubbed.
const READ_ONLY_RPCS = new Set([
  "get_storefront_page_data",
  "get_storefront_trending",
  "get_storefront_best_sellers",
  "get_public_branches",
  "check_registered_customer_exists",
  "validate_promo_code",
  "has_storefront_membership",
]);

type WriteGuard = {
  orderPayloads: Array<Record<string, unknown>>;
  stubbedWrites: string[];
};

async function guardWrites(page: Page): Promise<WriteGuard> {
  const guard: WriteGuard = { orderPayloads: [], stubbedWrites: [] };

  // Registered first, so it runs after the RPC handler below: REST, Storage and
  // Edge Function writes never leave the browser.
  await page.route(/\/(rest|storage|functions)\/v1\//, async (route) => {
    const request = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.fallback();
    guard.stubbedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
    return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });

  await page.route("**/rest/v1/rpc/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/rpc/")[1] ?? "";
    if (name === "place_storefront_order") {
      guard.orderPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order_id: FAKE_ORDER_ID, confirmation_email_token: null }),
      });
    }
    if (READ_ONLY_RPCS.has(name)) return route.continue();
    guard.stubbedWrites.push(`rpc ${name}`);
    return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
  });

  return guard;
}

type LiveVariant = {
  id: string;
  product_id: string;
  size: string | null;
  color: string | null;
  fabric: string | null;
  selling_price: number;
  stock_main: number | null;
  stock_incubator: number | null;
  products: { name: string; image_url: string | null };
};

/** A live, in-stock variant of the store (read-only REST query). */
async function findInStockVariant(): Promise<LiveVariant | null> {
  const headers = { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` };
  const brandRes = await fetch(`${SUPABASE_URL}/rest/v1/brands?slug=eq.${SLUG}&select=id`, {
    headers,
  });
  const [brand] = (await brandRes.json()) as Array<{ id: string }>;
  if (!brand) return null;
  // Same shape the storefront reads (variants are only readable through products).
  const query = new URLSearchParams({
    select:
      "id,name,image_url,is_made_to_order,custom_fields,product_variants(id,size,color,fabric,selling_price,stock_main,stock_incubator)",
    brand_id: `eq.${brand.id}`,
    is_active: "eq.true",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?${query}`, { headers });
  const products = (await res.json()) as Array<{
    id: string;
    name: string;
    image_url: string | null;
    is_made_to_order: boolean | null;
    custom_fields: unknown[] | null;
    product_variants: Array<Omit<LiveVariant, "product_id" | "products">>;
  }>;
  // The store sells made-to-order abayas; their measurement fields are checked by
  // place_storefront_order, which this test answers itself.
  for (const product of products) {
    const variant = product.product_variants.find(
      (v) => Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0) > 0,
    );
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
