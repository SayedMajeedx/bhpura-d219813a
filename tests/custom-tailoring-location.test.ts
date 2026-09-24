import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { orderItemFromRow } from "../src/features/orders/lib/order-editor";

// The order editor is split across its route and src/features/orders (Phase 5).
const orderDetailSource = () =>
  [
    "src/routes/_authenticated/admin.b.$slug.orders.$id.tsx",
    ...["actions", "components", "hooks", "lib"].flatMap((dir) =>
      readdirSync(`src/features/orders/${dir}`)
        .sort()
        .map((file) => `src/features/orders/${dir}/${file}`),
    ),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

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
    // The order editor loads rows through orderItemFromRow both on open and after save.
    expect(orderItemFromRow({ location: "custom" }).location).toBe("custom");
    expect(orderItemFromRow({ location: "incubator" }).location).toBe("incubator");
    expect(orderItemFromRow({ location: null }).location).toBe("main");
    const route = orderDetailSource();
    expect(route.match(/map\(orderItemFromRow\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("does not expose the database constraint name to shoppers", () => {
    const checkout = readFileSync("src/routes/$slug.checkout.tsx", "utf8");
    expect(checkout).toContain('msg.includes("order_items_location_check")');
    expect(checkout).toContain("تعذر تجهيز الطلب المخصص حالياً");
  });
});
