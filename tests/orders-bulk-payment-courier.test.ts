import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { orderRequiresCourier } from "../src/lib/order-fulfillment";
import { getStoredPaymentMethodPresentation } from "../src/lib/payment-method";

describe("orders list payment and courier rules", () => {
  it.each([
    ["delivery", true],
    ["Delivery", true],
    ["pickup", false],
    ["digital", false],
    [null, false],
  ])("requires a courier only for %s", (fulfillmentMethod, expected) => {
    expect(orderRequiresCourier({ fulfillment_method: fulfillmentMethod })).toBe(expected);
  });

  it.each([
    ["card", "paid", "delivery", "ar", "بطاقة"],
    ["benefit", "unpaid", "pickup", "ar", "بنفت"],
    ["cod", "unpaid", "delivery", "ar", "الدفع عند الاستلام"],
    ["card", "unpaid", "pickup", "en", "Card"],
    ["benefit", "paid", "delivery", "en", "Benefit"],
    ["cod", "paid", "pickup", "en", "Cash on Delivery"],
  ] as const)(
    "presents %s/%s/%s correctly in %s",
    (paymentMethod, _paymentStatus, fulfillmentMethod, lang, expected) => {
      expect(getStoredPaymentMethodPresentation(paymentMethod, lang).label).toBe(expected);
      expect(orderRequiresCourier({ fulfillment_method: fulfillmentMethod })).toBe(
        fulfillmentMethod === "delivery",
      );
    },
  );

  it("keeps the bulk delete operation brand-scoped and confirmation-driven", () => {
    const serverSource = readFileSync("src/lib/benefit-receipt.functions.ts", "utf8");
    const pageSource = readFileSync(
      "src/routes/_authenticated/admin.b.$slug.orders.index.tsx",
      "utf8",
    );
    expect(serverSource).toContain("deleteOrdersWithPrivateReceipts");
    expect(serverSource).toContain('.eq("brand_id", data.brandId)');
    expect(serverSource).toContain("enforceMutationSafeguard");
    expect(pageSource).toContain("bulkDeleteOpen");
    expect(pageSource).toContain("Confirm delete");
  });

  it("rejects courier assignment to non-delivery orders on the server", () => {
    const routeSource = readFileSync("src/routes/api.orders.status.ts", "utf8");
    expect(routeSource).toContain("orderRequiresCourier(order)");
    expect(routeSource).toContain("Couriers can only be assigned to delivery orders.");
  });

  it("updates a changed order in the list cache before reconciling with the server", () => {
    const routeSource = readFileSync("src/routes/api.orders.status.ts", "utf8");
    const pageSource = readFileSync(
      "src/routes/_authenticated/admin.b.$slug.orders.index.tsx",
      "utf8",
    );
    expect(routeSource).toContain("order: updatedOrder");
    expect(pageSource).toContain("qc.setQueriesData<any[]>");
    expect(pageSource).toContain('await qc.invalidateQueries({ queryKey: ["orders", brandId] })');
  });
});
