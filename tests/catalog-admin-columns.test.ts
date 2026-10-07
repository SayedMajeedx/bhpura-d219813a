import { describe, expect, it } from "vitest";
import typesSource from "../src/integrations/supabase/types.ts?raw";
import {
  ADMIN_PRODUCT_COLUMNS,
  ADMIN_VARIANT_COLUMNS,
  PRODUCT_COST_COLUMNS,
  VARIANT_COST_COLUMNS,
} from "../src/lib/data/catalog/selects";

// The admin screens ask the catalog tables for named columns (costs live in their own staff-only
// tables). A column added to `products` or `product_variants` and left out of those lists would be
// missing from every admin screen without any error, so the lists must equal the generated types.

function rowColumns(table: string): string[] {
  const start = typesSource.indexOf(`      ${table}: {\n        Row: {`);
  expect(start).toBeGreaterThan(-1);
  const end = typesSource.indexOf("        Insert:", start);
  return [...typesSource.slice(start, end).matchAll(/^ {10}(\w+):/gm)].map((m) => m[1]);
}

describe("the admin catalog column lists", () => {
  it("name every products column except the costs, and none that does not exist", () => {
    const expected = rowColumns("products").filter(
      (c) => !(PRODUCT_COST_COLUMNS as readonly string[]).includes(c),
    );
    expect([...ADMIN_PRODUCT_COLUMNS].sort()).toEqual(expected.sort());
  });

  it("name every product_variants column except the cost, and none that does not exist", () => {
    const expected = rowColumns("product_variants").filter(
      (c) => !(VARIANT_COST_COLUMNS as readonly string[]).includes(c),
    );
    expect([...ADMIN_VARIANT_COLUMNS].sort()).toEqual(expected.sort());
  });

  it("keep the cost columns out of the lists", () => {
    for (const c of PRODUCT_COST_COLUMNS) expect(ADMIN_PRODUCT_COLUMNS).not.toContain(c);
    for (const c of VARIANT_COST_COLUMNS) expect(ADMIN_VARIANT_COLUMNS).not.toContain(c);
  });
});
