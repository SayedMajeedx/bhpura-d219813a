import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { orderItemFromRow } from "../src/features/orders/lib/order-editor";

// The shopper-facing message for the constraint is placeOrderFailure
// (tests/checkout-lib.test.ts).
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
  });
});
