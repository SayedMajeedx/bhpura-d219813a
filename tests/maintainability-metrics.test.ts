import { describe, expect, it } from "vitest";
import { countDirectSupabaseCalls } from "../scripts/maintainability-metrics.mjs";

describe("direct Supabase call metric", () => {
  it("counts plain calls on every client", () => {
    expect(
      countDirectSupabaseCalls(`
        supabase.from("orders");
        supabaseAdmin.rpc("x");
        publicSupabase.from("products");
        supabase.auth.getUser();
      `),
    ).toBe(4);
  });

  it("counts calls behind a cast, on one line or split over two", () => {
    expect(
      countDirectSupabaseCalls(`
        (supabase as any).from("expenses");
        const { data } = await (supabase as any)
          .from("vendors")
          .select("*");
        (supabase as any).rpc("fn");
      `),
    ).toBe(3);
  });

  it("does not count data-layer helpers or other identifiers", () => {
    expect(
      countDirectSupabaseCalls(`
        fetchOrders(brandId);
        db.from("categories");
        const supabaseUrl = "x";
      `),
    ).toBe(0);
  });
});
