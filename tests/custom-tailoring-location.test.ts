import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("custom tailoring order location", () => {
  const migration = readFileSync(
    "supabase/migrations/20260903213000_allow_custom_tailoring_order_location.sql",
    "utf8",
  );

  it("allows custom order lines", () => {
    expect(migration).toContain("location IN ('main', 'incubator', 'custom')");
  });

  it("excludes made-to-order lines from stock deduction", () => {
    expect(migration).toContain("AND COALESCE(location, 'main') IN ('main', 'incubator')");
    expect(migration).toContain("ELSIF v_location = 'main' THEN");
  });

  it("preserves custom location when an order is opened and saved", () => {
    const route = readFileSync("src/routes/_authenticated/admin.b.$slug.orders.$id.tsx", "utf8");
    expect(route).toContain('location: "main" | "incubator" | "custom"');
    expect(route.match(/i\.location === "custom"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("does not expose the database constraint name to shoppers", () => {
    const checkout = readFileSync("src/routes/$slug.checkout.tsx", "utf8");
    expect(checkout).toContain('msg.includes("order_items_location_check")');
    expect(checkout).toContain("تعذر تجهيز طلب التفصيل حالياً");
  });
});
