import { describe, expect, it } from "vitest";
import migration from "../supabase/migrations/20261024130000_page_data_product_details.sql?raw";
import previous from "../supabase/migrations/20261010120000_made_to_order_pause.sql?raw";

// The home page's products carry their facts (migration 20261024130000): the function is the one
// migration 20261010120000 left, with one key added, and nothing else changed.

/** A function's body, its whitespace folded. */
const body = (sql: string) => {
  const start = sql.indexOf("FUNCTION public.get_storefront_page_data(");
  const open = sql.indexOf("$function$", start);
  const close = sql.indexOf("$function$", open + 1);
  return sql
    .slice(open, close)
    .replace(/--[^\n]*\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
};

describe("the home page's products", () => {
  it("carry each product's facts", () => {
    expect(migration).toMatch(/'details', p\.details,/);
  });

  it("are otherwise built exactly as before", () => {
    expect(body(migration).replace(" 'details', p.details,", "")).toBe(body(previous));
  });

  it("keep the function's caller's view and grants", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_storefront_page_data\(p_brand_slug text\)/,
    );
    expect(migration).toMatch(/STABLE SECURITY DEFINER/);
    expect(migration).not.toMatch(/REVOKE|DROP FUNCTION/);
  });
});
