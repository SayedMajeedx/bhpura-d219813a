import { beforeEach, describe, expect, it, vi } from "vitest";

// /{slug}/products.xml as the worker serves it: the store found by its slug, address or own
// domain, its catalog read whole, the store's currency and language, and no feed for a store that
// hides its prices.

type Row = Record<string, unknown>;
const rows: Record<string, Row[]> = {};
const filters: Array<[string, string, unknown]> = [];

function builder(table: string) {
  const own: Array<[string, unknown]> = [];
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ["select", "order", "limit", "not", "range"]) chain[method] = self;
  chain.eq = (column: string, value: unknown) => {
    own.push([column, value]);
    filters.push([table, column, value]);
    return chain;
  };
  const matching = () =>
    (rows[table] ?? []).filter((row) => own.every(([column, value]) => row[column] === value));
  chain.maybeSingle = async () => ({ data: matching()[0] ?? null, error: null });
  chain.then = (resolve: (value: unknown) => void) => {
    const data = matching();
    resolve({ data, error: null, count: data.length });
  };
  return chain;
}
const supabaseAdmin = { from: (table: string) => builder(table) };
vi.mock("../src/integrations/supabase/client.server", () => ({ supabaseAdmin }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

const { handleProductFeedRequest } = await import("../src/lib/seo/product-feed.server");

beforeEach(() => {
  filters.length = 0;
  rows.brands = [{ id: "b1", slug: "pura", is_active: true, custom_domain: "shop.pura.bh" }];
  rows.business_settings = [
    { brand_id: "b1", business_name: "Pura Line", currency: "BHD", storefront_mode: "shop" },
  ];
  rows.brand_addons = [];
  rows.products = [
    {
      id: "p1",
      brand_id: "b1",
      is_active: true,
      item_kind: "product",
      name: "عباية",
      name_en: "Abaya",
      image_url: "https://media.boutq.store/p1.jpg",
    },
  ];
  rows.product_variants = [
    { id: "v1", product_id: "p1", brand_id: "b1", size: "52", selling_price: 22, stock_main: 1 },
  ];
});

describe("the shopping feed's address", () => {
  it("serves the store named in the path, in Arabic by default", async () => {
    const res = await handleProductFeedRequest(
      new Request("https://boutq.store/pura/products.xml"),
      "pura",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(res.headers.get("cache-control")).toContain("max-age=600");
    const body = await res.text();
    expect(body).toContain("<title>عباية</title>");
    // Whatever address asked, the links are the store's main one (here its own domain).
    expect(body).toContain("<link>https://shop.pura.bh/pura/product/p1</link>");
    expect(body).toContain("<g:price>22.000 BHD</g:price>");
    // The catalog is read for this store only.
    expect(filters).toContainEqual(["product_variants", "brand_id", "b1"]);
  });

  it("serves a store on its own domain, in English when asked", async () => {
    const res = await handleProductFeedRequest(
      new Request("https://shop.pura.bh/products.xml?lang=en"),
    );
    const body = await res.text();
    expect(body).toContain("<title>Abaya</title>");
    expect(body).toContain("<link>https://shop.pura.bh/pura/product/p1</link>");
  });

  it("has no feed for a store that hides its prices, or for no store at all", async () => {
    rows.business_settings[0].storefront_mode = "catalog";
    rows.business_settings[0].catalog_show_prices = false;
    const hidden = await handleProductFeedRequest(
      new Request("https://boutq.store/pura/products.xml"),
      "pura",
    );
    expect(hidden.status).toBe(404);
    const missing = await handleProductFeedRequest(
      new Request("https://boutq.store/nobody/products.xml"),
      "nobody",
    );
    expect(missing.status).toBe(404);
  });
});
