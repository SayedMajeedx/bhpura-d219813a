import { beforeEach, describe, expect, it, vi } from "vitest";

// The product page's "Purchased N times" badge: the count comes from a database function that only
// answers at or above its threshold; the helper never rejects and never asks for a non-id.

const stubs = vi.hoisted(() => ({ rpc: vi.fn() }));
const client = { publicSupabase: { rpc: stubs.rpc }, supabase: { rpc: stubs.rpc } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const { getProductRecentPurchaseCount } = await import("../src/lib/storefront-social-proof");

const ID = "00000000-0000-4000-8000-000000000101";

beforeEach(() => {
  // (not an arrow returning the mock: a returned function would run as the test's clean-up)
  stubs.rpc.mockReset();
});

describe("getProductRecentPurchaseCount", () => {
  it("asks the database function by the store's slug and returns its number", async () => {
    stubs.rpc.mockResolvedValue({ data: 4, error: null });
    expect(await getProductRecentPurchaseCount("pura", ID)).toBe(4);
    expect(stubs.rpc).toHaveBeenCalledWith("get_product_recent_purchase_count", {
      p_brand_slug: "pura",
      p_product_id: ID,
    });
  });

  it("is null when the database has nothing to say, or fails", async () => {
    stubs.rpc.mockResolvedValue({ data: null, error: null });
    expect(await getProductRecentPurchaseCount("pura", ID)).toBeNull();
    stubs.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getProductRecentPurchaseCount("pura", ID)).toBeNull();
    stubs.rpc.mockImplementation(() => {
      throw new Error("network");
    });
    expect(await getProductRecentPurchaseCount("pura", ID)).toBeNull();
  });

  it("does not ask for an address that is not a product id, or without a store", async () => {
    expect(await getProductRecentPurchaseCount("pura", "black-abaya")).toBeNull();
    expect(await getProductRecentPurchaseCount("", ID)).toBeNull();
    expect(stubs.rpc).not.toHaveBeenCalled();
  });
});
