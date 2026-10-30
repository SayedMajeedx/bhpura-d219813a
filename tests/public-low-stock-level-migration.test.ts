import { describe, expect, it } from "vitest";
import migration from "../supabase/migrations/20261030100000_public_low_stock_level.sql?raw";
import previousView from "../supabase/migrations/20261027160000_order_number_format.sql?raw";

// The store's low-stock level reaches the product page (migration 20261030100000) through the
// public settings view, which the page data function hands the storefront whole. The line it
// decides is tested in product-page-calm.

/** The columns a view's SELECT names (`bs.x`, `b.x`), in order. */
const viewColumns = (sql: string) => {
  const body = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW public.brand_public_settings"));
  return [...body.slice(0, body.indexOf(" FROM ")).matchAll(/\b(?:bs|b)\.([a-z_0-9]+)/g)].map(
    (match) => match[1],
  );
};

describe("the public low-stock level's migration", () => {
  it("keeps every column the public view had, in order, and adds the level at its end", () => {
    const before = viewColumns(previousView);
    expect(before.length).toBeGreaterThan(100);
    expect(viewColumns(migration)).toEqual([...before, "low_stock_threshold"]);
    expect(migration).toMatch(/WHERE b\.is_active = true;/);
    expect(migration).toMatch(
      /GRANT SELECT ON public\.brand_public_settings TO anon, authenticated, service_role;/,
    );
  });

  it("writes no store's settings and adds no column", () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.business_settings/i);
    expect(migration).not.toMatch(/ALTER TABLE/i);
  });
});
