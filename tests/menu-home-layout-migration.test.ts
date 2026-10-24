import { describe, expect, it } from "vitest";
import migration from "../supabase/migrations/20261023140000_storefront_home_layout.sql?raw";
import previousView from "../supabase/migrations/20261023130000_product_card_photo_shape.sql?raw";

// A store's home layout (migration 20261023140000): the column, and the public view that carries
// it to the storefront. The picker and the pages are tested in settings-home-page and
// menu-home-page.

/** The columns a view's SELECT names (`bs.x`, `b.x`), in order. */
const viewColumns = (sql: string) => {
  const body = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW public.brand_public_settings"));
  return [...body.slice(0, body.indexOf(" FROM ")).matchAll(/\b(?:bs|b)\.([a-z_0-9]+)/g)].map(
    (match) => match[1],
  );
};

describe("the home layout's migration", () => {
  it("adds a column that holds a known layout or nothing, and writes no store's", () => {
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS storefront_home_layout text[\s\S]*CHECK \(storefront_home_layout IS NULL OR storefront_home_layout IN \('shop', 'menu'\)\)/,
    );
    expect(migration).not.toMatch(/UPDATE\s+public\.business_settings/i);
  });

  it("keeps every column the public view had, in order, and adds the layout at its end", () => {
    const before = viewColumns(previousView);
    const after = viewColumns(migration);
    expect(before.length).toBeGreaterThan(100);
    expect(after).toEqual([...before, "storefront_home_layout"]);
    expect(migration).toMatch(/WHERE b\.is_active = true;/);
    expect(migration).toMatch(
      /GRANT SELECT ON public\.brand_public_settings TO anon, authenticated, service_role;/,
    );
  });
});
