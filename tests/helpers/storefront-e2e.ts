import type { Page } from "@playwright/test";

/**
 * Shared set-up for storefront end-to-end specs that run against the live
 * "pura" store: a browser-side guard that answers every write, and a read-only
 * lookup of real products.
 */

export const SLUG = "pura";
export const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
export const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const FAKE_ORDER_ID = "00000000-0000-4000-8000-0000000e2e01";

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

export type WriteGuard = {
  orderPayloads: Array<Record<string, unknown>>;
  stubbedWrites: string[];
};

/**
 * Nothing the page does may write to the database:
 * - place_storefront_order returns FAKE_ORDER_ID and its payload is recorded;
 * - any other RPC not on the read-only list is stubbed (cart activity, loyalty
 *   points, WhatsApp opt-in, cart recovery, back-in-stock requests...);
 * - any non-GET request to Supabase REST, Storage or Edge Functions is stubbed.
 */
export async function guardWrites(page: Page): Promise<WriteGuard> {
  const guard: WriteGuard = { orderPayloads: [], stubbedWrites: [] };

  // Registered first, so it runs after the RPC handler below.
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

export type LiveVariant = {
  id: string;
  size: string | null;
  color: string | null;
  fabric: string | null;
  selling_price: number;
  stock_main: number | null;
  stock_incubator: number | null;
};

export type LiveProduct = {
  id: string;
  name: string;
  image_url: string | null;
  product_variants: LiveVariant[];
};

export const inStock = (v: LiveVariant) =>
  Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0) > 0;

/** The store's active products with their variants (read-only, same shape the storefront reads). */
export async function fetchLiveProducts(): Promise<LiveProduct[]> {
  const headers = { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` };
  const brandRes = await fetch(`${SUPABASE_URL}/rest/v1/brands?slug=eq.${SLUG}&select=id`, {
    headers,
  });
  const [brand] = (await brandRes.json()) as Array<{ id: string }>;
  if (!brand) return [];
  const query = new URLSearchParams({
    select:
      "id,name,image_url,product_variants(id,size,color,fabric,selling_price,stock_main,stock_incubator)",
    brand_id: `eq.${brand.id}`,
    is_active: "eq.true",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?${query}`, { headers });
  return (await res.json()) as LiveProduct[];
}
