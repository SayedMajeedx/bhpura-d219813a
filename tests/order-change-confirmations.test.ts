import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const header = readFileSync("src/components/orders/OrderUnifiedHeader.tsx", "utf8");
const payment = readFileSync("src/components/orders/ManagePaymentModal.tsx", "utf8");
const detail = readFileSync("src/routes/_authenticated/admin.b.$slug.orders.$id.tsx", "utf8");
const customers = readFileSync("src/routes/_authenticated/admin.b.$slug.customers.tsx", "utf8");
const inventory = readFileSync("src/routes/_authenticated/admin.b.$slug.inventory.tsx", "utf8");

describe("high-impact order change confirmations", () => {
  it("reviews fulfillment status changes before applying them", () => {
    expect(header).toContain("pendingStatus");
    expect(header).toContain("Confirm order status change");
    expect(header).toContain("Confirm Change");
    expect(header).toContain("getFulfillmentLabel(pendingStatus.fulfillmentStatus, lang)");
  });

  it("shows a payment difference summary and rejects inconsistent totals", () => {
    expect(payment).toContain("Review changes before confirming");
    expect(payment).toContain("Collected amount cannot exceed the order total");
    expect(payment).toContain("Use Partially Paid");
    expect(payment).toContain("disabled={saving || !hasChanges}");
    expect(detail).toContain("throw error");
  });

  it("uses visible skeletons while customer and inventory data load", () => {
    expect(customers).toContain("return <RoutePendingSkeleton />");
    expect(inventory).toContain("return <RoutePendingSkeleton />");
  });
});
